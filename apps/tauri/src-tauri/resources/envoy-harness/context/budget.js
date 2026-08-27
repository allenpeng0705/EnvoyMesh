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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Average characters per token for English text. The deepseek
 * `tokenize.ts` heuristic uses 4. The estimate is intentionally
 * approximate — the goal is to know when to STOP dropping, not
 * to count perfectly. Off by 10% is fine; off by 50% means
 * the caller is escalating to a summarizer anyway.
 */
const CHARS_PER_TOKEN = 4;
/**
 * Per-block structural overhead (JSON framing, role
 * markers, etc.). Without this, tool-heavy transcripts
 * underestimate by 5-10%.
 */
const BLOCK_OVERHEAD_CHARS = 16;
/**
 * Per-tool-call + per-tool-result overhead (the JSON shape
 * includes `type`, `id`, `name`, `args` / `content` — adds
 * ~30 chars per call before the actual content).
 */
const TOOL_CALL_OVERHEAD_CHARS = 32;
// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------
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
export function estimateMessageTokens(message) {
    let chars = 0;
    for (const block of message.content) {
        if (block.type === "text") {
            chars += block.text.length;
            chars += BLOCK_OVERHEAD_CHARS;
        }
        else if (block.type === "tool_call") {
            chars += block.name.length;
            chars += TOOL_CALL_OVERHEAD_CHARS;
            chars += JSON.stringify(block.args).length;
        }
        else if (block.type === "tool_result") {
            chars += TOOL_CALL_OVERHEAD_CHARS;
            const c = block.content;
            if (typeof c === "string") {
                chars += c.length;
            }
            else {
                chars += JSON.stringify(c).length;
            }
        }
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
}
/**
 * Sum the token estimate across all messages. Convenience
 * wrapper for callers that don't care about per-message
 * counts.
 */
export function totalTokens(messages) {
    let sum = 0;
    for (const m of messages) {
        sum += estimateMessageTokens(m);
    }
    return sum;
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
export function selectDroppablePrefix(messages, budget) {
    // Empty input is a no-op (not "over budget" — the
    // caller has nothing to compact).
    if (messages.length === 0) {
        return {
            kept: [],
            dropped: [],
            totalTokensAfter: 0,
            overBudget: false,
        };
    }
    // Split the system message (if any) from the rest. The
    // system message is ALWAYS preserved (per the compact
    // contract).
    const hasSystem = messages.length > 0 && messages[0]?.role === "system";
    const system = hasSystem
        ? messages[0]
        : undefined;
    const rest = hasSystem
        ? messages.slice(1)
        : messages;
    // Edge case: system alone. If it fits, no drop. If not,
    // overBudget = true (dropping the system message is
    // out-of-scope for this strategy).
    if (rest.length === 0) {
        const systemTokens = system ? estimateMessageTokens(system) : 0;
        return {
            kept: system ? [system] : [],
            dropped: [],
            totalTokensAfter: systemTokens,
            overBudget: systemTokens > budget,
        };
    }
    // Walk from the END, accumulating tokens. `endIdx` is
    // the first index of the suffix that fits (inclusive
    // lower bound).
    const restTokens = rest.map(estimateMessageTokens);
    let suffixStart = rest.length; // start as "nothing fits"
    let runningTotal = system ? estimateMessageTokens(system) : 0;
    for (let i = rest.length - 1; i >= 0; i--) {
        const t = restTokens[i] ?? 0;
        if (runningTotal + t > budget) {
            // Adding this message would exceed the budget.
            // Stop here; everything before `i` (i.e. indices
            // 0..i-1) is dropped.
            break;
        }
        runningTotal += t;
        suffixStart = i;
    }
    // If we never moved the suffix start (e.g. budget is 0
    // and the first rest message doesn't fit), suffixStart
    // stays at `rest.length`, meaning kept = [system] and
    // dropped = all of rest.
    const kept = [];
    if (system)
        kept.push(system);
    for (let i = suffixStart; i < rest.length; i++) {
        const m = rest[i];
        if (m)
            kept.push(m);
    }
    const dropped = rest.slice(0, suffixStart);
    // overBudget is true when:
    // - the suffix is empty (no rest message fit) AND
    //   there's a system message (which still has to be kept).
    // - the system message itself is > budget (caught above).
    const overBudget = kept.length === 0 || (system !== undefined && kept.length === 1);
    return {
        kept,
        dropped,
        totalTokensAfter: runningTotal,
        overBudget,
    };
}
//# sourceMappingURL=budget.js.map