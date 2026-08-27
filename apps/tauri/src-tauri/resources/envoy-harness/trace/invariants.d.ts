/**
 * Phase D / Item 17 — lightweight invariant checks for
 * traces / telemetry (dev-time contract assertions).
 */
import type { TraceEvent } from "./types.js";
export type InvariantKind = "redaction" | "shape";
export declare class InvariantError extends Error {
    readonly kind: InvariantKind;
    readonly name = "InvariantError";
    constructor(message: string, kind: InvariantKind);
}
export interface RedactionInvariantOptions {
    /** Secret substrings that must not appear in serialized events. */
    secrets: readonly string[];
}
/**
 * Assert that none of `secrets` appear in the JSON
 * serialization of `event`. Throws {@link InvariantError}
 * on failure.
 */
export declare function assertRedactionInvariant(event: TraceEvent, options: RedactionInvariantOptions): void;
/**
 * Basic shape check: every event must have `kind` + `ts`.
 */
export declare function assertTraceEventShape(event: TraceEvent): void;
//# sourceMappingURL=invariants.d.ts.map