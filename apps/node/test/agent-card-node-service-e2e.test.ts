/**
 * E2E: NodeServiceImpl.requestAgentCard → peer responds → listAgentCards (US-AV5 / 13C).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireProductionAgentCardHandlers,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

describe("E2E requestAgentCard via NodeServiceImpl (Phase 13C)", () => {
  it("caches peer agent card after production-style agent.card exchange", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    const aliceBridge = await ensureBridgeIdentity(alice);
    const bobBridge = await ensureBridgeIdentity(bob);
    wireProductionAgentCardHandlers(alice, aliceBridge);
    wireProductionAgentCardHandlers(bob, bobBridge);

    await bob.human.saveHumanProfile({
      displayName: "Bob Human",
      bio: "",
      hobbies: [],
      knowledge: [],
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);

    const requested = await alice.service.requestAgentCard(bob.profile.owner.ownerId);
    expect(requested.ok).toBe(true);

    await waitForPhase13(async () => {
      const cards = await alice.service.listAgentCards();
      return cards.some((row) => row.ownerId === bob.profile.owner.ownerId);
    }, 8000);

    const cards = await alice.service.listAgentCards();
    const bobCard = cards.find((row) => row.ownerId === bob.profile.owner.ownerId);
    expect(bobCard?.displayName).toBe("Bob Human");
    expect(bobCard?.capabilities.length).toBeGreaterThan(0);

    const activity = await alice.service.listAgentActivity({ limit: 20 });
    expect(activity.some((row) => row.summary.includes("Learned agent card"))).toBe(true);
  });
});
