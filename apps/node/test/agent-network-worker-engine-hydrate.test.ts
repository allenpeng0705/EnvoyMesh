/**
 * AN worker engine cache must load from disk at start — not only via getNodeConfig.
 */
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createDefaultPersistedNodeConfig } from "../src/node-config-store.js";

describe("hydrateAgentNetworkWorkerEngineFromDisk", () => {
  let profileDir: string;
  let vaultDir: string;

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(vaultDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("loads ext engine from node-config without getNodeConfig", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "an-engine-"));
    vaultDir = await mkdtemp(join(tmpdir(), "an-engine-vault-"));
    await mkdir(vaultDir, { recursive: true });
    const cfg = {
      ...createDefaultPersistedNodeConfig(profileDir),
      agentNetworkWorkerEngine: "ext" as const,
      bridgeEnabled: false,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(profileDir, "node-config.json"), JSON.stringify(cfg, null, 2), "utf8");

    const svc = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      undefined,
      vaultDir,
    );

    expect(svc.getAgentNetworkWorkerEngine()).toBe("openclaw");

    await svc.hydrateAgentNetworkWorkerEngineFromDisk();

    expect(svc.getAgentNetworkWorkerEngine()).toBe("ext");
    // bridgeEnabled false → Ext AN not ready even if a URL were present later
    expect(svc.isExtAgentBridgeReady()).toBe(false);
  });
});

