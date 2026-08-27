/**
 * Structured end-of-turn follow-ups and deferred work (Codex / Claude / DeepSeek parity).
 */
export interface DeferredTask {
    task: string;
    reason: string;
}
export interface TurnHints {
    followUps?: ReadonlyArray<string>;
    deferred?: ReadonlyArray<DeferredTask>;
}
export declare function emptyTurnHints(): TurnHints;
export declare function hasTurnHints(hints: TurnHints): boolean;
/** Merge partial hints from repeated `suggest_follow_ups` calls in one turn. */
export declare function mergeTurnHints(base: TurnHints, partial: TurnHints): TurnHints;
//# sourceMappingURL=turn-hints.d.ts.map