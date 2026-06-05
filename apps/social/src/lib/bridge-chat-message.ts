import type { ChatMessage } from "@envoymesh/api";
import { ENVOY_AI_THREAD_KEY } from "@envoymesh/api";

/** Proactive or async delivery from the local OpenClaw bridge agent. */
export function isBridgeAgentChatMessage(
  msg: Pick<ChatMessage, "sender" | "metadata">,
  agentPeerId?: string | null,
): boolean {
  if (msg.metadata?.deliveryChannel === "ai") {
    return true;
  }
  if (msg.sender.ownerId?.trim() === ENVOY_AI_THREAD_KEY) {
    return true;
  }
  const agentId = agentPeerId?.trim();
  if (!agentId) {
    return false;
  }
  const senderNode = msg.sender.nodeId?.trim();
  const senderOwner = msg.sender.ownerId?.trim();
  return senderNode === agentId || senderOwner === agentId;
}

export function extractChatMessageText(
  msg: Pick<ChatMessage, "content"> & { payload?: { text?: string }; text?: string },
): string {
  const fromContent = msg.content?.text;
  if (typeof fromContent === "string" && fromContent.length > 0) {
    return fromContent;
  }
  if (typeof msg.payload?.text === "string" && msg.payload.text.length > 0) {
    return msg.payload.text;
  }
  if (typeof msg.text === "string" && msg.text.length > 0) {
    return msg.text;
  }
  return typeof fromContent === "string" ? fromContent : "";
}

/** Heartbeat poll acks are internal — not user-facing reminders. */
export function isBridgeHeartbeatNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed === "🕸️") {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("heartbeat poll") || lower.includes("heartbeat wake")) {
    return true;
  }
  if (/^🕸️\s*heartbeat\b/i.test(trimmed)) {
    return true;
  }
  if (/^heartbeat acknowledged\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function shouldShowBridgeMessageInAiChat(
  msg: Pick<ChatMessage, "sender" | "metadata" | "content"> & {
    payload?: { text?: string };
    text?: string;
  },
  agentPeerId?: string | null,
): boolean {
  if (!isBridgeAgentChatMessage(msg, agentPeerId)) {
    return false;
  }
  return !isBridgeHeartbeatNoise(extractChatMessageText(msg));
}
