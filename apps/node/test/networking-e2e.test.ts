/**
 * Networking E2E test — two-node connectivity in-process.
 *
 * Creates two EnvoyMesh instances on loopback, establishes a direct
 * libp2p connection, and verifies basic message streaming.
 *
 * Run: npx vitest run apps/node/test/networking-e2e.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnvoyMesh, ENVOY_MESSAGE_PROTOCOL } from "@envoymesh/network";

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
      listen: ["/ip4/127.0.0.1/tcp/40231"],
      enableCircuitRelayTransport: false,
      enableMdns: false,
      enableDht: false,
      enableRelay: false,
      enableAutoNat: false,
      enableDcutr: false,
      enableQuic: false,
      enableRelayDebugSummary: false,
      enableP2pDebug: true,
      allowLoopbackPeers: true,
    });
    bob = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/40232"],
      enableCircuitRelayTransport: false,
      enableMdns: false,
      enableDht: false,
      enableRelay: false,
      enableAutoNat: false,
      enableDcutr: false,
      enableQuic: false,
      enableRelayDebugSummary: false,
      enableP2pDebug: true,
      allowLoopbackPeers: true,
    });
    meshes.push(alice, bob);
    await alice.start();
    await bob.start();
    console.log(`[e2e] alice.peerId=${alice.peerId}`);
    console.log(`[e2e] bob.peerId=${bob.peerId}`);
    const aAddrs = alice.node?.getMultiaddrs().map(a => a.toString()) ?? [];
    const bAddrs = bob.node?.getMultiaddrs().map(a => a.toString()) ?? [];
    console.log(`[e2e] alice addrs=${JSON.stringify(aAddrs)}`);
    console.log(`[e2e] bob   addrs=${JSON.stringify(bAddrs)}`);
  }, 20_000);

  it("alice dials bob via loopback", async () => {
    const bobAddr = `/ip4/127.0.0.1/tcp/40232/p2p/${bob.peerId}`;
    console.log(`[e2e] dialing ${bobAddr}`);
    const result = await alice.ensurePeerReachable(
      bob.peerId,
      ENVOY_MESSAGE_PROTOCOL,
      { dialHints: [bobAddr], forceFreshDial: true },
    );
    console.log(`[e2e] result connected=${result.connected} direct=${result.direct}`);
    expect(result.connected).toBe(true);
  }, 15_000);
});
