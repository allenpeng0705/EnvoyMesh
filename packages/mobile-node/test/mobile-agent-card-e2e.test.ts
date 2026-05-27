/**
 * @vitest-environment jsdom
 * Mobile agent.card inbound → SQLite cache + Activity (public handler + MobileNode API).
 */
import { describe, expect, it } from "vitest";
import { MobileNode } from "../src/index.js";
import { handleMobileInboundAgentCardIntent } from "../src/mobile-agent-card-inbound.js";
import {
  createInMemoryDb,
  createMobileAgentCardStore,
  createMobileAuditJournalStore,
  createMobileTrustStore,
  mobileStorageSchema,
} from "@envoymesh/mobile-storage";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
} from "@envoymesh/mobile-identity";

describe("Mobile agent.card E2E (Phase 13C)", () => {
  it("caches peer card via handleMobileInboundAgentCardIntent and exposes listAgentCards", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }

    const trustStore = createMobileTrustStore(db);
    const agentCardStore = createMobileAgentCardStore(db);
    const auditJournal = createMobileAuditJournalStore(db);

    const localOwner = generateOwnerIdentity();
    const peerOwner = generateOwnerIdentity();
    const peerAgent = generateAgentIdentity(peerOwner.ownerId);
    const credential = createAgentCredential({
      owner: peerOwner,
      agent: peerAgent,
      scope: ["message.send", "task.execute", "agent.card.response"],
    });

    await trustStore.set({
      peerOwnerId: peerOwner.ownerId,
      level: "direct",
      createdAt: new Date().toISOString(),
    });

    const card = createAgentCard({
      ownerId: peerOwner.ownerId,
      displayName: "Bob's Envoy Agent",
      nodeProfile: "primary",
      capabilities: ["task.execute", "knowledge.query"],
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: peerAgent.agentPeerId,
      senderPublicKey: peerAgent.publicKeyPem,
      senderRole: "agent",
      intent: "agent.card.response",
      payload: createAgentCardResponsePayload(card),
      agentCredential: credential,
    });
    const signed = signUnsignedEnvelope(unsigned, peerAgent.privateKeyPem);
    const envelope: EnvoyEnvelope = signed;

    const result = await handleMobileInboundAgentCardIntent({
      envelope,
      ownerId: localOwner.ownerId,
      deviceId: "envoy:device:mobile-test",
      displayName: "Alice Mobile",
      nodeProfile: "primary",
      capabilities: ["message.send", "task.execute"],
      remotePeerId: peerAgent.agentPeerId,
      receivedAt: Date.now(),
      correlationId: "corr-mobile-card",
      trustStore,
      agentCardStore,
      auditJournal,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "cached") {
      throw new Error("expected cached card");
    }
    expect(result.ownerId).toBe(peerOwner.ownerId);

    const cached = await agentCardStore.get(peerOwner.ownerId);
    expect(cached?.ownerId).toBe(peerOwner.ownerId);
    expect(JSON.parse(cached!.cardJson).displayName).toBe("Bob's Envoy Agent");

    const audits = await auditJournal.list({ limit: 10 });
    expect(audits.some((row) => row.intent === "agent.card.response")).toBe(true);
  });

  it("recordAgentCardCached publishes Activity row on MobileNode", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }
    const node = new MobileNode({ profileDir: "/mobile-card-activity", relayUrls: [], database: db });
    await node.initStandalone("/mobile-card-activity");

    const peerOwner = generateOwnerIdentity();
    const card = createAgentCard({
      ownerId: peerOwner.ownerId,
      displayName: "Peer Agent",
      nodeProfile: "primary",
      capabilities: ["task.execute"],
    });

    await node.recordAgentCardCached(peerOwner.ownerId, card);

    const activity = await node.listAgentActivity({ limit: 10 });
    expect(activity.some((row) => row.summary.includes("Peer Agent"))).toBe(true);
  });
});
