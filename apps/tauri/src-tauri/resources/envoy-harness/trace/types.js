/**
 * Trace types (§19 of the design — F9.4 Phase 4 feature).
 *
 * **What is this module?** the public type surface for the
 * trace observability layer. The agent emits a stream of
 * `TraceEvent`s at key points; a `Tracer` implementation
 * decides what to do with them (the CLI's `--json` flag
 * wires a `JsonLinesTracer` to stdout).
 *
 * **Why a discriminated union:** each event kind has a
 * different shape (agent_start has sessionId + tools;
 * tool_result has durationMs + result). A union forces
 * the consumer to handle each kind explicitly; the
 * `kind` field is the discriminator.
 *
 * **`ts` field:** every event carries an ISO 8601
 * timestamp. We use `new Date().toISOString()` rather
 * than `process.hrtime` so the trace is human-readable.
 * Sub-millisecond ordering is not part of the contract.
 *
 * **What this is NOT:**
 * - Not a logging system. The `Logger` field on
 *   `StdioLspClient` is for internal diagnostics; the
 *   trace is for user-observable events.
 * - Not a metrics system. Token counts and cost are
 *   included in `agent_end` but not every event.
 *   v0 doesn't ship histograms; that's downstream.
 *
 * **Stability:** additive. New event kinds are added
 * over time. Consumers should switch on `kind` and
 * have a default branch (forward-compat).
 */
export {};
//# sourceMappingURL=types.js.map