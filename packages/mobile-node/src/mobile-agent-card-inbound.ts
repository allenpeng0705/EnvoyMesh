import { evaluatePolicy } from "@envoymesh/bonds";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  parseAgentCardRequestPayload,
  parseAgentCardResponsePayload,
  type AgentCard,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { MobileAgentCardStore, MobileAuditJournalStore, MobileTrustStore } from "@envoymesh/mobile-storage";

export type MobileAgentCardInboundResult =
  | { ok: true; action: "cached"; ownerId: string; card: AgentCard }
  | { ok: true; action: "respond"; responsePayload: ReturnType<typeof createAgentCardResponsePayload> }
  | { ok: false; reason: string };

export async function handleMobileInboundAgentCardIntent(input: {
  envelope: EnvoyEnvelope;
  ownerId: string;
  deviceId: string;
  displayName: string;
  nodeProfile: "primary" | "satellite" | "full" | "relay";
  /** Device / mesh membership rights advertised on the local Agent Card. */
  membership: string[];
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  trustStore: MobileTrustStore;
  agentCardStore: MobileAgentCardStore;
  auditJournal: MobileAuditJournalStore;
}): Promise<MobileAgentCardInboundResult> {
  const {
    envelope,
    ownerId,
    deviceId: _deviceId,
    displayName,
    nodeProfile,
    membership,
    remotePeerId,
    receivedAt: _receivedAt,
    correlationId,
    trustStore,
    agentCardStore,
    auditJournal,
  } = input;

  const senderOwnerId = envelope.agentCredential?.ownerId;
  const bondLevel = senderOwnerId
    ? ((await trustStore.get(senderOwnerId))?.level ?? "public")
    : "public";

  const policy = evaluatePolicy({
    peerId: remotePeerId,
    bondLevel,
    intent: envelope.intent,
    requestedSensitivity: "public",
  });

  await auditJournal.append({
    eventId: crypto.randomUUID(),
    type: policy.action === "deny" ? "message.rejected" : "message.verified",
    intent: envelope.intent,
    correlationId,
    remotePeerId,
    direction: "inbound",
    outcome: policy.action === "deny" ? "deny" : "allow",
    summary:
      policy.action === "deny"
        ? `Rejected ${envelope.intent}: ${policy.reason}`
        : `Verified ${envelope.intent}.`,
    createdAt: envelope.createdAt,
  });

  if (policy.action === "deny") {
    return { ok: false, reason: policy.reason ?? "policy denied" };
  }

  if (envelope.intent === "agent.card.response") {
    const payload = parseAgentCardResponsePayload(envelope.payload);
    const cardOwnerId = payload.card.ownerId;
    await agentCardStore.upsert({
      ownerId: cardOwnerId,
      cardJson: JSON.stringify(payload.card),
      cachedAt: envelope.createdAt,
      sourceAgentPeerId: envelope.senderPeerId,
    });
    return { ok: true, action: "cached", ownerId: cardOwnerId, card: payload.card };
  }

  if (envelope.intent === "agent.card.request") {
    parseAgentCardRequestPayload(envelope.payload);
    const card = createAgentCard({
      ownerId,
      displayName,
      nodeProfile,
      membership,
      publicTopics: [],
    });
    return {
      ok: true,
      action: "respond",
      responsePayload: createAgentCardResponsePayload(card),
    };
  }

  return { ok: false, reason: "not an agent.card intent" };
}
