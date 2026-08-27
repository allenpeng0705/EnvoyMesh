/**
 * Cost tracking (§14 of the design).
 *
 * **What is the cost module?** a small surface for "given a
 * model and a token count, how much does this cost?" plus a
 * `CostTracker` that accumulates usage across a run.
 *
 * **Why is this in its own module?** the design puts cost
 * tracking on the PostToolUse hook (so cost is attributed
 * to the call that produced it). v0 has cost as a first-class
 * field on `AgentResult.metrics`; the hook can populate it
 * by inspecting the model's last response. Keeping the math
 * in a separate module means a unit test verifies the math,
 * not the hook.
 *
 * **Pricing table:** the `DEFAULT_PRICING` is a static table
 * (USD per million tokens, input + output). Real-world
 * pricing changes often; v0 ships a baseline that the
 * operator can override via `CostTracker({ pricing })`. A
 * future chunk can plug in a live pricing source.
 *
 * **v0 simplification:** we don't track cache tokens
 * (Anthropic) or reasoning tokens (o1). The `usage` shape
 * is intentionally minimal: `inputTokens + outputTokens`.
 * A future chunk can extend the type and the pricing math
 * if needed.
 *
 * **Stability:** `TokenPrice`, `DEFAULT_PRICING`,
 * `computeCost`, and `CostTracker` are the public API. New
 * model entries are additive; removing one is a major
 * version bump (callers may rely on it).
 */
/** USD per million tokens (input + output, separately). */
export interface TokenPrice {
    /** USD per million input tokens. */
    inputUsdPerMTok: number;
    /** USD per million output tokens. */
    outputUsdPerMTok: number;
}
/**
 * A static pricing table for the providers we support in v0.
 * Numbers are USD per million tokens, as of 2026.
 *
 * **Override at construction:** `CostTracker({ pricing })`
 * lets the operator pass a custom table. The default is a
 * snapshot; pricing in production is a separate concern
 * (live pricing source, billing dashboard, etc.).
 *
 * **Why a Record (not a Map):** `Record<string, TokenPrice>`
 * is JSON-serializable (cost may want to dump the table to
 * the scoreboard for the audit trail). Maps aren't.
 */
export declare const DEFAULT_PRICING: Record<string, TokenPrice>;
/**
 * Compute the USD cost for a single request. Returns 0 when
 * the model is unknown to the pricing table (graceful default
 * for local models and future providers not yet priced).
 *
 * **The math:** `cost = (inputTokens / 1e6) * inputUsdPerMTok
 * + (outputTokens / 1e6) * outputUsdPerMTok`. Both halves
 * rounded to 6 decimal places (sub-cent precision is enough
 * for the dashboard; full precision would expose floating-point
 * noise in the JSON).
 */
export declare function computeCost(model: string, inputTokens: number, outputTokens: number, pricing?: Record<string, TokenPrice>): number;
/** A single usage event (what the model adapter reports). */
export interface Usage {
    /** Tokens in the request (prompt). */
    inputTokens: number;
    /** Tokens in the response (completion). */
    outputTokens: number;
}
/** The accumulated state of a run. */
export interface RunCost {
    inputTokens: number;
    outputTokens: number;
    /** USD cost summed across all addUsage() calls. */
    costUsd: number;
}
/**
 * Accumulates usage across a run and computes total cost.
 * Used by the Agent loop: each model call adds its usage;
 * the AgentResult carries the final totals.
 *
 * **Why a class?** the loop calls `addUsage` multiple times
 * (one per model call). A class encapsulates the running
 * totals; the alternative (passing totals through the loop
 * state) is more error-prone.
 *
 * **Why is the model name configurable?** different
 * models in the same run (unlikely in v0, possible with
 * tool-call handoff in Phase 2) have different prices. The
 * tracker remembers the current model so each addUsage
 * uses the right pricing.
 */
export declare class CostTracker {
    private inputTokens;
    private outputTokens;
    private costUsd;
    private model;
    private pricing;
    constructor(options: {
        model: string;
        pricing?: Record<string, TokenPrice>;
    });
    /**
     * Add a usage event. Updates the running totals and the
     * accumulated cost. Unknown models contribute 0 cost but
     * the tokens are still counted.
     */
    /**
     * The model name this tracker was constructed with.
     * Read-only. The agent emits this in the `agent_start`
     * trace event; the actual model may be different if
     * `addUsage` was called with a `modelOverride`.
     */
    get currentModel(): string;
    addUsage(usage: Usage, modelOverride?: string): void;
    /**
     * F10.5: add a sub-agent's cost to the parent's
     * `CostTracker`. The sub-agent already tracked
     * its own tokens (in its own `CostTracker`);
     * this just adds the resulting USD cost to the
     * parent's running total. No tokens are
     * attributed here (they live in the sub-agent's
     * tracker; the parent only sees the sum).
     *
     * **Why a separate method (not `addUsage` with
     * zero tokens):** the sub-agent's tokens are
     * NOT the parent's tokens. Adding them to the
     * parent's `inputTokens` / `outputTokens`
     * would double-count. The sub-agent's cost is
     * a derived number (sum of its own token-costs
     * for its own model); the parent just adds the
     * derived number.
     *
     * **Where it's called:** the parent's `task`
     * tool, after the `MeshSubmitter` returns. The
     * tool's `onSubagentComplete` callback (set
     * by the parent's `Agent` constructor) calls
     * `costTracker.addSubagentCost(result.costUsd)`.
     * For F10.4.1 fan-out, the callback receives the
     * aggregated result (with summed `costUsd`), so
     * the parent adds the sum of N sub-agents.
     *
     * **Why additive, not a new field on `RunCost`:**
     * the parent's `RunCost.costUsd` already means
     * "total USD cost the parent spent". Sub-agent
     * cost is part of that — the parent spent USD
     * to spawn the sub-agent (even if indirectly,
     * via the sub-agent's model). The host's
     * `AgentResult.metrics.costUsd` already exposes
     * this; F10.5 just makes the number correct.
     */
    addSubagentCost(costUsd: number): void;
    /**
     * Switch the model used for pricing. Use when a run
     * legitimately uses more than one model (rare in v0).
     */
    setModel(model: string): void;
    /** The current totals. */
    total(): RunCost;
    /** Reset the tracker (for reuse across runs). */
    reset(): void;
}
//# sourceMappingURL=cost.d.ts.map