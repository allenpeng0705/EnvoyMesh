/** Thread / bubble styling — makes message source obvious at a glance. */
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
  if (selectedContact === "__envoy_ai__") return "ai";
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

export function threadKindLabel(kind: ChatThreadKind): string {
  switch (kind) {
    case "ai":
      return "Envoy AI";
    case "agent":
      return "Home agent";
    default:
      return "Direct message";
  }
}
