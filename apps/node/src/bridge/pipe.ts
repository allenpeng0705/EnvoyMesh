import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { createChatMessagePayload } from "@envoymesh/protocol";
import { signCanonicalPayload } from "@envoymesh/identity";
import type { BridgeConfig } from "./config.js";

export interface BridgeIdentity {
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  ownerId: string;
}

export interface BridgeDeps {
  config: BridgeConfig;
  identity: BridgeIdentity;
  sendChat: (peerId: string, envelope: EnvoyEnvelope) => Promise<void>;
  /** Resolve an ownerId or peerId to the current libp2p peer ID (for routing replies). */
  getRecipientPeerId: (ownerOrPeerId: string) => Promise<string | null>;
}

export interface P2PMessage {
  senderPeerId: string;
  senderOwnerId: string;
  senderDisplayName?: string;
  text: string;
}

export interface AgentResponse {
  to: string; // ownerId or peerId to reply to
  text: string;
}

/**
 * Forward an inbound P2P chat.message to the external agent via HTTP.
 */
export async function forwardToAgent(
  config: BridgeConfig,
  msg: P2PMessage,
): Promise<string | null> {
  const body = JSON.stringify({
    from: msg.senderPeerId,
    fromOwnerId: msg.senderOwnerId,
    fromName: msg.senderDisplayName ?? msg.senderOwnerId,
    text: msg.text,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.secret) {
    headers["Authorization"] = `Bearer ${config.secret}`;
  }

  const res = await fetch(config.agentUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`Agent returned ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json().catch(() => null) as { text?: string } | null;
  return data?.text ?? null;
}

/**
 * Receive a response from the agent and send it back via P2P as chat.message.
 */
export async function receiveFromAgent(
  deps: BridgeDeps,
  response: AgentResponse,
): Promise<{ messageId: string; recipientPeerId: string }> {
  const recipientPeerId = await deps.getRecipientPeerId(response.to);
  if (!recipientPeerId) {
    throw new Error(`Cannot resolve peer ID for: ${response.to}`);
  }

  const messageId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const unsigned = {
    version: "0.1" as const,
    messageId,
    createdAt: new Date().toISOString(),
    senderPeerId: deps.identity.agentPeerId,
    senderPublicKey: deps.identity.agentPublicKeyPem,
    senderRole: "agent" as const,
    recipientPeerId,
    recipientRole: "human" as const,
    intent: "chat.message" as const,
    payload: createChatMessagePayload({
      senderOwnerId: deps.identity.agentPeerId,
      text: response.text,
    }),
  };

  const envelope: EnvoyEnvelope = {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, deps.identity.agentPrivateKeyPem),
  };

  await deps.sendChat(recipientPeerId, envelope);

  return { messageId, recipientPeerId };
}
