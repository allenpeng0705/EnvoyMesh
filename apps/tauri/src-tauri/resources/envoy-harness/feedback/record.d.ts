/**
 * Phase D / Item 16 — append-only feedback event store.
 */
import type { FeedbackEvent, FeedbackPolarity, SelfEvolveFeedbackSignal } from "./types.js";
export interface FeedbackStoreOptions {
    /** Directory for `feedback.jsonl` (append-only log). */
    dir: string;
}
export interface RecordFeedbackInput {
    sessionId: string;
    polarity: FeedbackPolarity;
    messageIndex?: number;
    note?: string;
    score?: number;
}
export interface FeedbackStore {
    record(input: RecordFeedbackInput): Promise<FeedbackEvent>;
    list(sessionId?: string): Promise<readonly FeedbackEvent[]>;
    /** Absolute path to the append-only log. */
    readonly logPath: string;
}
/**
 * Create an append-only feedback store. Events are never
 * mutated or deleted (immutability contract).
 */
export declare function createFeedbackStore(options: FeedbackStoreOptions): FeedbackStore;
/**
 * Map feedback events to self-evolve signals.
 * **Contamination guard:** raw `note` text is never included.
 */
export declare function toSelfEvolveSignals(events: ReadonlyArray<FeedbackEvent>): SelfEvolveFeedbackSignal[];
//# sourceMappingURL=record.d.ts.map