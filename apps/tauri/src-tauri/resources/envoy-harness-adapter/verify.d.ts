/**
 * F8.6+ — wire the local verifier rules to the adapter.
 *
 * The adapter's `verify()` was a first-cut deterministic
 * placeholder (non-empty + non-echo). This module wires
 * the real local verifier rules (F1.4d's
 * `runVerifierRules`) so the orchestrator gets the
 * full 6-rule verdict set on every result.
 *
 * **Wire ↔ local round-trip:**
 * - Wire `SignedAgentResult` → local `AgentResult`:
 *   decode content blocks (text + structured tool_call/
 *   result) into the local shape; synthesize a message
 *   list from the content; default the sandbox policy
 *   to a safe `read-only` policy (the wire doesn't carry
 *   it — it's internal audit only).
 * - Local `Verdict[]` → wire `Verdict[]`: a structural
 *   no-op (the two schemas are intentionally aligned).
 *
 * **Why a separate module, not in adapter.ts:** the
 * adapter stays focused on the MAP contract; the
 * verify logic is self-contained and easy to test
 * in isolation. Future chunks can extend the
 * default rule set or add cross-agent verification
 * without touching the adapter.
 *
 * **Why a default `read-only` sandbox policy:** the
 * wire format doesn't carry the worker's effective
 * sandbox (it's internal audit). The verifier's
 * `sandboxRespectedRule` is a no-op when the policy
 * is `read-only` (no paths to check); the rest of the
 * rules run normally. If the orchestrator needs the
 * full audit, the `raw` field on the wire result
 * carries the lossless local result.
 *
 * **Stability:** the public surface is `runLocalVerifier`
 * + the type re-exports. Additive.
 */
import { type AgentResult as LocalAgentResult, type VerifierRule, type Verdict as LocalVerdict } from "@envoymesh/envoy-harness";
import type { Verdict as WireVerdict } from "@envoymesh/protocol";
import type { VerifyInput } from "@envoymesh/agent-adapter";
/**
 * Run the local verifier rules against a wire
 * `SignedAgentResult`. Returns the wire-format verdicts.
 *
 * **Default rules:** `DEFAULT_RULES` (the 6 rules from
 * F1.4d: non-empty-content, output-matches-objective,
 * mesh-task-shape, sandbox-respected, approval-respected,
 * cost-reasonable-for-work). Pass a custom list via
 * the `rules` option.
 *
 * **The objective** comes from `VerifyInput.objective`
 * (the orchestrator's mandate).
 */
export declare function runLocalVerifier(input: VerifyInput, options?: {
    rules?: ReadonlyArray<VerifierRule>;
}): Promise<WireVerdict[]>;
/**
 * The reverse direction: take a local `AgentResult` and
 * run the local verifier directly. Useful for the
 * adapter's own self-tests and for callers that have
 * a local result (e.g. the adapter's own `execute()`)
 * and want a verdict before signing.
 *
 * (Currently exported for tests; future chunk may
 * surface this in the public API.)
 */
export declare function runLocalVerifierOnLocal(result: LocalAgentResult, objective: string, options?: {
    rules?: ReadonlyArray<VerifierRule>;
}): Promise<LocalVerdict[]>;
import type { AgentAdapter } from "@envoymesh/agent-adapter";
/**
 * F9.5 — a function that produces additional verdicts
 * for a given verify input. The adapter's `verify()`
 * method calls it AFTER the local verifier and
 * concatenates the cross verdicts with the local ones.
 *
 * **Use case:** the orchestrator can compose
 * `crossVerifyWith = defaultCrossVerify(otherAdapter)`
 * to re-run the same skill on a different model
 * (e.g. a cheap local model for cross-checking an
 * expensive GPT-4 result). The cross verifier's
 * verdicts carry the per-source visibility; the
 * orchestrator can collapse them with
 * `combineVerdicts(verdicts)`.
 *
 * **Stability:** additive. New fields on the
 * closure (e.g. a config for the deadline) are
 * additive; the v0 contract is the simple
 * `(input) => Promise<Verdict[]>` shape.
 */
export type CrossVerifyFn = (input: VerifyInput) => Promise<WireVerdict[]>;
/**
 * F9.5 — a default cross-verify closure that re-runs
 * the same skill on a different `AgentAdapter` and
 * returns the local verifier's verdicts for the new
 * result.
 *
 * **Why "re-run on a different model":** the cheapest
 * way to get a second opinion on a worker's output
 * is to ask a different model to do the same work.
 * If both verdicts agree, the result is high-confidence.
 * If they disagree, the orchestrator can flag it as
 * `disputed` and surface to a human (per design §6.2).
 *
 * **v0 limits:**
 * - `inputArtifacts` is NOT re-passed (the cross
 *   adapter may not have access to the same files;
 *   v0 trusts the worker to include any needed
 *   context in the result content).
 * - `costCeilingUsd: 0` (the orchestrator is the
 *   authoritative budget gate; v0 cross-verify runs
 *   for free to keep the cost predictable).
 * - `deadlineMs: 30_000` (tight; cross-verify should
 *   be fast or the orchestrator escalates).
 * - The signal is a fresh `AbortController.signal`
 *   (the orchestrator can wrap it if it needs
 *   shared cancellation).
 *
 * **The cross adapter's error:** if the other adapter
 * throws (model down, etc.), the cross-verify returns
 * a single `disputed` verdict with the error message
 * in the `signals`. The local verdicts are still
 * valid; the cross failure is recorded.
 *
 * **Stability:** additive. v0's contract is a single
 * argument; future chunks may add options (custom
 * deadline, custom rules, etc.).
 */
export declare function defaultCrossVerify(otherAdapter: AgentAdapter, opts?: {
    /**
     * v1.16 — per-call model override hint for the cross adapter.
     * Forwarded as `ExecuteInput.verifierModel` so a same-runtime
     * cross-verify (worker on envoy-harness + model X → verifier on
     * envoy-harness + model Y) can honor it.
     */
    providerHint?: string;
}): CrossVerifyFn;
//# sourceMappingURL=verify.d.ts.map