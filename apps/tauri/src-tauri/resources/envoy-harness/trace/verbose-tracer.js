/**
 * VerboseTracer — human-readable tool-call logging for `--verbose`.
 *
 * The `--verbose` CLI flag prints what the agent is doing as it
 * happens (tool calls + results + model responses) to stderr, so
 * the user can watch a run without parsing JSON Lines. The
 * `JsonLinesTracer` remains the machine-readable path (`--json`).
 */
/**
 * A `Tracer` that prints human-readable lines per event.
 */
export class VerboseTracer {
    stream;
    constructor(stream) {
        this.stream = stream;
    }
    emit(event) {
        try {
            this.stream.write(formatVerbose(event));
        }
        catch {
            // Never let logging break the run.
        }
    }
}
/** Format one event as a short human-readable line. */
export function formatVerbose(event) {
    switch (event.kind) {
        case "agent_start":
            return `[verbose] session ${event.sessionId} started (model: ${event.model}, tools: ${event.tools.join(", ")})`;
        case "model_response":
            return `[verbose] model response (${event.stopReason})`;
        case "tool_call":
            return `[verbose] tool_call ${event.call.name}(${JSON.stringify(event.call.args)})`;
        case "tool_result":
            return `[verbose] tool_result ${event.callId}${event.result.isError ? " [error]" : ""}`;
        case "agent_end":
            return `[verbose] run ended (${event.stopReason}, ${event.iterations} iterations, ${event.toolCalls} tool calls, $${event.metrics.costUsd.toFixed(4)})`;
        case "error":
            return `[verbose] error: ${event.message}`;
    }
}
//# sourceMappingURL=verbose-tracer.js.map