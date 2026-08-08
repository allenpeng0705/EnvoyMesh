/**
 * Multi-home Agent Network roles E2E (libp2p).
 *
 * Asserts collaboration roles ride the Agent Card to peers.
 * Role-mode plan+assign (exact / substitute / warnings) is covered by
 * unit tests in chain-plan-assign.test.ts + mock-plan-assign.test.ts.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  waitForPhase13,
  wireNodeServiceInboundHandlers,
  wireProductionAgentCardHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

describe.sequential("E2E Agent Network collaboration roles on Agent Card", () => {
  it("announces primary role to a bonded peer", async () => {
    const homeA = await createPhase13TestNode();
    const homeB = await createPhase13TestNode();
    nodes.push(homeA, homeB);

    const bridgeA = await ensureBridgeIdentity(homeA);
    const bridgeB = await ensureBridgeIdentity(homeB);
    wireProductionAgentCardHandlers(homeA, bridgeA);
    wireProductionAgentCardHandlers(homeB, bridgeB);
    wireNodeServiceInboundHandlers(homeA);
    wireNodeServiceInboundHandlers(homeB);

    await registerBondedPeer(homeA, homeB, "Bob");
    await registerBondedPeer(homeB, homeA, "Alice");

    await homeB.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      agentNetworkProfile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "256k",
        skills: ["coding"],
        roles: ["programmer"],
        throughputTokensPerSec: 50,
      },
    });
    await homeB.service.updateCapabilityManifest({
      membership: ["task.execute", "agent-network-worker"],
    });

    await homeA.mesh.probePeer(homeB.mesh.multiaddrs[0]!);
    await homeB.mesh.probePeer(homeA.mesh.multiaddrs[0]!);

    const card = await homeA.service.requestAgentCard(homeB.profile.owner.ownerId);
    expect(card.ok).toBe(true);

    await waitForPhase13(async () => {
      const cards = await homeA.service.listAgentCards();
      return cards.some(
        (row) =>
          row.ownerId === homeB.profile.owner.ownerId &&
          row.agentNetworkProfile?.roles?.[0] === "programmer",
      );
    }, 20_000);

    const cached = (await homeA.service.listAgentCards()).find(
      (c) => c.ownerId === homeB.profile.owner.ownerId,
    );
    expect(cached?.agentNetworkProfile?.roles).toEqual(["programmer"]);
    expect(cached?.agentNetworkProfile?.skills?.some((s) =>
      typeof s === "string" ? s === "coding" : s.id === "coding",
    )).toBe(true);
  }, 60_000);
});
