import { formatChatActorBadge } from "./chat-actor.js";
export const DEFAULT_ENVOY_DISCLOSURE_SETTINGS = {
    showAgentBadges: true,
    collapsePeerAgentToContact: false,
};
export function normalizeEnvoyDisclosureSettings(partial) {
    return {
        showAgentBadges: partial?.showAgentBadges ?? DEFAULT_ENVOY_DISCLOSURE_SETTINGS.showAgentBadges,
        collapsePeerAgentToContact: partial?.collapsePeerAgentToContact ?? DEFAULT_ENVOY_DISCLOSURE_SETTINGS.collapsePeerAgentToContact,
    };
}
/**
 * Resolve chat bubble variant + badge from stored actor truth and local disclosure prefs.
 * Activity/audit always use raw actor fields — this affects contact-thread UI only.
 */
export function resolveChatBubblePresentation(input, disclosure = DEFAULT_ENVOY_DISCLOSURE_SETTINGS) {
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
//# sourceMappingURL=envoy-disclosure.js.map