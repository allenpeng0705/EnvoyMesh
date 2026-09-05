import { describe, expect, it, vi } from "vitest";
import { generateEd25519KeyPair } from "@envoymesh/identity";
import { ensureFleetWorkersReadyViaRuntime, type EnsureFleetWorkersDeps } from "../src/ensure-fleet-workers.js";

function makeDeps(overrides: Partial<EnsureFleetWorkersDeps> = {}): EnsureFleetWorkersDeps & {
  sendEnvelope: ReturnType<typeof vi.fn>;
  enableJoin: ReturnType<typeof vi.fn>;
} {
  const sendEnvelope = vi.fn(async () => undefined);
  const enableJoin = vi.fn(async () => undefined);
  return {
    getOwnOwnerId: () => "envoy:owner:me",
    getNodeConfig: async () => ({ capabilityProviderEnabled: true }),
    enableJoin,
    ensureLeaseBroadcaster: async () => ({ publishNow: async () => undefined }),
    refreshAgentNetworkWorkers: async () => ({ requested: 1, failed: 0 }),
    getBonds: async () => [],
    ensureAgentIdentity: async () => {
      const keys = generateEd25519KeyPair();
      return {
        agentPeerId: "envoy_agent_me",
        agentPublicKeyPem: keys.publicKeyPem,
        agentPrivateKeyPem: keys.privateKeyPem,
      };
    },
    resolveLibp2pPeer: async () => ({ peerId: "12D3KooWPeer" }),
    dialHintsFor: async () => ["/ip4/127.0.0.1/tcp/1"],
    sendEnvelope,
    ...overrides,
    sendEnvelope: overrides.sendEnvelope ?? sendEnvelope,
    enableJoin: overrides.enableJoin ?? enableJoin,
  };
}

describe("ensureFleetWorkersReadyViaRuntime", () => {
  it("skips public and blocked strangers — no lease request", async () => {
    const deps = makeDeps({
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:stranger", displayName: "Cafe", level: "public" },
        { peerOwnerId: "envoy:owner:blocked", displayName: "Nope", level: "blocked" },
      ],
    });
    const result = await ensureFleetWorkersReadyViaRuntime(deps);
    expect(deps.sendEnvelope).not.toHaveBeenCalled();
    expect(result.peers.map((p) => p.actions[0])).toEqual(["skipped_public", "skipped_blocked"]);
  });

  it("sends lease.request to a direct bonded peer", async () => {
    const deps = makeDeps({
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:bob", displayName: "Bob", level: "direct" },
      ],
    });
    const result = await ensureFleetWorkersReadyViaRuntime(deps);
    expect(deps.sendEnvelope).toHaveBeenCalledTimes(1);
    const sent = result.peers.find((p) => p.ownerId === "envoy:owner:bob");
    expect(sent?.ok).toBe(true);
    expect(sent?.actions).toContain("lease_request_sent");
  });

  it("enables local Join when off", async () => {
    const deps = makeDeps({
      getNodeConfig: async () => ({ capabilityProviderEnabled: false }),
      getBonds: async () => [],
    });
    const result = await ensureFleetWorkersReadyViaRuntime(deps);
    expect(deps.enableJoin).toHaveBeenCalledTimes(1);
    expect(result.localJoinEnabled).toBe(true);
    expect(result.peers.some((p) => p.actions.includes("join_local"))).toBe(true);
  });

  it("filters to requested ownerIds", async () => {
    const deps = makeDeps({
      getBonds: async () => [
        { peerOwnerId: "envoy:owner:bob", level: "direct" },
        { peerOwnerId: "envoy:owner:cara", level: "direct" },
      ],
    });
    await ensureFleetWorkersReadyViaRuntime(deps, { ownerIds: ["envoy:owner:cara"] });
    expect(deps.sendEnvelope).toHaveBeenCalledTimes(1);
  });
});
