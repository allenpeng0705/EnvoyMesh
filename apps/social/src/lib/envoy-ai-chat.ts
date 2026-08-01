import type { ChatMessage } from "@envoymesh/api";
import {
  ENVOY_AI_THREAD_KEY,
  OWNER_FAMILY_PROFILE_ID,
  isEnvoyAiThreadKey,
  parseEnvoyAiProfileId,
  stripModelThinking,
} from "@envoymesh/api";
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
  };
}

export function isEnvoyAiChatMessage(msg: ChatMessage, selfOwnerId: string): boolean {
  const sndO = msg.sender?.ownerId?.trim();
  const rcvO = msg.recipient?.ownerId?.trim();
  // Character bots use deliveryChannel "ai" but live under bot:<id> threads.
  if (sndO?.startsWith("bot:") || rcvO?.startsWith("bot:")) {
    return false;
  }
  // Family-scoped EnvoyAI (`__envoy_ai__:dad`) must never paint into Owner Social.
  for (const key of [sndO, rcvO]) {
    if (!key || !isEnvoyAiThreadKey(key)) continue;
    const profileId = parseEnvoyAiProfileId(key);
    if (profileId && profileId !== OWNER_FAMILY_PROFILE_ID) {
      return false;
    }
  }
  if (
    rcvO === ENVOY_AI_THREAD_KEY ||
    sndO === ENVOY_AI_THREAD_KEY ||
    parseEnvoyAiProfileId(sndO ?? "") === OWNER_FAMILY_PROFILE_ID ||
    parseEnvoyAiProfileId(rcvO ?? "") === OWNER_FAMILY_PROFILE_ID
  ) {
    return true;
  }
  if (msg.metadata?.deliveryChannel === "ai") {
    // Bare family profile ids (e.g. sender "dad") must not enter Owner EnvoyAI.
    const self = selfOwnerId.trim();
    for (const key of [sndO, rcvO]) {
      if (!key || key === self || key.startsWith("envoy:") || isEnvoyAiThreadKey(key)) {
        continue;
      }
      if (
        key.startsWith("bot:") ||
        key.startsWith("bridge:") ||
        key.startsWith("family:") ||
        key.startsWith("room:")
      ) {
        continue;
      }
      return false;
    }
    return true;
  }
  // Bridge messages with deliveryChannel "agent" belong to the Ext Agent thread,
  // not the EnvoyAI panel. Only route legacy bridge messages (deliveryChannel "ai"
  // or unset) to EnvoyAI.
  if (
    msg.metadata?.deliverySource === "bridge" &&
    msg.metadata?.deliveryChannel !== "agent" &&
    rcvO === selfOwnerId.trim()
  ) {
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
