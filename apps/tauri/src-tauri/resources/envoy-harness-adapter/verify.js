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
import { DEFAULT_RULES, runVerifierRules, } from "@envoymesh/envoy-harness";
import { TOOL_CALL_SCHEMA_REF, TOOL_RESULT_SCHEMA_REF, } from "./translation.js";
// ---------------------------------------------------------------------------
// wire → local (AgentResult shape for the verifier)
// ---------------------------------------------------------------------------
/**
 * Decode a wire `ContentBlock` back to a local
 * `ContentBlock`. The reverse of `localToWireBlock` —
 * tool calls and tool results are decoded from the
 * stable `schemaRef` to the local shape.
 *
 * Returns `undefined` for unrecognized wire shapes
 * (e.g. file, image, structured with a different
 * schemaRef). The caller drops undefineds.
 */
function wireToLocalBlock(block) {
    if (block.kind === "text") {
        return { type: "text", text: block.text };
    }
    if (block.kind === "structured") {
        if (block.schemaRef === TOOL_CALL_SCHEMA_REF) {
            const data = block.data;
            return {
                type: "tool_call",
                id: data.id,
                name: data.name,
                args: data.args,
            };
        }
        if (block.schemaRef === TOOL_RESULT_SCHEMA_REF) {
            const data = block.data;
            return {
                type: "tool_result",
                toolCallId: data.toolCallId,
                content: data.content,
                isError: data.isError,
            };
        }
    }
    // file, image, structured-with-other-schemaRef: not
    // representable in the local shape. Drop.
    return undefined;
}
/**
 * Map a wire `AgentResult` to a local `AgentResult`
 * shape, suitable for the local verifier. The wire
 * is the *public contract*; the local shape is
 * *runtime-internal*. The verifier expects the local
 * shape; the orchestrator hands the adapter the
 * wire shape; this function bridges.
 *
 * **What the wire doesn't carry (synthesized here):**
 * - `messages`: synthesized from the content (a
 *   single assistant message with all the content
 *   blocks). The full transcript lives in `raw`.
 * - `sandboxPolicy`: default to `read-only` (safe;
 *   the verifier's sandbox rule is a no-op).
 * - `iterations`, `toolCalls`: 0 (unknown to the wire).
 * - `stopReason`: `"end_turn"` (the wire has no
 *   equivalent — the verifier doesn't care).
 */
function wireToLocalAgentResult(wire) {
    const content = [];
    for (const b of wire.content) {
        const local = wireToLocalBlock(b);
        if (local)
            content.push(local);
    }
    const messages = [
        { role: "assistant", content },
    ];
    return {
        content,
        messages,
        sandboxPolicy: {
            mode: "read-only",
            approval: "on-request",
            backend: "linux-landlock",
            writableRoots: [],
            networkAccess: false,
            slashTmpWritable: true,
        },
        metrics: {
            inputTokens: wire.metrics.promptTokens ?? 0,
            outputTokens: wire.metrics.completionTokens ?? 0,
            costUsd: wire.metrics.costUsd,
        },
        iterations: 0,
        toolCalls: 0,
        stopReason: "end_turn",
    };
}
// ---------------------------------------------------------------------------
// local → wire (Verdict) — structural no-op but typed
// ---------------------------------------------------------------------------
/**
 * The local and wire `Verdict` schemas are intentionally
 * aligned (per the design §4.3 — Verdict is part of the
 * cross-mesh contract). This function is a typed no-op
 * for forward-compat: if a future chunk adds wire-only
 * verdict variants, the translation lives here.
 */
function localVerdictToWire(v) {
    return v;
}
// ---------------------------------------------------------------------------
// runLocalVerifier
// ---------------------------------------------------------------------------
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
export async function runLocalVerifier(input, options = {}) {
    const local = wireToLocalAgentResult(input.result);
    const localVerdicts = await runVerifierRules(local, input.objective, options.rules ?? DEFAULT_RULES);
    return localVerdicts.map(localVerdictToWire);
}
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
export async function runLocalVerifierOnLocal(result, objective, options = {}) {
    return runVerifierRules(result, objective, options.rules ?? DEFAULT_RULES);
}
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
export function defaultCrossVerify(otherAdapter, opts) {
    return async (input) => {
        try {
            const newResult = await otherAdapter.execute({
                skillId: input.result.skillId,
                objective: input.objective,
                inputArtifacts: [],
                costCeilingUsd: 0,
                deadlineMs: 30_000,
                correlationId: input.result.correlationId,
                signal: new AbortController().signal,
                ...(opts?.providerHint !== undefined
                    ? { verifierModel: opts.providerHint }
                    : {}),
            });
            // Run the local verifier on the new result.
            return await runLocalVerifier({
                result: newResult,
                objective: input.objective,
            });
        }
        catch (err) {
            // The cross adapter failed. Surface as a
            // single `disputed` verdict; the local
            // verdicts are still useful on their own.
            return [
                {
                    kind: "disputed",
                    needsHuman: true,
                    signals: [`cross-verify failed: ${err.message}`],
                },
            ];
        }
    };
}
//# sourceMappingURL=verify.js.map