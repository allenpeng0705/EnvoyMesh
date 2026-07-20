import { evaluatePolicy } from "@envoymesh/bonds";
import {
  createAuditEvent,
  type AgentCardStore,
  type HumanProfileStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createAgentCard,
  createAgentCardResponsePayload,
  parseAgentCardRequestPayload,
  parseAgentCardResponsePayload,
  type AgentCard,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { BridgeIdentity } from "./bridge/pipe.js";
import { interestTopicFor, publishTopicFor } from "./capability-discovery.js";
import { createWebContentStore } from "./web-content-store.js";
import { join } from "node:path";

export type AgentCardInboundResult =
  | { ok: true; action: "cached"; ownerId: string; card: AgentCard }
  | { ok: true; action: "respond"; responsePayload: ReturnType<typeof createAgentCardResponsePayload> }
  | { ok: false; reason: string };

function resolveSenderOwnerId(envelope: EnvoyEnvelope): string | undefined {
  return envelope.agentCredential?.ownerId;
}

async function buildPublicTopics(input: {
  hobbies?: readonly string[] | null;
  knowledge?: readonly string[] | null;
  profileDir?: string;
}): Promise<string[]> {
  const topics: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    if (!t || seen.has(t)) return;
    seen.add(t);
    topics.push(t);
  };
  for (const raw of [...(input.hobbies ?? []), ...(input.knowledge ?? [])]) {
    add(interestTopicFor(raw));
  }
  if (input.profileDir) {
    try {
      const manifest = await createWebContentStore(join(input.profileDir, "web")).load();
      for (const entry of manifest.entries) {
        for (const tag of entry.tags ?? []) {
          add(publishTopicFor(tag));
        }
      }
    } catch {
      // ignore — card still works without web tags
    }
  }
  return topics.slice(0, 32);
}

export async function handleInboundAgentCardIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  agentCardStore: AgentCardStore;
  humanProfileStore: HumanProfileStore;
  bridgeIdentity: BridgeIdentity;
  /** Optional profile dir — used to load published web tags for publicTopics (45E). */
  profileDir?: string;
}): Promise<AgentCardInboundResult> {
  const {
    envelope,
    profile,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    agentCardStore,
    humanProfileStore,
    bridgeIdentity,
  } = input;

  const senderOwnerId = resolveSenderOwnerId(envelope);
  const bondLevel = senderOwnerId
    ? ((await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public")
    : "public";

  const policy = evaluatePolicy({
    peerId: remotePeerId,
    bondLevel,
    intent: envelope.intent,
    requestedSensitivity: "public",
  });

  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: policy.action === "deny" ? "message.rejected" : "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: policy.action === "deny" ? "rejected" : "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: policy.action === "deny" ? "deny" : "allow",
      summary:
        policy.action === "deny"
          ? `Rejected ${envelope.intent}: ${policy.reason}`
          : `Verified ${envelope.intent}.`,
      createdAt: envelope.createdAt,
    }),
  );

  if (policy.action === "deny") {
    return { ok: false, reason: policy.reason ?? "policy denied" };
  }

  if (envelope.intent === "agent.card.response") {
    const payload = parseAgentCardResponsePayload(envelope.payload);
    const ownerId = payload.card.ownerId;
    await agentCardStore.upsert({
      ownerId,
      card: payload.card,
      cachedAt: envelope.createdAt,
      sourceAgentPeerId: envelope.senderPeerId,
    });
    return { ok: true, action: "cached", ownerId, card: payload.card };
  }

  if (envelope.intent === "agent.card.request") {
    parseAgentCardRequestPayload(envelope.payload);
    const human = await humanProfileStore.loadHumanProfile().catch(() => null);
    const ownerId = profile.owner.ownerId;
    const publicTopics = await buildPublicTopics({
      hobbies: human?.hobbies,
      knowledge: human?.knowledge,
      profileDir: input.profileDir,
    });
    const card = createAgentCard({
      ownerId,
      displayName: human?.displayName ?? ownerId,
      nodeProfile: profile.deviceCertificate.deviceProfile,
      capabilities: profile.deviceCertificate.capabilities ?? ["message.send", "task.execute"],
      publicTopics,
      webContentRoot: `envoy://${ownerId}/`,
    });
    return {
      ok: true,
      action: "respond",
      responsePayload: createAgentCardResponsePayload(card),
    };
  }

  return { ok: false, reason: "not an agent.card intent" };
}
