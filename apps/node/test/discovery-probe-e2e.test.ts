/**
 * E2E tests for the discovery → probe pipeline using real libp2p nodes.
 *
 * Validates the full flow:
 *   handleMeshPeerDiscovered → peer:discovered placeholder → background probe
 *   → peer:discovered with real displayName (EnvoyMesh peer)
 *
 * Uses `createPhase13TestNode` + `connectPhase13Peers` for real mesh nodes.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { signHumanProfile } from "@envoymesh/identity";
import {
  createPhase13TestNode,
  connectPhase13Peers,
  registerBondedPeer,
  cleanupPhase13Harness,
  waitForPhase13,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import { wireNodeServiceInboundHandlers } from "./phase13-e2e-harness.js";

/**
 * Save a properly signed human profile onto a phase13 test node so that
 * inbound `profile.request` probes get a valid `profile.response`.
 */
async function seedHumanProfile(
  node: Phase13TestNode,
  displayName: string,
  username: string,
): Promise<void> {
  const signed = signHumanProfile(
    {
      version: "0.1",
      ownerId: node.profile.owner.ownerId,
      displayName,
      username,
      bio: "",
      hobbies: [],
      knowledge: [],
      profileVisibility: "public",
      updatedAt: new Date().toISOString(),
    },
    node.profile.owner.privateKeyPem,
  );
  await node.human.saveHumanProfile(signed);
}

describe("discovery probe E2E", () => {
  let alice: Phase13TestNode;
  let bob: Phase13TestNode;

  beforeAll(async () => {
    alice = await createPhase13TestNode();
    bob = await createPhase13TestNode();

    // Wire inbound handlers so profile.request/response messages flow.
    wireNodeServiceInboundHandlers(alice);
    wireNodeServiceInboundHandlers(bob);

    // Save signed human profiles so profile.request probes get responses.
    await seedHumanProfile(alice, "Alice", "alice");
    await seedHumanProfile(bob, "Bob", "bob");

    // Connect peers at the libp2p layer and register as bonded contacts.
    await connectPhase13Peers(alice, bob);
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
  }, 60_000);

  afterAll(async () => {
    await cleanupPhase13Harness();
  }, 30_000);

  it("two bonded EnvoyMesh nodes: discovery → placeholder → enriched peer:discovered", async () => {
    // Listen for peer:discovered events on Alice's service.
    const discoveredEvents: Array<{ nodeId: string; displayName: string; ownerId: string }> = [];
    const unsubDiscover = alice.service.on("peer:discovered", (data: any) => {
      discoveredEvents.push({
        nodeId: data.nodeId,
        displayName: data.displayName,
        ownerId: data.ownerId,
      });
    });

    // Trigger discovery via the public method on the service — this calls
    // handleMeshPeerDiscoveredViaRuntime internally, which emits a
    // placeholder immediately and fires a background probe.
    await alice.service.handleMeshPeerDiscovered(
      bob.mesh.peerId,
      bob.mesh.multiaddrs.map(String),
    );

    // Wait for the placeholder to appear (should be near-instant).
    await waitForPhase13(
      () =>
        discoveredEvents.some((e) => e.nodeId === bob.mesh.peerId),
      10_000,
    );

    // There should be at least a placeholder (empty displayName).
    const placeholder = discoveredEvents.find(
      (e) => e.nodeId === bob.mesh.peerId && e.displayName === "",
    );
    expect(placeholder).toBeDefined();

    // Wait for the enriched event (probe succeeds because Bob is a real
    // EnvoyMesh node with a saved, signed human profile).
    await waitForPhase13(
      () =>
        discoveredEvents.some(
          (e) => e.nodeId === bob.mesh.peerId && e.displayName === "Bob",
        ),
      15_000,
    );

    const enriched = discoveredEvents.find(
      (e) => e.nodeId === bob.mesh.peerId && e.displayName === "Bob",
    );
    expect(enriched).toBeDefined();
    expect(enriched!.ownerId).toBe(bob.profile.owner.ownerId);

    unsubDiscover();
  }, 30_000);
});
