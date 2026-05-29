import type { ChatActorRole } from "./chat-actor.js";
/** Local-only chat presentation (EMP presentation plane — not on wire). */
export interface EnvoyDisclosureSettings {
    showAgentBadges: boolean;
    collapsePeerAgentToContact: boolean;
}
export declare const DEFAULT_ENVOY_DISCLOSURE_SETTINGS: EnvoyDisclosureSettings;
export declare function normalizeEnvoyDisclosureSettings(partial?: Partial<EnvoyDisclosureSettings> | null): EnvoyDisclosureSettings;
export type MessageVisualVariant = "outgoing" | "outgoing-agent" | "incoming-peer" | "incoming-agent" | "ai-outgoing" | "ai-incoming";
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
export declare function resolveChatBubblePresentation(input: ChatBubblePresentationInput, disclosure?: EnvoyDisclosureSettings): ChatBubblePresentation;
//# sourceMappingURL=envoy-disclosure.d.ts.map