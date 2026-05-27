/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { MobileNode } from "../src/index.js";
import { createInMemoryDb, mobileStorageSchema } from "@envoymesh/mobile-storage";
import {
  createAgentCardResponsePayload,
  createAgentCard,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
} from "@envoymesh/mobile-identity";

describe("MobileNode audit drill-down", () => {
  it("listAuditEvents and listTaskJournalEntries return persisted inbound A2A rows", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }
    const node = new MobileNode({ profileDir: "/mobile-audit-test", relayUrls: [], database: db });
    await node.initStandalone("/mobile-audit-test");

    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({ owner, agent, scope: ["message.send", "task.execute"] });
    const card = createAgentCard({
      ownerId: owner.ownerId,
      displayName: "Peer agent",
      nodeProfile: "primary",
      capabilities: ["task.execute"],
    });
    const responsePayload = createAgentCardResponsePayload(card);
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: agent.agentPeerId,
        senderPublicKey: agent.publicKeyPem,
        senderRole: "agent",
        intent: "agent.card.response",
        payload: responsePayload,
        agentCredential: credential,
      }),
      signature: "sig",
    };

    const trust = (node as unknown as { _trustStore: { set: (r: unknown) => Promise<void> } })._trustStore;
    await trust.set({
      peerOwnerId: owner.ownerId,
      level: "direct",
      createdAt: new Date().toISOString(),
    });

    await (
      node as unknown as {
        _handleInboundAgentCard: (msg: Record<string, unknown>, remotePeerId: string) => Promise<void>;
      }
    )._handleInboundAgentCard(envelope as unknown as Record<string, unknown>, agent.agentPeerId);

    const audits = await node.listAuditEvents({ limit: 10 });
    expect(audits.some((row) => row.intent === "agent.card.response")).toBe(true);

    const journalEntry = {
      eventId: "journal-mobile-1",
      taskId: "task-mobile-1",
      eventType: "proposed" as const,
      summary: "Mobile task proposed",
      createdAt: new Date().toISOString(),
      mandateId: "mandate-mobile-1",
    };
    await node.recordInboundTaskActivity(journalEntry, {
      messageId: "msg-1",
      correlationId: "corr-mobile-1",
      senderPeerId: agent.agentPeerId,
      senderRole: "agent",
    });

    const journal = await node.listTaskJournalEntries({ taskId: "task-mobile-1" });
    expect(journal).toHaveLength(1);
    expect(journal[0]?.summary).toBe("Mobile task proposed");

    const cards = await node.listAgentCards();
    expect(cards.some((row) => row.ownerId === owner.ownerId)).toBe(true);
  });
});
