import type { AiIdentity, AiIdentityMode, AiRule } from "./ws-protocol.js";
export interface ApplyAiIdentityPrefixOptions {
    /** Embed configurable prefix in message text (debug/audit). Default false. */
    debugPrefixInText?: boolean;
}
export declare function resolveAiIdentityPrefix(identity?: AiIdentity | null): string;
export declare function resolveEffectiveAiIdentityMode(identity?: AiIdentity | null, matchedRule?: Pick<AiRule, "action"> | null): AiIdentityMode;
export declare function shouldApplyAiIdentityPrefix(mode: AiIdentityMode): boolean;
/** System-prompt line: model must not echo inline agent labels. */
export declare function aiIdentityNoPrefixPromptLine(prefix?: string): string;
/** Remove leading AI identity markers the model or bridge may have duplicated. */
export declare function stripAiIdentityPrefixMarkers(text: string, prefix?: string): string;
/** Text for Social / UI: strip debug prefix; use {@link stripAiIdentityPrefixMarkers} with configured prefix. */
export declare function chatMessageTextForDisplay(text: string, identity?: AiIdentity | null): string;
/**
 * Normalize outbound AI chat text: strip model echoes; optionally embed debug prefix in wire text.
 */
export declare function applyAiIdentityPrefix(text: string, mode: AiIdentityMode, prefix?: string, options?: ApplyAiIdentityPrefixOptions): string;
/** Apply identity + optional rule override (drafts, auto-send). */
export declare function applyAiIdentityToDraftText(text: string, identity?: AiIdentity | null, matchedRule?: Pick<AiRule, "action"> | null): string;
/** Apply global identity settings on send (no rule override). */
export declare function applyAiIdentityForIdentity(text: string, identity?: AiIdentity | null): string;
//# sourceMappingURL=ai-identity-prefix.d.ts.map