/**
 * D3 — shape mapping between the envoy `MeshSubmitter` contract
 * (`SubagentInput`/`SubagentResult`) and the MAP wire messages
 * (`ExecuteInput`/`SignedAgentResult`) the peer protocol carries.
 */
import { randomUUID } from "node:crypto";
/** Map a `MeshSubmitter` input to the MAP `ExecuteInput` the wire carries. */
export function subagentInputToExecuteInput(input, signal) {
    return {
        skillId: input.capabilityTag,
        objective: input.objective,
        inputArtifacts: [],
        costCeilingUsd: input.costCeilingUsd,
        deadlineMs: input.deadlineMs,
        correlationId: randomUUID(),
        signal,
    };
}
/**
 * Map a MAP `SignedAgentResult` back to the `SubagentResult` contract.
 * v1: text blocks map to local text blocks; other kinds are skipped with
 * a note block (full structured/file/image mapping is a later round).
 *
 * Verdict: when the server ran a real verifier (`verifyAfterExecute`),
 * its combined verdict is passed in and used verbatim. Otherwise the v1
 * placeholder below applies (non-empty content → pass) — honest only for
 * smoke/demo use; hosts that route on `result.verdict.kind` should enable
 * the server-side verifier or the D5 cross-instance verify.
 */
export function signedResultToSubagentResult(result, verdict) {
    const content = [];
    const skipped = [];
    for (const block of result.content) {
        if (block.kind === "text") {
            content.push({ type: "text", text: block.text });
        }
        else {
            skipped.push(block.kind);
        }
    }
    if (skipped.length > 0) {
        content.push({
            type: "text",
            text: `[peer result omitted ${skipped.join(", ")} blocks]`,
        });
    }
    const resolvedVerdict = verdict ?? synthesizeVerdict(result);
    return {
        // Mirror LocalMeshSubmitter: a failed result (empty content → fail
        // verdict) reports `status: "failed"`, not a completed run.
        status: resolvedVerdict.kind === "fail" ? "failed" : "completed",
        content,
        workerPeerId: result.peerId,
        workerRuntime: result.runtime,
        costUsd: result.metrics.costUsd,
        durationMs: result.metrics.durationMs,
        verdict: resolvedVerdict,
        signature: result.signature,
    };
}
/** A simple verdict synthesis from the wire result (v1). */
function synthesizeVerdict(result) {
    if (result.content.length === 0) {
        return { kind: "fail", reason: "empty result", rollback: true };
    }
    return { kind: "pass", score: 1, confidence: "high" };
}
//# sourceMappingURL=mapping.js.map