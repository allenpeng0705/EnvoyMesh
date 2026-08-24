/** Thread / bubble styling — makes message source obvious at a glance. */
import { ENVOY_AI_THREAD_KEY, ENVOY_HARNESS_THREAD_KEY } from "@envoymesh/api";

export type ChatThreadKind = "human" | "agent" | "ai";

export type MessageVisualVariant =
  | "outgoing"
  | "outgoing-agent"
  | "incoming-peer"
  | "incoming-agent"
  | "ai-outgoing"
  | "ai-incoming";

export function resolveChatThreadKind(
  selectedContact: string,
  agentPeerId?: string | null,
): ChatThreadKind {
  if (selectedContact === ENVOY_AI_THREAD_KEY) return "ai";
  if (selectedContact === ENVOY_HARNESS_THREAD_KEY) return "ai";
  if (selectedContact.startsWith("bot:")) return "ai";
  if (agentPeerId && selectedContact === agentPeerId) return "agent";
  return "human";
}

export function messageVisualVariant(
  outgoing: boolean,
  threadKind: ChatThreadKind,
): MessageVisualVariant {
  if (threadKind === "ai") {
    return outgoing ? "ai-outgoing" : "ai-incoming";
  }
  if (outgoing) return "outgoing";
  return threadKind === "agent" ? "incoming-agent" : "incoming-peer";
}

/** Per-message variant when actor role is known (Phase 13B). */
export function messageVisualVariantForMessage(
  msg: { sender: { actorRole?: "human" | "agent" | "system" } },
  outgoing: boolean,
  threadKind: ChatThreadKind,
): MessageVisualVariant {
  if (threadKind === "ai") {
    return outgoing ? "ai-outgoing" : "ai-incoming";
  }
  if (msg.sender.actorRole === "agent") {
    return outgoing ? "outgoing-agent" : "incoming-agent";
  }
  return messageVisualVariant(outgoing, threadKind);
}

/**
 * Localized label for the chat thread kind. Callers pass the i18n `t`
 * function so this stays a pure helper (no React context inside `lib/`).
 */
export function threadKindLabel(
  kind: ChatThreadKind,
  t: (key: string) => string,
): string {
  switch (kind) {
    case "ai":
      return t("chat.aiChat.title");
    case "agent":
      return "";
    default:
      return t("contactChat.threadKindDirect");
  }
}
