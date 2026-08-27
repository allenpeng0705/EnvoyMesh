/**
 * VerboseTracer — human-readable tool-call logging for `--verbose`.
 *
 * The `--verbose` CLI flag prints what the agent is doing as it
 * happens (tool calls + results + model responses) to stderr, so
 * the user can watch a run without parsing JSON Lines. The
 * `JsonLinesTracer` remains the machine-readable path (`--json`).
 */
import type { TraceEvent, Tracer } from "./types.js";
/** The minimum stream surface the tracer needs. */
export interface VerboseStream {
    write(chunk: string): boolean | void;
}
/**
 * A `Tracer` that prints human-readable lines per event.
 */
export declare class VerboseTracer implements Tracer {
    private readonly stream;
    constructor(stream: VerboseStream);
    emit(event: TraceEvent): void;
}
/** Format one event as a short human-readable line. */
export declare function formatVerbose(event: TraceEvent): string;
//# sourceMappingURL=verbose-tracer.d.ts.map