/**
 * Phase D / Item 16 — feedback types.
 *
 * Feedback is append-only scored input. Raw text must
 * never be injected into model prompts (contamination
 * guard); use {@link toSelfEvolveSignals} for the
 * self-evolve path.
 */
export type FeedbackPolarity = "up" | "down" | "neutral";
/** Append-only feedback event (immutable once recorded). */
export interface FeedbackEvent {
    readonly id: string;
    readonly ts: string;
    readonly sessionId: string;
    /** Optional message index within the session. */
    readonly messageIndex?: number;
    readonly polarity: FeedbackPolarity;
    /** Human note — never injected raw into prompts. */
    readonly note?: string;
    /** Numeric score in [-1, 1] when provided. */
    readonly score?: number;
}
/** Per-message sidecar rating/note. */
export interface MessageFeedback {
    messageIndex: number;
    polarity: FeedbackPolarity;
    note?: string;
    score?: number;
    updatedAt: string;
}
/** Scored signal safe for self-evolve (no raw notes). */
export interface SelfEvolveFeedbackSignal {
    polarity: FeedbackPolarity;
    score: number;
    sessionId: string;
    messageIndex?: number;
    ts: string;
}
//# sourceMappingURL=types.d.ts.map