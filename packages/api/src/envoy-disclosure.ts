import type { ChatActorRole } from "./chat-actor.js";
import { formatChatActorBadge } from "./chat-actor.js";

/** Local-only chat presentation (EMP presentation plane — not on wire). */
export interface EnvoyDisclosureSettings {
  showAgentBadges: boolean;
  collapsePeerAgentToContact: boolean;
}

export const DEFAULT_ENVOY_DISCLOSURE_SETTINGS: EnvoyDisclosureSettings = {
  showAgentBadges: true,
  collapsePeerAgentToContact: false,
};

export function normalizeEnvoyDisclosureSettings(
  partial?: Partial<EnvoyDisclosureSettings> | null,
): EnvoyDisclosureSettings {
  return {
    showAgentBadges: partial?.showAgentBadges ?? DEFAULT_ENVOY_DISCLOSURE_SETTINGS.showAgentBadges,
    collapsePeerAgentToContact:
      partial?.collapsePeerAgentToContact ?? DEFAULT_ENVOY_DISCLOSURE_SETTINGS.collapsePeerAgentToContact,
  };
}

export type MessageVisualVariant =
  | "outgoing"
  | "outgoing-agent"
  | "incoming-peer"
  | "incoming-agent"
  | "ai-outgoing"
  | "ai-incoming";

export interface ChatBubblePresentationInput {
  actorRole?: ChatActorRole;
  agentVerified?: boolean;
  outgoing: boolean;
  contactDisplayName: string;
  threadKind: "human" | "agent" | "ai";
}

export interface ChatBubblePresentation {
  variant: MessageVisualVariant;
  actorBadge?: string;
}

/**
 * Resolve chat bubble variant + badge from stored actor truth and local disclosure prefs.
 * Activity/audit always use raw actor fields — this affects contact-thread UI only.
 */
export function resolveChatBubblePresentation(
  input: ChatBubblePresentationInput,
  disclosure: EnvoyDisclosureSettings = DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
): ChatBubblePresentation {
  const { actorRole, agentVerified, outgoing, contactDisplayName, threadKind } = input;

  if (threadKind === "ai") {
    return { variant: outgoing ? "ai-outgoing" : "ai-incoming" };
  }

  const isAgent = actorRole === "agent";
  const verified = agentVerified !== false;

  if (isAgent) {
    if (!disclosure.showAgentBadges) {
      if (outgoing) {
        return { variant: "outgoing" };
      }
      if (disclosure.collapsePeerAgentToContact && verified) {
        const label = contactDisplayName.trim() || undefined;
        return { variant: "incoming-peer", actorBadge: label };
      }
    }

    const actorBadge = formatChatActorBadge({
      displayName: contactDisplayName,
      actorRole: "agent",
      agentVerified,
      outgoing,
    });
    return {
      variant: outgoing ? "outgoing-agent" : "incoming-agent",
      actorBadge,
    };
  }

  if (outgoing) {
    return { variant: "outgoing", actorBadge: "You" };
  }

  const label = contactDisplayName.trim() || undefined;
  return { variant: threadKind === "agent" ? "incoming-agent" : "incoming-peer", actorBadge: label };
}
