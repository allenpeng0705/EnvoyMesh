/**
 * JsonLinesTracer — a `Tracer` that writes one JSON object
 * per line to a `WritableStream`.
 *
 * **Why this exists:** the CLI's `--json` flag wires this
 * tracer to `process.stdout`. Each event becomes one
 * line of JSON; a downstream viewer (or `jq`) parses the
 * stream. JSON Lines is the standard observability format
 * (one event per line; each line is independently valid
 * JSON; the stream is line-delimited, not array-delimited).
 *
 * **Why no buffering:** `emit` is sync and writes
 * immediately. v0's events are sparse (5 per agent
 * iteration, plus start/end), so the cost of one
 * `write` per event is negligible. A future chunk can
 * add batching if needed.
 *
 * **Closed-stream handling:** once the underlying stream
 * is closed, `write` throws or returns false. We wrap
 * each call in try/catch; failures are silently dropped
 * (the agent's run shouldn't fail because the trace
 * stream is dead). The host can inspect the agent's
 * `tracer` (cast to `JsonLinesTracer`) for the count
 * of dropped events if needed.
 *
 * **`process.stdout` typing:** `WritableStream` here is
 * the structural type `{ write(s: string): boolean | void }`
 * so both `process.stdout` and the test's `MemoryStream`
 * fit without a Node-specific type. The implementation
 * only calls `write(string)`.
 *
 * **Stability:** the public surface is `JsonLinesTracer`
 * (class). Additive; new options (e.g. pretty-print,
 * filter by kind) are additive constructor options.
 */
/**
 * A `Tracer` that writes each event as a JSON line.
 * The constructor takes a stream; `emit` writes one
 * line per call.
 */
export class JsonLinesTracer {
    stream;
    _dropped = 0;
    constructor(stream) {
        this.stream = stream;
    }
    emit(event) {
        try {
            this.stream.write(JSON.stringify(event) + "\n");
        }
        catch {
            this._dropped++;
        }
    }
    /**
     * The number of events that failed to write (because
     * the underlying stream threw). Useful for diagnostics
     * in tests.
     */
    get droppedEvents() {
        return this._dropped;
    }
}
//# sourceMappingURL=json-lines.js.map