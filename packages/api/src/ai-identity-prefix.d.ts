import type { AiIdentity, AiIdentityMode, AiRule } from "./ws-protocol.js";
export declare function resolveAiIdentityPrefix(identity?: AiIdentity | null): string;
export declare function resolveEffectiveAiIdentityMode(identity?: AiIdentity | null, matchedRule?: Pick<AiRule, "action"> | null): AiIdentityMode;
export declare function shouldApplyAiIdentityPrefix(mode: AiIdentityMode): boolean;
/** Ensure outbound AI chat text carries the identity prefix (idempotent). */
export declare function applyAiIdentityPrefix(text: string, mode: AiIdentityMode, prefix?: string): string;
export declare function applyAiIdentityToDraftText(text: string, identity?: AiIdentity | null, matchedRule?: Pick<AiRule, "action"> | null): string;
//# sourceMappingURL=ai-identity-prefix.d.ts.map