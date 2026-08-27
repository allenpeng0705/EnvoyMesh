/**
 * Phase C / Item 13 — redacting Tracer wrapper.
 */
import type { Tracer } from "../trace/types.js";
export interface RedactingTracerOptions {
    secrets: () => ReadonlySet<string>;
    secretNames?: () => ReadonlyMap<string, string>;
}
/** Wrap a Tracer so emitted events never contain revealed secrets. */
export declare function createRedactingTracer(inner: Tracer, options: RedactingTracerOptions): Tracer;
//# sourceMappingURL=redaction.d.ts.map