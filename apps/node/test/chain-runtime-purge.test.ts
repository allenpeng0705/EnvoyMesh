/**
 * Chain runtime memory purge after cancel without active tracker.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createChainState } from "../src/chain-orchestrator.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";

function sampleMandate(chainId: string) {
  return {
    version: "0.1" as const,
    chainMandateId: "cm_test",
    chainId,
    issuerOwnerId: "owner_a",
    orchestratorOwnerId: "owner_a",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public" as const,
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    createdAt: new Date().toISOString(),
    rebalancePolicy: "auto" as const,
    maxAutoRebalances: 2,
    autoRebalanceIncrementUsd: 5,
    signature: "stub",
  };
}

describe("chain runtime purge", () => {
  let tmpDir: string;
  let svc: NodeServiceImpl;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "chain-purge-"));
    svc = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(tmpDir),
      createLocalPeerDirectoryStore(tmpDir),
      createHumanProfileStore(tmpDir),
      tmpDir,
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("purges chain runtime immediately when cancel has no active tracker", async () => {
    const chainId = "chain_purge_now";
    const runtime = {
      state: createChainState(sampleMandate(chainId)),
      bidStrategy: {
        baseCostUsd: 1,
        capabilityLocalEtaMs: 60_000,
        reputationDiscount: 1,
        etaSlackMs: 60_000,
      },
    };
    (svc as unknown as { chainRuntime: Map<string, unknown> }).chainRuntime.set(chainId, runtime);

    const before = await svc.chainGetState({ chainId });
    expect(before.chainMandateId).toBe("cm_test");

    const cancelled = await svc.chainCancel({ chainId });
    expect(cancelled.cancelled).toEqual([]);

    const after = await svc.chainGetState({ chainId });
    expect(after.chainMandateId).toBe("");
    expect(after.subtaskCount).toBe(0);

    const active = await svc.chainListActive();
    expect(active.chains).toHaveLength(0);
  });

  it("retains chain runtime briefly when cancel stops an active tracker", async () => {
    const chainId = "chain_purge_deferred";
    const runtime = {
      state: createChainState(sampleMandate(chainId)),
      bidStrategy: {
        baseCostUsd: 1,
        capabilityLocalEtaMs: 60_000,
        reputationDiscount: 1,
        etaSlackMs: 60_000,
      },
    };
    const internal = svc as unknown as {
      chainRuntime: Map<string, unknown>;
      _chainTrackAbort: Map<string, AbortController>;
    };
    internal.chainRuntime.set(chainId, runtime);
    internal._chainTrackAbort.set(chainId, new AbortController());

    await svc.chainCancel({ chainId });
    expect(internal.chainRuntime.has(chainId)).toBe(true);

    internal._chainTrackAbort.delete(chainId);
    (svc as unknown as { _purgeChainRuntime(chainId: string): void })._purgeChainRuntime(chainId);
    expect(internal.chainRuntime.has(chainId)).toBe(false);
  });
});
