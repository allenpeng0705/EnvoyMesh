/**
 * Phase A / Item 1 (chunks 1.1 + 1.2) — token-budget compaction
 * math.
 *
 * **Reference:** gap-closure-plan item 1 ("Compaction variants:
 * Follow codex (algorithm family)") + codex's
 * `compact_token_budget.rs` (manual token-budget compaction that
 * installs a fresh context window).
 *
 * **What this does:** the existing `compactMessages` /
 * `compactMessagesWithSummary` are COUNT-based — they drop the
 * oldest N messages. That's a bad proxy for the real budget: a
 * 50-message transcript can be 4K tokens (light) or 200K tokens
 * (heavy tool results). The budget strategy operates on token
 * counts and knows when to stop dropping.
 *
 * **The math:**
 * 1. Estimate tokens per message (`estimateMessageTokens`).
 *     Pure, hermetic, no native deps. ~4 chars per token for
 *     English + per-block structural overhead. Swappable for a
 *     real tokenizer in a future chunk.
 * 2. Walk the transcript from the end, accumulating the
 *     total. Drop the prefix that doesn't fit the budget.
 * 3. Always preserve the system message (per the existing
 *     compact contract). If even the system message exceeds
 *     the budget, return `overBudget: true` so the caller
 *     can escalate (the summarizer strategy).
 *
 * **Why not use codex's exact algorithm:** codex's
 * `compact_token_budget.rs` is the LIFECYCLE — it fires hooks,
 * emits `ContextCompaction` turn items, etc. envoy-harness is
 * a thin layer above the agent loop; the math is what we
 * borrow, not the lifecycle. The lifecycle stays in
 * `Agent.compact` / `Agent.compactWithSummary`; this module
 * just provides the "which messages to drop" answer.
 *
 * **Stability:** additive. The estimate may be tightened by
 * a future chunk that adds a real tokenizer; the
 * `selectDroppablePrefix` signature is stable.
 */
import type { Message } from "../tools/index.js";
/**
 * Estimate the token count of a single message. The estimate
 * is character-based with per-block structural overhead. Pure
 * (no I/O, no native deps) and deterministic — the same
 * message always returns the same count.
 *
 * **Why per-block, not whole-message:** a transcript often has
 * tool calls whose `args` are JSON-encoded blobs; lumping
 * them into one string underestimates the wrap.
 *
 * **Why no real tokenizer:** hermetic tests require a
 * deterministic estimator that doesn't pull in a native
 * module or hit a network. A real tokenizer (tiktoken,
 * gpt-tokenizer) can be swapped in behind this signature
 * in a future chunk without changing the callers.
 *
 * @example
 *   const n = estimateMessageTokens({
 *     role: "user",
 *     content: [{ type: "text", text: "hello" }],
 *   }); // → 2 (5 chars → ceil(5/4) = 2)
 */
export declare function estimateMessageTokens(message: Message): number;
/**
 * Sum the token estimate across all messages. Convenience
 * wrapper for callers that don't care about per-message
 * counts.
 */
export declare function totalTokens(messages: ReadonlyArray<Message>): number;
/**
 * The result of a budget-based prefix drop.
 */
export interface DroppablePrefixResult {
    /**
     * The post-drop transcript (system message at index 0
     * when present, followed by the most-recent messages
     * that fit the budget).
     */
    kept: Message[];
    /**
     * The messages that were dropped, in transcript order.
     * Empty when no drop was needed.
     */
    dropped: Message[];
    /**
     * The total token estimate across `kept` (NOT including
     * `dropped`). When `overBudget` is true, this is > the
     * budget.
     */
    totalTokensAfter: number;
    /**
     * `true` when the system message alone exceeds the
     * budget, OR when `kept` is `[]` (empty input).
     * The caller should escalate to a stronger strategy
     * (LLM summarize) when this is true.
     */
    overBudget: boolean;
}
/**
 * Drop messages from the start of the transcript until the
 * remaining total token count fits within `budget`. The
 * system message (if any) is always preserved.
 *
 * **Algorithm:**
 * 1. Split the leading system message (if any) from the rest.
 * 2. Walk the rest from the END (most recent), accumulating
 *    token counts. Stop when adding the next message would
 *    exceed the budget.
 * 3. Return `{ system, kept, dropped, totalTokensAfter }`.
 *
 * **Edge cases:**
 * - **Empty input:** returns `{ kept: [], dropped: [], totalTokensAfter: 0, overBudget: false }`.
 * - **System message alone > budget:** keeps just the system
 *   message, `overBudget: true`. Dropping the system message
 *   would violate the compact contract; the caller escalates.
 * - **No system, no messages fit:** returns `{ kept: [], dropped: [all], overBudget: true }`.
 * - **Budget = 0:** keeps just the system (if any); same
 *   `overBudget` semantics as above.
 *
 * **Why not iterate from the start:** a typical transcript
 * has a long prefix (old messages) and a short suffix
 * (recent context). Dropping from the start, stopping when
 * the suffix fits, is what every real use case needs.
 *
 * @example
 *   const r = selectDroppablePrefix(
 *     [sys("S"), u("u1"), u("u2"), u("u3")],
 *     100,
 *   );
 *   // r.kept might be [sys("S"), u("u3")] if u1+u2 ≈ 90 tokens
 *   // and u3 + sys ≈ 10 tokens.
 */
export declare function selectDroppablePrefix(messages: ReadonlyArray<Message>, budget: number): DroppablePrefixResult;
//# sourceMappingURL=budget.d.ts.map