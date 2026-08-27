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
export { NullTracer } from "./null-tracer.js";
export { JsonLinesTracer } from "./json-lines.js";
export { VerboseTracer, formatVerbose } from "./verbose-tracer.js";
export { createJsonlTelemetrySink, createNullTelemetrySink, wrapTracerAsTelemetrySink, } from "./telemetry.js";
export { assertRedactionInvariant, assertTraceEventShape, InvariantError, } from "./invariants.js";
//# sourceMappingURL=index.js.map