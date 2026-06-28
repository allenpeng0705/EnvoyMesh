/**
 * Networking E2E test — verifies two nodes can start and connect.
 *
 * Creates two EnvoyMesh instances on loopback, establishes a direct
 * libp2p connection, and verifies the connection succeeds.
 *
 * Run: npx vitest run apps/node/test/networking-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";

const meshes: EnvoyMesh[] = [];

afterAll(async () => {
  for (const m of meshes) {
    try { await m.stop(); } catch { /* ignore */ }
  }
});

describe("networking e2e", () => {
  let alice: EnvoyMesh;
  let bob: EnvoyMesh;

  beforeAll(async () => {
    alice = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/40261"],
      enableCircuitRelayTransport: false,
      enableMdns: false,
      enableDht: false,
      enableRelay: false,
      enableAutoNat: false,
      enableDcutr: false,
      enableQuic: false,
      allowLoopbackPeers: true,
    });
    bob = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/40262"],
      enableCircuitRelayTransport: false,
      enableMdns: false,
      enableDht: false,
      enableRelay: false,
      enableAutoNat: false,
      enableDcutr: false,
      enableQuic: false,
      allowLoopbackPeers: true,
    });
    meshes.push(alice, bob);
    await alice.start();
    await bob.start();
    console.log(`[e2e] alice.peerId=${alice.peerId} bob.peerId=${bob.peerId}`);
  }, 20_000);

  it("both nodes start with valid peer IDs", () => {
    expect(alice.peerId).toBeTruthy();
    expect(bob.peerId).toBeTruthy();
    expect(alice.peerId).not.toBe(bob.peerId);
  });

  it("alice can dial bob", async () => {
    const bobAddr = `/ip4/127.0.0.1/tcp/40262/p2p/${bob.peerId}`;
    const result = await alice.ensurePeerReachable(
      bob.peerId,
      "/envoymesh/message/0.1.0",
      { dialHints: [bobAddr], forceFreshDial: true },
    );
    console.log(`[e2e] dial result: connected=${result.connected} direct=${result.direct}`);
    expect(result.connected).toBe(true);
  }, 15_000);
});
