/**
 * Local ↔ wire type translation (F8.3).
 *
 * **Why translation:** the envoy-harness local types
 * (`@envoymesh/envoy-harness`) and the wire types
 * (`@envoymesh/protocol`) have **different schemas for
 * different purposes**:
 *
 * - Local types are *runtime-internal*: the harness's
 *   own transcript, tool calls, and tool results.
 *   Rich, lossless, designed for the agent loop.
 *
 * - Wire types are the *cross-mesh contract*: what the
 *   orchestrator and other adapters see. The orchestrator
 *   does not know about envoy-harness's tool loop; it
 *   just reads the final content + metrics.
 *
 * The translation is **lossy in one direction** (local
 * → wire): the wire format drops the harness's
 * intermediate transcript (messages), tool-call
 * sequencing, and the effective sandbox policy. These
 * are **internal audit** and live in the local store;
 * they don't cross the mesh.
 *
 * The other direction (wire → local) is not implemented
 * in v0: the orchestrator hands the adapter a wire
 * `AgentResult` only for `verify()`, not for re-execution.
 * v0 only needs the local → wire direction for `execute()`.
 *
 * **Structured content for tool calls + results:** the
 * wire `ContentBlock` has no tool-call or tool-result
 * variant. The adapter encodes them as `kind: "structured"`
 * with a `schemaRef` ("envoymesh://tool-call/v1" and
 * "envoymesh://tool-result/v1"). The orchestrator sees
 * them as opaque typed data; the envoy-harness adapter
 * can read them on the receiving side (future chunk).
 *
 * **Adapter-private raw:** the lossless local result is
 * preserved in `AgentResult.raw` (typed `unknown`).
 * Never read by the orchestrator, but stored in the
 * audit log so a debugging session can recover the
 * full transcript. Per the schema doc, "the signature
 * covers it so a malicious adapter cannot retroactively
 * edit it."
 *
 * **Stability:** the public surface is the translation
 * functions. The schemaRefs are an internal contract
 * between the wire sender (this adapter) and the wire
 * receiver (a future envoy-harness adapter on another
 * node). They are not part of the protocol package.
 */
/**
 * The schemaRef used to encode a local tool_call as a
 * wire `structured` content block. Stable contract
 * between envoy-harness adapters on different nodes.
 */
export const TOOL_CALL_SCHEMA_REF = "envoymesh://tool-call/v1";
/** Same, for tool_result blocks. */
export const TOOL_RESULT_SCHEMA_REF = "envoymesh://tool-result/v1";
// ---------------------------------------------------------------------------
// local → wire
// ---------------------------------------------------------------------------
/**
 * Translate one local `ContentBlock` to a wire `ContentBlock`.
 * Returns `undefined` for unrecognized local shapes
 * (the orchestrator should not see them).
 */
export function localToWireBlock(block) {
    if (block.type === "text") {
        return { kind: "text", text: block.text };
    }
    if (block.type === "tool_call") {
        const data = {
            id: block.id,
            name: block.name,
            args: block.args,
        };
        return { kind: "structured", schemaRef: TOOL_CALL_SCHEMA_REF, data };
    }
    if (block.type === "tool_result") {
        const data = {
            toolCallId: block.toolCallId,
            content: block.content,
            isError: block.isError,
        };
        return { kind: "structured", schemaRef: TOOL_RESULT_SCHEMA_REF, data };
    }
    // Unrecognized variant; the wire contract doesn't have
    // it. Drop it; the audit `raw` keeps the full transcript.
    return undefined;
}
/**
 * Translate a list of local content blocks to wire
 * content blocks. Empty / unrecognized blocks are dropped;
 * the audit `raw` keeps the full transcript.
 */
export function localToWireContent(blocks) {
    const out = [];
    for (const b of blocks) {
        const w = localToWireBlock(b);
        if (w)
            out.push(w);
    }
    return out;
}
/**
 * Translate the local `AgentResult.metrics` to a wire
 * `AgentMetrics`. The local type has `inputTokens` /
 * `outputTokens` / `costUsd`; the wire type has
 * `promptTokens` / `completionTokens` / `costUsd`.
 * `durationMs` is computed from the input (the local
 * result doesn't carry it directly).
 */
export function localToWireMetrics(input) {
    const out = {
        durationMs: input.durationMs,
        costUsd: input.costUsd,
    };
    if (input.promptTokens !== undefined) {
        out.promptTokens = input.promptTokens;
    }
    if (input.completionTokens !== undefined) {
        out.completionTokens = input.completionTokens;
    }
    return out;
}
/**
 * Translate a local `AgentResult` to a wire `AgentResult`.
 * The local result is also preserved in `raw` (lossless
 * audit trail). The wire `peerId` / `runtime` are taken
 * from the adapter's identity (caller's responsibility).
 */
export function localToWireResult(input) {
    return {
        skillId: input.skillId,
        runtime: input.runtime,
        peerId: input.peerId,
        correlationId: input.correlationId,
        content: localToWireContent(input.content),
        citations: [],
        metrics: localToWireMetrics({
            durationMs: input.durationMs,
            ...(input.promptTokens !== undefined ? { promptTokens: input.promptTokens } : {}),
            ...(input.completionTokens !== undefined
                ? { completionTokens: input.completionTokens }
                : {}),
            costUsd: input.costUsd,
        }),
        raw: input.raw,
        completedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=translation.js.map