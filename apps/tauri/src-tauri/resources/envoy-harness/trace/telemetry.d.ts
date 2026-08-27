/**
 * Phase D / Item 17 — telemetry sink over {@link Tracer}.
 *
 * Counters for turn / tool / job events; JSONL and null
 * sink factories for hermetic tests and CLI hosts.
 *
 * **Why the dropped-writes counter exists:** the JSONL
 * sink used to silently swallow every write error in
 * `.catch(() => undefined)`. That meant a full disk, a
 * read-only log dir, or a parent-process unmount would
 * quietly lose every event with no way to notice. The
 * sink now tracks `dropped` so callers can surface the
 * condition (e.g. a startup health check) without making
 * `emit` throw.
 */
import type { Tracer } from "./types.js";
/** Counters maintained by a {@link TelemetrySink}. */
export interface TelemetryCounters {
    turns: number;
    tools: number;
    jobs: number;
    errors: number;
    /**
     * JSONL-only: events whose write to disk failed (full
     * disk, EACCES, EPIPE, etc.). The in-memory event was
     * still emitted to any inner tracer; only the file
     * copy is missing. Reset by `resetDropped()`.
     */
    dropped: number;
}
export interface TelemetrySink extends Tracer {
    /** Snapshot of counters (copy). */
    counters(): TelemetryCounters;
    /** Optional flush for buffered sinks. */
    flush?(): Promise<void>;
}
export interface JsonlTelemetrySinkOptions {
    /** Path to append JSONL events. */
    filePath: string;
    /** Optional inner tracer (fan-out). */
    inner?: Tracer;
    /**
     * Optional callback for each dropped write. Receives the
     * raw error. Useful for hosts that want to log to stderr
     * or alert.
     */
    onDropped?: (err: unknown) => void;
}
/** No-op sink that still tracks counters. */
export declare function createNullTelemetrySink(): TelemetrySink;
/**
 * Append-only JSONL telemetry sink. `emit` is sync
 * (fire-and-forget writes); call {@link TelemetrySink.flush}
 * before process exit.
 *
 * **Failure handling:** write errors do NOT throw from
 * `emit` (emit is sync and the consumer is hot-path). The
 * sink bumps `counters().dropped` and, if an `onDropped`
 * callback is configured, invokes it with the error. The
 * event was still emitted to the inner tracer (if any).
 */
export declare function createJsonlTelemetrySink(options: JsonlTelemetrySinkOptions): TelemetrySink;
/** Wrap an existing tracer with counters. */
export declare function wrapTracerAsTelemetrySink(inner: Tracer): TelemetrySink;
//# sourceMappingURL=telemetry.d.ts.map