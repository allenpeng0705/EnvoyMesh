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
import { selectDroppablePrefix, } from "../context/budget.js";
/**
 * Drop the oldest messages, keeping the last `keep` non-system
 * messages plus the system message (if present). Returns the new
 * transcript. No-op when the transcript is not longer than
 * `keep` (ignoring the system message).
 */
export function compactMessages(messages, keep) {
    const parts = splitSystemAndRest(messages);
    if (parts.rest.length <= keep) {
        // Nothing to compact.
        return messages.slice();
    }
    return rebuild(parts.system, parts.rest.slice(-keep));
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
export async function compactMessagesWithSummary(messages, keep, summarize) {
    const parts = splitSystemAndRest(messages);
    if (parts.rest.length <= keep) {
        return { messages: messages.slice(), droppedCount: 0 };
    }
    const toKeep = parts.rest.slice(-keep);
    const dropped = parts.rest.slice(0, parts.rest.length - keep);
    let summary;
    try {
        summary = await summarize(dropped);
    }
    catch {
        // Summarizer failed (LLM unavailable, timeout, etc.).
        // Fall through to drop-oldest: the kept messages are
        // the same as `compactMessages(messages, keep)` would
        // produce, but we DON'T add a summary block (the
        // caller can detect "no summary block" → "fallback
        // fired"). The dropped count is unchanged from the
        // pre-summarize view.
        return { messages: compactMessages(messages, keep), droppedCount: dropped.length };
    }
    const out = [];
    if (parts.system)
        out.push(parts.system);
    if (summary.trim().length > 0) {
        // Insert the summary as a USER message, NOT a system
        // message: `Agent.run()` treats the presence of ANY system
        // message as "the system prompt is already installed" and
        // would skip appending the real system prompt on the next
        // turn. A labeled user block carries the context without
        // conflicting with the system prompt.
        out.push({
            role: "user",
            content: [
                {
                    type: "text",
                    text: `The following earlier context was summarized away:\n${summary.trim()}`,
                },
            ],
        });
    }
    for (const m of toKeep)
        out.push(m);
    return { messages: out, droppedCount: dropped.length };
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
export function compactMessagesBudget(messages, budget) {
    const r = selectDroppablePrefix(messages, budget);
    return {
        messages: r.kept,
        droppedCount: r.dropped.length,
        totalTokensAfter: r.totalTokensAfter,
        overBudget: r.overBudget,
    };
}
/** Split the leading system message (if any) from the rest. */
function splitSystemAndRest(messages) {
    // The system message is always at the start in v0 per
    // agent.run's logic; if present, preserve it.
    const hasSystem = messages.length > 0 && messages[0]?.role === "system";
    return {
        system: hasSystem ? messages[0] : undefined,
        rest: messages.slice(hasSystem ? 1 : 0),
    };
}
/** Rebuild a transcript as plain role + content pairs. */
function rebuild(system, rest) {
    const out = [];
    if (system) {
        out.push({ role: system.role, content: system.content });
    }
    for (const m of rest) {
        out.push({ role: m.role, content: m.content });
    }
    return out;
}
//# sourceMappingURL=compact.js.map