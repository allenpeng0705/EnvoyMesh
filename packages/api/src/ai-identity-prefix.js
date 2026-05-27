const DEFAULT_PREFIX = "[AI Agent]";
export function resolveAiIdentityPrefix(identity) {
    return identity?.transparentPrefix?.trim() || DEFAULT_PREFIX;
}
export function resolveEffectiveAiIdentityMode(identity, matchedRule) {
    return matchedRule?.action.aiIdentityOverride ?? identity?.mode ?? "transparent";
}
export function shouldApplyAiIdentityPrefix(mode) {
    return mode === "transparent" || mode === "defensive";
}
/** Ensure outbound AI chat text carries the identity prefix (idempotent). */
export function applyAiIdentityPrefix(text, mode, prefix) {
    const trimmed = text.trim();
    if (!trimmed || !shouldApplyAiIdentityPrefix(mode)) {
        return trimmed;
    }
    const p = (prefix?.trim() || DEFAULT_PREFIX).replace(/:+$/, "");
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`^${escaped}\\s*:?\\s*`, "i").test(trimmed)) {
        return trimmed;
    }
    return `${p}: ${trimmed}`;
}
export function applyAiIdentityToDraftText(text, identity, matchedRule) {
    const mode = resolveEffectiveAiIdentityMode(identity, matchedRule);
    return applyAiIdentityPrefix(text, mode, resolveAiIdentityPrefix(identity));
}
//# sourceMappingURL=ai-identity-prefix.js.map