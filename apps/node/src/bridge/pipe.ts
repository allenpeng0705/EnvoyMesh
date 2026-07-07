import type { AgentCredential, EnvoyEnvelope } from "@envoymesh/protocol";
import { createChatMessagePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { signUnsignedEnvelope } from "@envoymesh/identity";
import type { AiIdentity } from "@envoymesh/api";
import { applyAiIdentityForIdentity } from "@envoymesh/api";
import type { ExternalAgentGateway } from "../external-agent-gateway.js";
import type { BridgeConfig } from "./config.js";

export interface BridgeIdentity {
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  ownerId: string;
  agentCredential: AgentCredential;
}

export interface BridgeDeps {
  config: BridgeConfig;
  identity: BridgeIdentity;
  /**
   * Send a chat envelope to a peer. Implementations should pass any
   * `dialHints` through to the underlying libp2p `dialHints` option so that
   * NAT-traversed peers (e.g. mobile behind a relay) can still be reached if
   * the original connection has dropped.
   */
  sendChat: (peerId: string, envelope: EnvoyEnvelope, options?: { dialHints?: string[] }) => Promise<void>;
  /** Resolve an ownerId or peerId to the current libp2p peer ID (for routing replies). */
  getRecipientPeerId: (ownerOrPeerId: string) => Promise<string | null>;
  /**
   * Resolve outbound dial hints for a recipient peer (multiaddrs from the
   * peer directory + synthetic relay circuit paths). Used so the bridge's
   * reply to a NAT-traversed mobile can be re-dialed when the original
   * libp2p connection has expired by the time the agent finishes thinking.
   * Optional — if absent, no hints are forwarded.
   */
  getRecipientDialHints?: (peerId: string) => Promise<string[] | undefined>;
  /** Gateway for external agent session management and action logging (Phase 9I). */
  gateway?: ExternalAgentGateway;
  /** Agent ID used to key gateway session lookups and action logs. */
  agentId?: string;
  /** Current AI identity settings (for outbound prefix enforcement). */
  getAiIdentity?: () => AiIdentity | undefined;
  /** Resolves OpenClaw ask() pending replies by correlationId. */
  resolveOpenClawReply?: (correlationId: string, text: string) => void;
}

export interface P2PMessage {
  senderPeerId: string;
  senderOwnerId: string;
  senderDisplayName?: string;
  text: string;
  /**
   * Unique envelope id from the inbound P2P envelope. Threaded through to the
   * external agent so it can dedup retries by id rather than by (sender, text).
   */
  messageId?: string;
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
    ...(msg.messageId ? { messageId: msg.messageId } : {}),
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.secret) {
    headers["Authorization"] = `Bearer ${config.secret}`;
  }

  console.log(`[bridge] forwardToAgent: POST ${config.agentUrl} from=${msg.senderOwnerId?.slice(0, 20)} text=${msg.text?.slice(0, 50)}`);
  const res = await fetch(config.agentUrl, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(300000),
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
  const startTime = Date.now();
  const recipientPeerId = await deps.getRecipientPeerId(response.to);
  if (!recipientPeerId) {
    throw new Error(`Cannot resolve peer ID for: ${response.to}`);
  }

  const messageId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  // Truncate long LLM replies to fit within the protocol text limit.
  // The ChatMessagePayloadSchema enforces max 128000 chars; we truncate here
  // with a marker so the bridge never fails on long agent responses.
  const MAX_TEXT = 128000;
  let text = response.text;
  if (text.length > MAX_TEXT) {
    text = text.slice(0, MAX_TEXT - 30) + "\n\n[truncated by bridge — reply too long]";
    console.warn(`[bridge] receiveFromAgent: truncated reply from ${text.length} to ~${MAX_TEXT} chars (was ${response.text.length})`);
  }

  const aiIdentity = deps.getAiIdentity?.();
  text = applyAiIdentityForIdentity(text, aiIdentity);

  const unsigned = createUnsignedEnvelope({
    messageId,
    senderPeerId: deps.identity.agentPeerId,
    senderPublicKey: deps.identity.agentPublicKeyPem,
    senderRole: "agent",
    recipientPeerId,
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: deps.identity.ownerId,
      text,
    }),
    agentCredential: deps.identity.agentCredential,
  });

  const envelope = signUnsignedEnvelope(unsigned, deps.identity.agentPrivateKeyPem);

  // Forward dial hints (peer directory listen addrs + synthetic relay
  // circuit paths) so the bridge's reply can re-dial a NAT-traversed
  // mobile if the original libp2p connection has dropped while the agent
  // was thinking.
  let dialHints: string[] | undefined;
  if (deps.getRecipientDialHints) {
    try {
      dialHints = await deps.getRecipientDialHints(recipientPeerId);
    } catch (err) {
      console.warn(
        `[bridge] receiveFromAgent: getRecipientDialHints failed for ${recipientPeerId.slice(0, 20)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`[bridge] receiveFromAgent: sending chat.message to recipientPeerId=${recipientPeerId} dialHints=${dialHints?.length ?? 0}`);
  try {
    await deps.sendChat(recipientPeerId, envelope, dialHints ? { dialHints } : undefined);
    console.log(`[bridge] receiveFromAgent: sendChat succeeded`);
  } catch (err) {
    console.error(`[bridge] receiveFromAgent: sendChat FAILED: ${err instanceof Error ? err.message : err}`);
    throw err;
  }

  if (deps.gateway && deps.agentId) {
    deps.gateway.logAction({
      agentId: deps.agentId,
      toolName: "bridge.send_message",
      params: { to: response.to, textLength: response.text.length },
      outcome: "success",
      requiresApproval: false,
      durationMs: Date.now() - startTime,
    });
    deps.gateway.touchAgent(deps.agentId);
  }

  return { messageId, recipientPeerId };
}
