/**
 * Trace public API (F9.4, §19 of the design).
 *
 * **What this module exports:** the trace types +
 * the default + JSON Lines tracers. The
 * `AgentOptions.tracer` integration lands in F9.4.2
 * (follow-up commit).
 *
 * **Exports:**
 * - Types: `TraceEvent`, `Tracer`, plus the 6 event
 *   interfaces.
 * - Implementations: `NullTracer` (default),
 *   `JsonLinesTracer` (CLI --json).
 * - `WritableStream` (the structural stream type).
 *
 * **Stability:** the public surface is the union of
 * the above. Additive; new event kinds are added
 * over time (consumers should switch on `kind` with
 * a default branch for forward-compat).
 */
export type { TraceEvent, Tracer, AgentStartEvent, ModelResponseEvent, ToolCallEvent, ToolResultEvent, AgentEndEvent, ErrorEvent, } from "./types.js";
export { NullTracer } from "./null-tracer.js";
export { JsonLinesTracer, type WritableStream } from "./json-lines.js";
export { VerboseTracer, formatVerbose, type VerboseStream } from "./verbose-tracer.js";
export { createJsonlTelemetrySink, createNullTelemetrySink, wrapTracerAsTelemetrySink, type JsonlTelemetrySinkOptions, type TelemetryCounters, type TelemetrySink, } from "./telemetry.js";
export { assertRedactionInvariant, assertTraceEventShape, InvariantError, type InvariantKind, type RedactionInvariantOptions, } from "./invariants.js";
//# sourceMappingURL=index.d.ts.map