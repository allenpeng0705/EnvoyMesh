/**
 * Compaction helpers — the drop-oldest, LLM-summarize, and
 * token-budget variants behind `Agent.compact` /
 * `Agent.compactWithSummary` /
 * `Agent.compactWithBudget` (wired to the REPL's `/compact`
 * command and available to the host for a manual "compact"
 * button).
 *
 * **Why separate from `agent.ts`:** agent.ts exceeds the 800-line
 * module cap (documented allowlist exception). Compaction is
 * self-contained transcript math with no dependency on the
 * Agent's loop, tools, or hooks — it is the first extraction
 * candidate, so it gets its own module.
 *
 * **Behavior contract (shared by all variants):**
 * - The system message (if present) is always preserved at the
 *   start of the transcript.
 * - The kept messages are the most-recent ones (drop-oldest
 *   semantics — see the individual function docs for the
 *   "kept" rule).
 * - If there is nothing to drop, the transcript is returned
 *   unchanged (no summarizer call, no mutation, no token-count
 *   pass).
 *
 * **`compactMessagesWithSummary`:** drops the oldest messages and
 * inserts a summary of the dropped messages as a USER message
 * (not system — see the function docs for why), before the kept
 * messages. The summarizer is injected by the caller (host
 * policy owns cost/prompting); an empty summary adds no block.
 * The summarizer-throws → drop-oldest fallback (chunk 1.2) keeps
 * the command robust to LLM unavailability.
 *
 * **`compactMessagesBudget`:** drops the oldest messages until
 * the total token estimate fits `budget`. Operates on tokens,
 * not message counts — see [`src/context/budget.ts`](../context/budget.ts)
 * for the math.
 */
import type { Message } from "../tools/index.js";
/**
 * Drop the oldest messages, keeping the last `keep` non-system
 * messages plus the system message (if present). Returns the new
 * transcript. No-op when the transcript is not longer than
 * `keep` (ignoring the system message).
 */
export declare function compactMessages(messages: ReadonlyArray<Message>, keep: number): Message[];
/** The result of a summarized compaction. */
export interface CompactWithSummaryResult {
    /** The new transcript (same content as the input when no-op). */
    messages: Message[];
    /**
     * How many messages were dropped. `0` means "nothing to drop"
     * — the caller should treat the result as a no-op (the summary
     * insertion can keep the message COUNT unchanged while changing
     * content, so callers must not infer no-op from length).
     */
    droppedCount: number;
}
/**
 * Compact with LLM summarization (Codex compaction parity).
 * Drops the oldest messages (keeping the last `keep` + the
 * system message) and injects a summary of the dropped messages,
 * so the model keeps the gist without the full history.
 *
 * **No-op** when the transcript is shorter than `keep` (nothing
 * to summarize — the summarizer is not called). The summary is
 * inserted BEFORE the kept messages so the model sees it as
 * prior context.
 *
 * **Chunk 1.2 — summarizer-throws → drop-oldest fallback:**
 * when the summarizer throws (e.g. the LLM is unavailable or
 * rate-limited), the function falls through to the
 * `compactMessages` drop-oldest strategy with the same `keep`.
 * The caller still gets a `CompactWithSummaryResult`; the
 * absence of a summary block is the signal that the fallback
 * fired. The thrown error is NOT re-thrown — the REPL's
 * `/compact` command should not crash on a transient LLM error.
 *
 * @param keep The number of most-recent messages to keep.
 * @param summarize Receives the dropped messages and returns
 *   a summary string (may be empty — then no block is added).
 */
export declare function compactMessagesWithSummary(messages: ReadonlyArray<Message>, keep: number, summarize: (dropped: ReadonlyArray<Message>) => Promise<string>): Promise<CompactWithSummaryResult>;
/** The result of a budget-based compaction. */
export interface CompactBudgetResult {
    /** The new transcript (system message at index 0 when present). */
    messages: Message[];
    /** How many messages were dropped. `0` means "nothing to drop". */
    droppedCount: number;
    /**
     * The total token estimate across the kept messages. When
     * this is > `budget`, see `overBudget`.
     */
    totalTokensAfter: number;
    /**
     * `true` when even the system message alone exceeds
     * `budget`, or when no non-system message fit. The caller
     * should escalate to a stronger strategy (LLM summarize).
     */
    overBudget: boolean;
}
/**
 * Compact by token budget. Drops the oldest messages until
 * the total token estimate fits `budget`. Thin wrapper over
 * `selectDroppablePrefix` (the math lives there).
 *
 * **No-op** when the transcript already fits. The system
 * message is always preserved. When even the system message
 * exceeds `budget`, the result is `{ messages: [system], droppedCount: <rest>, overBudget: true }`
 * — the caller escalates.
 *
 * @param messages The full transcript.
 * @param budget The total token budget (the kept messages
 *   must sum to ≤ this).
 */
export declare function compactMessagesBudget(messages: ReadonlyArray<Message>, budget: number): CompactBudgetResult;
//# sourceMappingURL=compact.d.ts.map