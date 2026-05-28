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
function normalizedPrefix(prefix) {
    return (prefix?.trim() || DEFAULT_PREFIX).replace(/:+$/, "");
}
/** System-prompt line: model must not echo inline agent labels. */
export function aiIdentityNoPrefixPromptLine(prefix) {
    const p = normalizedPrefix(prefix);
    return `Do NOT type "${p}" or "${p}:" in your reply. Agent vs human is indicated by message role metadata, not inline text (debug prefixes are never shown in the Social UI).`;
}
/** Remove leading AI identity markers the model or bridge may have duplicated. */
export function stripAiIdentityPrefixMarkers(text, prefix) {
    const p = normalizedPrefix(prefix);
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const lineStart = new RegExp(`^${escaped}\\s*:?\\s*`, "i");
    const lineOnly = new RegExp(`^\\s*${escaped}\\s*:?\\s*$`, "i");
    let result = text.trim();
    for (let guard = 0; guard < 32 && result; guard++) {
        if (lineStart.test(result)) {
            result = result.replace(lineStart, "").trim();
            continue;
        }
        const lines = result.split(/\r?\n/);
        if (lines.length > 0 && (!lines[0].trim() || lineOnly.test(lines[0]))) {
            lines.shift();
            result = lines.join("\n").trim();
            continue;
        }
        break;
    }
    return result;
}
/** Text for Social / UI: strip debug prefix; use {@link stripAiIdentityPrefixMarkers} with configured prefix. */
export function chatMessageTextForDisplay(text, identity) {
    return stripAiIdentityPrefixMarkers(text, resolveAiIdentityPrefix(identity));
}
/**
 * Normalize outbound AI chat text: strip model echoes; optionally embed debug prefix in wire text.
 */
export function applyAiIdentityPrefix(text, mode, prefix, options) {
    const p = normalizedPrefix(prefix);
    const stripped = stripAiIdentityPrefixMarkers(text, p);
    const trimmed = stripped.trim();
    if (!trimmed || !shouldApplyAiIdentityPrefix(mode)) {
        return trimmed;
    }
    if (options?.debugPrefixInText !== true) {
        return trimmed;
    }
    return `${p}: ${trimmed}`;
}
/** Apply identity + optional rule override (drafts, auto-send). */
export function applyAiIdentityToDraftText(text, identity, matchedRule) {
    const mode = resolveEffectiveAiIdentityMode(identity, matchedRule);
    return applyAiIdentityPrefix(text, mode, resolveAiIdentityPrefix(identity), {
        debugPrefixInText: identity?.debugPrefixInMessageText === true,
    });
}
/** Apply global identity settings on send (no rule override). */
export function applyAiIdentityForIdentity(text, identity) {
    const mode = identity?.mode ?? "transparent";
    return applyAiIdentityPrefix(text, mode, resolveAiIdentityPrefix(identity), {
        debugPrefixInText: identity?.debugPrefixInMessageText === true,
    });
}
//# sourceMappingURL=ai-identity-prefix.js.map