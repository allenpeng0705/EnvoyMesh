/**
 * Phase A2 E2E — strictDialPolicy connection gater.
 *
 * Proves the optional `strictDialPolicy` blocks outbound dials to peers NOT in
 * the allow-set, at the libp2p layer (before a connection opens). This is
 * defense-in-depth for quietWan: even if some path (bootstrap, identify)
 * introduces an anonymous peer, the gater refuses the dial.
 *
 *   RUN_E2E=1 npx vitest run apps/node/test/strict-dial-policy-e2e.test.ts
 *
 * Topology: two meshes A and B. A has strictDialPolicy ON with an allow-set
 * containing only itself (no other peers). Attempting to dial B from A must
 * fail because B is not in the allow-set.
 */
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";

const meshes: EnvoyMesh[] = [];

async function startMesh(options: ConstructorParameters<typeof EnvoyMesh>[0]): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh(options);
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

describe("E2E strictDialPolicy (A2)", () => {
  afterEach(async () => {
    for (const m of meshes.splice(0)) {
      try {
        await m.stop();
      } catch {
        /* ignore */
      }
    }
  });

  it("blocks outbound dial to a peer not in the allow-set", async () => {
    // Target node B (any reachable peer).
    const b = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
    });
    const bAddr = b.multiaddrs.find((a) => a.includes("/tcp/") && a.includes("/p2p/"));
    expect(bAddr).toBeTruthy();

    // Node A with strictDialPolicy ON, allow-set contains ONLY A's own peer id
    // (so B is not permitted). The gater should refuse the dial to B.
    const a = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
      strictDialPolicy: true,
      allowedDialPeerIds: () => new Set([a?.peerId ?? "self-only"]),
    });

    // Attempting to dial B should fail (gater denies the peer).
    // The dial throws because denyDialPeer returns true for B.
    await expect(a.dial(bAddr!)).rejects.toThrow();

    // Sanity: A and B are NOT connected.
    const aStats = a.getConnectionStats();
    expect(aStats.connectedPeerIds).not.toContain(b.peerId);
  }, 30_000);

  it("allows outbound dial to a peer in the allow-set", async () => {
    const b = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
    });
    const bAddr = b.multiaddrs.find((a) => a.includes("/tcp/") && a.includes("/p2p/"));

    // allow-set includes B's peer id → dial must succeed.
    const a = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
      strictDialPolicy: true,
      allowedDialPeerIds: () => new Set([b.peerId]),
    });

    await expect(a.dial(bAddr!)).resolves.toBeDefined();
    const aStats = a.getConnectionStats();
    expect(aStats.connectedPeerIds).toContain(b.peerId);
  }, 30_000);

  it("allows all dials when allow-set is empty (gater effectively disabled)", async () => {
    const b = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
    });
    const bAddr = b.multiaddrs.find((a) => a.includes("/tcp/") && a.includes("/p2p/"));

    // strictDialPolicy ON but allow-set empty → gater returns false (allow all).
    const a = await startMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableDht: false,
      enableMdns: false,
      enableRelay: false,
      strictDialPolicy: true,
      allowedDialPeerIds: () => new Set(),
    });

    await expect(a.dial(bAddr!)).resolves.toBeDefined();
  }, 30_000);
});
