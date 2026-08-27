/**
 * Structured end-of-turn follow-ups and deferred work (Codex / Claude / DeepSeek parity).
 */
export function emptyTurnHints() {
    return {};
}
export function hasTurnHints(hints) {
    return ((hints.followUps !== undefined && hints.followUps.length > 0) ||
        (hints.deferred !== undefined && hints.deferred.length > 0));
}
/** Merge partial hints from repeated `suggest_follow_ups` calls in one turn. */
export function mergeTurnHints(base, partial) {
    const followUps = partial.followUps !== undefined && partial.followUps.length > 0
        ? [...(base.followUps ?? []), ...partial.followUps]
        : base.followUps;
    const deferred = partial.deferred !== undefined && partial.deferred.length > 0
        ? [...(base.deferred ?? []), ...partial.deferred]
        : base.deferred;
    return {
        ...(followUps !== undefined && followUps.length > 0
            ? { followUps: dedupeStrings(followUps) }
            : {}),
        ...(deferred !== undefined && deferred.length > 0 ? { deferred } : {}),
    };
}
function dedupeStrings(items) {
    const seen = new Set();
    const out = [];
    for (const item of items) {
        const trimmed = item.trim();
        if (trimmed.length === 0 || seen.has(trimmed))
            continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}
//# sourceMappingURL=turn-hints.js.map