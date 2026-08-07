/**
 * LAN Auto-Bond → Agent Network setup E2E (libp2p loopback).
 *
 * Does **not** require real multicast mDNS (Phase13 harness disables it).
 * Instead it exercises the same hooks production uses after discovery:
 *   - `maybeFireLanAutoBondForDiscoveredPeer` (= `_maybeFireLanAutoBond`)
 *   - `handleLanAutoBondInbound` (shared with daemon `index.ts`)
 *
 * Filter: `lan-auto-bond-agent-network-e2e`
 * Run: `RUN_E2E=1 npx vitest run apps/node/test/lan-auto-bond-agent-network-e2e.test.ts`
 */

import { afterEach, describe, expect, it } from "vitest";
import { verifyInboundEnvelope } from "@envoymesh/identity";
import { isAgentNetworkMember } from "@envoymesh/api";
import { handleLanAutoBondInbound } from "../src/node-service-lan-auto-bond.js";
import {
  cleanupPhase13Harness,
  cleanupPhase13Node,
  connectPhase13Peers,
  createPhase13TestNode,
  ensureBridgeIdentity,
  waitForPhase13,
  wireProductionAgentCardHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

const RUN = process.env.RUN_E2E === "1";
const describeE2e = RUN ? describe.sequential : describe.skip;

const FLEET_TOKEN = "office-lan-e2e-token-abcdef";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
  await cleanupPhase13Harness();
});

/**
 * Production-shared accept path (same helper as `apps/node/src/index.ts`).
 * Uses the node's config store via getNodeConfig (lan fields are mapped).
 */
function wireLanAutoBondInbound(node: Phase13TestNode): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId, remoteAddr }) => {
    if (envelope.intent !== "device.pair.request") return;
    if (!verifyInboundEnvelope(envelope)) return;

    const deps = {
      taskStore: node.taskStore,
      loadConfig: () => node.service.getNodeConfig(),
      sendPairRequest: async () => ({ ok: true }),
      getLocalIdentity: () => ({
        ownerId: node.profile.owner.ownerId,
        deviceId: node.profile.device.deviceId,
        devicePublicKeyPem: node.profile.device.publicKeyPem,
      }),
      getOwnOwnerId: () => node.profile.owner.ownerId,
      enableCapabilityProvider: async () => {
        await node.service.updateNodeConfig({ capabilityProviderEnabled: true });
      },
    };

    await handleLanAutoBondInbound({
      deps,
      envelope,
      remotePeerId,
      remoteAddr,
      trustStore: node.trustStore,
      peerDirectory: node.peerDirectory,
      onAccepted: async ({ payload }) => {
        node.service.emit("bond:established", {
          peerOwnerId: payload.requesterOwnerId,
          displayName: "Fleet peer",
        });
      },
    });
  });
}

describeE2e("E2E LAN auto-bond → Agent Network membership", () => {
  it("Office LAN config enables Join + LAN auto-bond + shared token", async () => {
    const home = await createPhase13TestNode();
    nodes.push(home);

    await home.service.updateNodeConfig({
      capabilityProviderEnabled: true,
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: FLEET_TOKEN,
      lanAutoBondAutoJoinAgentNetwork: true,
    });

    const cfg = await home.service.getNodeConfig();
    expect(cfg.capabilityProviderEnabled).toBe(true);
    expect(cfg.lanAutoBondEnabled).toBe(true);
    expect(cfg.lanAutoBondFleetToken).toBe(FLEET_TOKEN);
    expect(cfg.lanAutoBondAutoJoinAgentNetwork).not.toBe(false);
  });

  it("discovery fire → shared inbound accept → auto-join → AN worker card", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    // Create bridge identities before Join/refresh so announce cannot race
    // creating bridge-identity.json under a tearing-down profile.
    const aliceBridge = await ensureBridgeIdentity(alice);
    const bobBridge = await ensureBridgeIdentity(bob);
    wireProductionAgentCardHandlers(alice, aliceBridge);
    wireProductionAgentCardHandlers(bob, bobBridge);

    for (const node of [alice, bob]) {
      await node.service.updateNodeConfig({
        lanAutoBondEnabled: true,
        lanAutoBondFleetToken: FLEET_TOKEN,
        lanAutoBondAutoJoinAgentNetwork: true,
        capabilityProviderEnabled: false,
      });
    }

    wireLanAutoBondInbound(bob);
    await connectPhase13Peers(alice, bob);

    // Same hook mDNS / nearby-profile probe uses after discovery.
    await alice.service.maybeFireLanAutoBondForDiscoveredPeer(bob.mesh.peerId);

    await waitForPhase13(async () => {
      const trust = await bob.trustStore.getTrustRecord(alice.profile.owner.ownerId);
      return trust?.level === "direct";
    }, 10_000);

    await waitForPhase13(async () => {
      const cfg = await bob.service.getNodeConfig();
      return cfg.capabilityProviderEnabled === true;
    }, 10_000);

    // Reciprocal directory + trust so card request can resolve transport.
    await alice.trustStore.setTrustRecord({
      peerOwnerId: bob.profile.owner.ownerId,
      level: "direct",
      displayName: "Bob",
      note: "lan-auto-bond-e2e-reciprocal",
    });
    await alice.peerDirectory.ensurePeerFromInboundChat({
      ownerId: bob.profile.owner.ownerId,
      peerId: bob.mesh.peerId,
      listenAddrs: bob.mesh.multiaddrs.map(String),
    });
    await bob.peerDirectory.ensurePeerFromInboundChat({
      ownerId: alice.profile.owner.ownerId,
      peerId: alice.mesh.peerId,
      listenAddrs: alice.mesh.multiaddrs.map(String),
    });

    await alice.service.updateNodeConfig({ capabilityProviderEnabled: true });

    await alice.service.updateNodeConfig({
      agentNetworkProfile: {
        modelFreshness: 4,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["research"],
      },
    });
    await bob.service.updateNodeConfig({
      agentNetworkProfile: {
        modelFreshness: 4,
        spendPosture: "subscription",
        contextWindow: "128k",
        skills: ["coding"],
      },
    });

    const card = await alice.service.requestAgentCard(bob.profile.owner.ownerId);
    expect(card.ok).toBe(true);

    await waitForPhase13(async () => {
      const cards = await alice.service.listAgentCards();
      const bobCard = cards.find((c) => c.ownerId === bob.profile.owner.ownerId);
      return Boolean(bobCard && isAgentNetworkMember(bobCard.membership));
    }, 15_000);

    await alice.service.refreshAgentNetworkMembershipIndex();
    const cards = await alice.service.listAgentCards();
    const bobCard = cards.find((c) => c.ownerId === bob.profile.owner.ownerId);
    expect(bobCard).toBeTruthy();
    expect(isAgentNetworkMember(bobCard!.membership)).toBe(true);
    const skillIds = (bobCard!.agentNetworkProfile?.skills ?? []).map((s) =>
      typeof s === "string" ? s : s.id,
    );
    expect(skillIds).toContain("coding");
  });

  it("rejects LAN auto-bond when fleet tokens differ (via discovery fire)", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    nodes.push(alice, bob);

    await alice.service.updateNodeConfig({
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "token-alice-xxxxxxxx",
    });
    await bob.service.updateNodeConfig({
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "token-bob-yyyyyyyyyy",
      capabilityProviderEnabled: false,
    });

    wireLanAutoBondInbound(bob);
    await connectPhase13Peers(alice, bob);

    await alice.service.maybeFireLanAutoBondForDiscoveredPeer(bob.mesh.peerId);

    await new Promise((r) => setTimeout(r, 500));
    const trust = await bob.trustStore.getTrustRecord(alice.profile.owner.ownerId);
    expect(trust?.level === "direct").toBe(false);
    const cfg = await bob.service.getNodeConfig();
    expect(cfg.capabilityProviderEnabled).toBe(false);
  });
});
