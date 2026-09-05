/**
 * Phase 65B — long-running iteration lease pause + round cap units.
 */
import { describe, expect, it } from "vitest";
import {
  CHAIN_ITERATION_MAX_ROUNDS,
  createAgentWorkerLeasePayload,
} from "@envoymesh/protocol";
import {
  canStartNextRound,
  createIterationState,
  fromIterationWireBlob,
  toIterationWireBlob,
} from "../src/chain-iteration.js";
import {
  applyLeasePauseState,
  openAwardsWithDeadLeases,
} from "../src/chain-iteration-lease.js";
import { WorkerLeaseStore } from "../src/worker-lease-store.js";
import type { ChainState } from "../src/chain-orchestrator.js";

describe("Phase 65B iteration round cap", () => {
  it("exports CHAIN_ITERATION_MAX_ROUNDS = 48", () => {
    expect(CHAIN_ITERATION_MAX_ROUNDS).toBe(48);
  });

  it("createIterationState clamps above the hard cap", () => {
    const it = createIterationState({
      goal: "long job",
      maxRounds: 999,
      openRoundSubtaskIds: ["a"],
    });
    expect(it.maxRounds).toBe(48);
  });

  it("wire blob round-trips pausedForLease and high maxRounds", () => {
    const it = createIterationState({
      goal: "long job",
      maxRounds: 24,
      openRoundSubtaskIds: ["a"],
    });
    it.pausedForLease = true;
    const wire = toIterationWireBlob(it);
    expect(wire.maxRounds).toBe(24);
    expect(wire.pausedForLease).toBe(true);
    const back = fromIterationWireBlob(wire);
    expect(back.maxRounds).toBe(24);
    expect(back.pausedForLease).toBe(true);
  });
});

describe("Phase 65B lease pause", () => {
  function fakeState(workerPeerId: string): ChainState {
    return {
      awards: new Map([["sub_a", { workerPeerId }]]),
      cancelledSubtasks: new Set(),
      partials: new Map(),
      iteration: createIterationState({
        goal: "g",
        maxRounds: 4,
        openRoundSubtaskIds: ["sub_a"],
      }),
    } as unknown as ChainState;
  }

  it("flags revoked leases and sets pausedForLease", () => {
    const store = new WorkerLeaseStore();
    const peer = "envoy_worker_abc";
    const state = fakeState(peer);
    expect(openAwardsWithDeadLeases(state, store)).toEqual([]);

    const now = Date.now();
    const lease = createAgentWorkerLeasePayload({
      leaseId: "lease_1",
      workerPeerId: peer,
      ownerId: "envoy:owner:abc",
      issuedAt: new Date(now).toISOString(),
      notBefore: new Date(now).toISOString(),
      expiresAt: new Date(now + 30_000).toISOString(),
      sequence: 1,
      runtimes: [
        {
          runtime: "envoy-harness",
          ready: true,
          capacity: { maxConcurrent: 2, availableSlots: 1, queueDepth: 0 },
          skillIds: ["research"],
        },
      ],
      connectivity: { direct: true, relay: false },
      nonce: "0123456789abcdef",
      signature: "stub",
    });
    expect(store.accept(lease).ok).toBe(true);
    expect(openAwardsWithDeadLeases(state, store)).toEqual([]);

    expect(store.revoke({ workerPeerId: peer, leaseId: "lease_1", sequence: 1 }).ok).toBe(true);
    const dead = openAwardsWithDeadLeases(state, store);
    expect(dead).toEqual([
      { subtaskId: "sub_a", workerPeerId: peer, leaseState: "revoked" },
    ]);

    const applied = applyLeasePauseState(state, dead);
    expect(applied.changed).toBe(true);
    expect(applied.paused).toBe(true);
    expect(state.iteration?.pausedForLease).toBe(true);
    const gate = canStartNextRound(state);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("lease_stale");
  });

  it("clears pause when no dead leases remain", () => {
    const state = fakeState("12D3KooW-ok");
    state.iteration!.pausedForLease = true;
    state.iteration!.stopReason = "lease_stale";
    const cleared = applyLeasePauseState(state, []);
    expect(cleared.changed).toBe(true);
    expect(cleared.paused).toBe(false);
    expect(state.iteration?.pausedForLease).toBe(false);
  });
});

describe("Phase 65B checkpoint restores iteration across ChainStore restart", () => {
  it("persists maxRounds=24 and pausedForLease through init", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createChainState } = await import("../src/chain-orchestrator.js");
    const { ChainStore } = await import("../src/node-service-chains.js");

    const dir = await mkdtemp(join(tmpdir(), "chain-iter-65b-"));
    try {
      const first = new ChainStore();
      await first.init(dir);
      const state = createChainState(
        {
          version: "0.1",
          chainMandateId: "chainmandate_65b",
          chainId: "chain_65b",
          issuerOwnerId: "envoy:owner:a",
          orchestratorOwnerId: "envoy:owner:a",
          maxChainCostUsd: 20,
          costCeilingUsd: 5,
          maxWorkers: 3,
          allowDepth3: true,
          allowDepth4: false,
          maxSensitivity: "public",
          deadlineAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2030-01-01T00:00:00.000Z",
          signature: "stub",
        } as never,
        { goal: "long running" },
      );
      state.iteration = createIterationState({
        goal: "long running",
        maxRounds: 24,
        openRoundSubtaskIds: ["s1"],
      });
      state.iteration.waitingForOwner = true;
      state.iteration.drafts.push({
        round: 1,
        summary: "draft one",
        judge: { decision: "ask_owner", reason: "owner" },
      });
      state.verifyOnlyBlockedSubtasks.add("blocked-sub");
      state.hedgeSchedule.set("hedge-sub", {
        primaryAward: {
          subtaskId: "hedge-sub",
          workerPeerId: "w1",
          acceptedCostUsd: 1,
          createdAt: "2030-01-01T00:00:00.000Z",
        } as never,
        hedgeAfterMs: 1000,
        scheduledAtMs: 1,
      });
      first.setRuntime(state.chainId, {
        state,
        bidStrategy: {
          baseCostUsd: 1,
          capabilityLocalEtaMs: 60_000,
          reputationDiscount: 1,
          etaSlackMs: 60_000,
        },
      });
      await first.persistNow();
      first.close();

      const second = new ChainStore();
      await second.init(dir);
      const restoredRt = second.getRuntime("chain_65b");
      const restored = restoredRt?.state.iteration;
      expect(restored?.maxRounds).toBe(24);
      expect(restored?.waitingForOwner).toBe(true);
      expect(restored?.drafts).toHaveLength(1);
      expect(restored?.drafts[0]?.summary).toBe("draft one");
      expect(restoredRt?.state.verifyOnlyBlockedSubtasks.has("blocked-sub")).toBe(true);
      expect(restoredRt?.state.hedgeSchedule.has("hedge-sub")).toBe(true);
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
