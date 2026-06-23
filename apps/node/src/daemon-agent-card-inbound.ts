import {
  createAuditEvent,
  type AgentCardStore,
  type HumanProfileStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { signUnsignedEnvelope } from "@envoymesh/identity";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { ENVOY_MESSAGE_PROTOCOL, type EnvoyMesh } from "@envoymesh/network";
import { sendEnvelopeWithRetry } from "./chat-outbound-deliver.js";
import { handleInboundAgentCardIntent } from "./agent-card-inbound.js";
import type { BridgeIdentity } from "./bridge/pipe.js";
import type { NodeServiceImpl } from "./node-service-impl.js";

export type DaemonAgentCardInboundResult =
  | { handled: false }
  | { handled: true; outcome: "denied" | "responded" | "cached"; ownerId?: string };

/** Production agent.card path shared by the node daemon and integration tests. */
export async function handleDaemonAgentCardInbound(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  trustStore: LocalTrustStore;
  agentCardStore: AgentCardStore;
  humanProfileStore: HumanProfileStore;
  bridgeIdentity: BridgeIdentity | null;
  mesh: EnvoyMesh;
  nodeService?: NodeServiceImpl | null;
}): Promise<DaemonAgentCardInboundResult> {
  const { envelope } = input;
  if (envelope.intent !== "agent.card.request" && envelope.intent !== "agent.card.response") {
    return { handled: false };
  }

  if (!input.bridgeIdentity) {
    console.warn(`[agent.card] ignored ${envelope.intent}: bridge identity unavailable`);
    return { handled: true, outcome: "denied" };
  }

  const cardResult = await handleInboundAgentCardIntent({
    envelope,
    profile: input.profile,
    remotePeerId: input.remotePeerId,
    receivedAt: input.receivedAt,
    correlationId: input.correlationId,
    taskStore: input.taskStore,
    trustStore: input.trustStore,
    agentCardStore: input.agentCardStore,
    humanProfileStore: input.humanProfileStore,
    bridgeIdentity: input.bridgeIdentity,
  });

  if (!cardResult.ok) {
    console.warn(`[agent.card] ${envelope.intent} denied: ${cardResult.reason}`);
    return { handled: true, outcome: "denied" };
  }

  if (cardResult.action === "respond") {
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: input.bridgeIdentity.agentPeerId,
      senderPublicKey: input.bridgeIdentity.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: envelope.senderPeerId,
      recipientRole: "agent",
      intent: "agent.card.response",
      payload: cardResult.responsePayload,
      correlationId: input.correlationId,
      agentCredential: input.bridgeIdentity.agentCredential,
    });
    const signedResponse = signUnsignedEnvelope(unsignedResponse, input.bridgeIdentity.agentPrivateKeyPem);
    await sendEnvelopeWithRetry({
      mesh: input.mesh,
      transportPeerId: input.remotePeerId,
      envelope: signedResponse,
      dialHints: [`/p2p/${input.remotePeerId}`],
    });
    await input.taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.sent",
        intent: signedResponse.intent,
        messageId: signedResponse.messageId,
        correlationId: signedResponse.correlationId,
        remotePeerId: input.remotePeerId,
        direction: "outbound",
        protocol: ENVOY_MESSAGE_PROTOCOL,
        outcome: "record",
        summary: `Sent agent.card.response for ${envelope.messageId}.`,
        createdAt: signedResponse.createdAt,
      }),
    );
    return { handled: true, outcome: "responded" };
  }

  if (cardResult.action === "cached") {
    console.log(`[agent.card] cached card for ${cardResult.ownerId}`);
    if (input.nodeService) {
      void input.nodeService.recordAgentCardCached(cardResult.ownerId, cardResult.card).catch((err) =>
        console.warn(`[agent.card] activity hook failed:`, err),
      );
    }
    return { handled: true, outcome: "cached", ownerId: cardResult.ownerId };
  }

  return { handled: true, outcome: "denied" };
}
