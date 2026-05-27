import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createMultiHopDiscoveryStore,
} from "@envoymesh/local-store";
import { NodeDiscoveryRuntime } from "../src/node-service-discovery.js";

describe("NodeDiscoveryRuntime", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("getMorningReport returns [] when task store is unavailable", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => undefined,
      requireMesh: () => {
        throw new Error("no mesh");
      },
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: undefined,
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: createMultiHopDiscoveryStore(profileDir),
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
    });

    await expect(runtime.getMorningReport({ limit: 5 })).resolves.toEqual([]);
  });

  it("getMultiHopDiscoverySession reads persisted session", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-runtime-"));
    const store = createMultiHopDiscoveryStore(profileDir);
    await store.upsertSession({
      correlationId: "corr-abc",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bondsQueried: 1,
      pendingForwardApprovals: 1,
      awaitingHop2ViaBonds: ["envoy:owner:bob"],
      matches: [],
    });
    const runtime = new NodeDiscoveryRuntime({
      getProfile: () => undefined,
      requireProfile: () => {
        throw new Error("no profile");
      },
      getMesh: () => undefined,
      requireMesh: () => {
        throw new Error("no mesh");
      },
      getReachableMesh: () => undefined,
      trustStore: createLocalTrustStore(profileDir),
      peerDirectoryStore: createLocalPeerDirectoryStore(profileDir),
      configStore: { load: async () => undefined } as never,
      taskStore: createLocalTaskStore(profileDir),
      discoverySeedStore: undefined,
      contactOwnerKeyStore: null,
      multihopDiscoveryStore: store,
      getApprovalQueue: () => null,
      resolvePeerTransportForOwner: async () => ({
        transportPeerId: "peer-1",
        recipientEnvelopePeerId: "envoy_peer",
        listenAddrs: [],
      }),
      dialHintsForChat: async () => [],
      emitMultiHopUpdate: () => undefined,
    });

    const session = await runtime.getMultiHopDiscoverySession("corr-abc");
    expect(session?.correlationId).toBe("corr-abc");
    expect(session?.pendingForwardApprovals).toBe(1);
  });
});
