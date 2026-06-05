import type { ChatMessage } from "@envoymesh/api";
import { ENVOY_AI_THREAD_KEY, stripModelThinking } from "@envoymesh/api";
import { extractChatMessageText, isBridgeHeartbeatNoise } from "./bridge-chat-message.js";

export interface AiChatMessageView {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: string;
  turn?: ChatMessage["metadata"]["assistantTurn"] & {
    approvalItems?: never;
    approvalResolved?: never;
    jobStage?: string;
    jobStatusSummary?: string;
    blocks?: never;
  };
}

export function isEnvoyAiChatMessage(msg: ChatMessage, selfOwnerId: string): boolean {
  const sndO = msg.sender?.ownerId?.trim();
  const rcvO = msg.recipient?.ownerId?.trim();
  if (rcvO === ENVOY_AI_THREAD_KEY || sndO === ENVOY_AI_THREAD_KEY) {
    return true;
  }
  if (msg.metadata?.deliveryChannel === "ai") {
    return true;
  }
  if (msg.metadata?.deliverySource === "bridge" && rcvO === selfOwnerId.trim()) {
    return true;
  }
  return false;
}

export function chatMessageToAiMessage(
  msg: ChatMessage,
  selfOwnerId: string,
): AiChatMessageView | null {
  if (!isEnvoyAiChatMessage(msg, selfOwnerId)) {
    return null;
  }
  const text = stripModelThinking(extractChatMessageText(msg));
  const self = selfOwnerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const timestamp = msg.metadata?.timestamp || new Date().toISOString();

  if (sndO === self) {
    if (!text.trim()) return null;
    return { id: msg.messageId, role: "user", text, timestamp };
  }

  if (isBridgeHeartbeatNoise(text)) {
    return null;
  }
  if (!text.trim() && !msg.metadata?.assistantTurn) {
    return null;
  }

  return {
    id: msg.messageId,
    role: "ai",
    text,
    timestamp,
    turn: msg.metadata?.assistantTurn,
  };
}

export function mergeAiChatMessages(existing: AiChatMessageView[], incoming: AiChatMessageView[]): AiChatMessageView[] {
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const msg of incoming) {
    byId.set(msg.id, msg);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

export { ENVOY_AI_THREAD_KEY };
