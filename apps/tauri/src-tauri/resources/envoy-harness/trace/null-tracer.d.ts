/**
 * NullTracer — a `Tracer` that does nothing.
 *
 * **Why this exists:** the agent always needs a `Tracer`
 * (the field can't be `undefined` at the call sites
 * because then every `tracer.emit` needs a guard). A
 * no-op default is cleaner than optional chaining at
 * every call site.
 *
 * **Zero overhead:** `emit` is an empty method. v8
 * inlines trivially.
 *
 * **Stability:** the public surface is `NullTracer`
 * (class). Additive.
 */
import type { Tracer } from "./types.js";
/** A `Tracer` whose `emit` is a no-op. The default
 *  when the host doesn't provide a tracer. */
export declare class NullTracer implements Tracer {
    emit(_event: import("./types.js").TraceEvent): void;
}
//# sourceMappingURL=null-tracer.d.ts.map