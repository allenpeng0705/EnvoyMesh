/**
 * Phase A / Item 5 — the REPL `UserQuestionProvider`.
 *
 * **Reference:** deepseek `interaction/user-questions` REPL
 * provider (gap-closure-plan item 5, package-1 default).
 *
 * **What this does:** the human-facing side of
 * `UserQuestionService`. The agent calls
 * `service.ask({ prompt, options?, multiline?, signal })`;
 * the service delegates here; we render the prompt to
 * `output` (default `process.stdout`), read the answer
 * from `input` (default `process.stdin`), and return it.
 *
 * **Why we don't use `node:readline` here:** readline's
 * `line` event has subtle timing issues when the input
 * stream is a `Readable.from([...])` — the events can
 * fire before the listener is registered. Reading the
 * stream line-by-line with `for await ... of` is
 * deterministic + testable + works the same for the
 * real REPL and the test fakes.
 *
 * **Why injectable streams (not `process.stdin` directly):**
 * the test suite uses `Readable.from([...])` +
 * `Writable` to drive the provider without spawning a
 * real REPL. Production wires to the real stdin/stdout;
 * tests wire to fakes. Same code, both paths.
 *
 * **Why a sentinel for multiline:** the deepseek
 * `multiline` flag uses `"""` on its own line (a Python
 * convention). Configurable via the `multilineSentinel`
 * option; default `"""`.
 *
 * **Cancellation mapping:**
 * - `signal.abort()` while waiting for the next line →
 *   answer `{ value: "", cancelled: true, cancelledReason: "aborted" }`.
 * - `input` stream ends (EOF) before any input → same
 *   shape. Distinguishing "aborted" from "timeout" is
 *   the caller's job (the service-level timeout aborts
 *   the signal; the provider sees the abort).
 *
 * **The `output` write:** the provider writes the prompt
 * to `output` BEFORE reading. The user needs to see the
 * prompt before they can answer.
 */
import { Buffer } from "node:buffer";
/** The default multiline-mode sentinel. `"""` on its own line ends input. */
export const DEFAULT_MULTILINE_SENTINEL = '"""';
/**
 * Create the REPL stdin provider. Default name
 * `"repl-stdin"`. The provider honors `req.signal`
 * (stops reading on abort).
 */
export function createReplStdinProvider(opts = {}) {
    const input = opts.input ?? process.stdin;
    const output = opts.output ?? process.stdout;
    const sentinel = opts.multilineSentinel ?? DEFAULT_MULTILINE_SENTINEL;
    const name = opts.name ?? "repl-stdin";
    return {
        name,
        async ask(req) {
            // Pre-aborted: return immediately. Defends against
            // races where the service applies a timeout after
            // the provider's already started.
            if (req.signal.aborted) {
                return { value: "", cancelled: true, cancelledReason: "aborted" };
            }
            // Render the prompt to `output` before reading.
            // The trailing newline lets the user's terminal
            // cursor land on a fresh line.
            const header = renderPromptHeader(req, sentinel);
            output.write(header + "\n");
            if (req.multiline === true) {
                return await readMultiline(input, req, sentinel, output);
            }
            return await readSingleLine(input, req.signal, output, req.options);
        },
    };
}
// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------
/**
 * Render the prompt header that goes to `output` before
 * the user types. Includes the question + (optional) the
 * fixed-choice options + (optional) the multiline sentinel
 * hint.
 */
function renderPromptHeader(req, sentinel) {
    const lines = [];
    lines.push(req.prompt);
    if (req.options !== undefined && req.options.length > 0) {
        lines.push("");
        for (let i = 0; i < req.options.length; i++) {
            const star = req.recommendedIndex === i ? " (recommended)" : "";
            lines.push(`  [${i + 1}] ${req.options[i]}${star}`);
        }
        lines.push("");
        lines.push("(type a number, or free-form text)");
    }
    if (req.multiline === true) {
        lines.push("");
        lines.push(`(end with ${sentinel} on its own line; EOF to cancel)`);
    }
    return lines.join("\n");
}
/**
 * Read a single line from `input` (until the first
 * newline, or EOF, or abort). Returns `null` on EOF
 * or abort. Interprets the input as an option-picker
 * choice when `options` is non-empty.
 */
async function readSingleLine(input, signal, output, options) {
    const line = await readLine(input, signal, output);
    if (line === null) {
        return { value: "", cancelled: true, cancelledReason: "aborted" };
    }
    // Trim trailing whitespace (the line includes the
    // newline; the user might also have trailing spaces).
    const trimmed = line.trim();
    // Options-picker: try to interpret the input as a
    // 1-based index into `options`. Falls through to
    // free-form when the input doesn't parse as a
    // number in range.
    if (options !== undefined && options.length > 0) {
        const asNumber = Number.parseInt(trimmed, 10);
        if (Number.isInteger(asNumber) &&
            asNumber >= 1 &&
            asNumber <= options.length) {
            const idx = asNumber - 1;
            return {
                value: options[idx],
                optionIndex: idx,
                cancelled: false,
            };
        }
    }
    return { value: trimmed, cancelled: false };
}
/**
 * Read a multiline block terminated by the sentinel on
 * its own line.
 *
 * **EOF semantics:**
 * - **No lines collected** (EOF before any input) →
 *   `cancelled: true`, `cancelledReason: "aborted"`. The
 *   human didn't type anything useful.
 * - **Some lines collected** (EOF mid-block) → return
 *   the partial value with `cancelled: false`. The human
 *   typed something useful before the connection
 *   dropped; the model can use it. Strict "EOF = cancel"
 *   would discard real human input.
 */
async function readMultiline(input, req, sentinel, output) {
    const lines = [];
    while (true) {
        const line = await readLine(input, req.signal, output);
        if (line === null) {
            if (lines.length > 0) {
                return { value: lines.join("\n"), cancelled: false };
            }
            return { value: "", cancelled: true, cancelledReason: "aborted" };
        }
        if (line === sentinel) {
            break;
        }
        lines.push(line);
    }
    return { value: lines.join("\n"), cancelled: false };
}
/**
 * Read one line from `input`. Returns the line WITHOUT
 * the trailing newline, or `null` on EOF / abort.
 *
 * **Algorithm:** the input stream is consumed
 * byte-by-byte (via a `for await` over `input[Symbol.asyncIterator]`)
 * until we see a `\n`. Abort is checked before every
 * chunk + between bytes.
 *
 * **Why byte-by-byte:** the test fakes push small chunks
 * (e.g. `"line 1\n"` in one chunk). A line-buffered
 * read would work for both small + large lines, but
 * `for await` over `readable` is the canonical Node
 * pattern and works for arbitrary chunk sizes.
 */
async function readLine(input, signal, output) {
    // Buffer accumulates bytes until we see a newline.
    const buf = [];
    const iter = input[Symbol.asyncIterator]();
    // Track an abort promise so we can race the iterator
    // against an abort.
    let onAbort;
    const abortPromise = new Promise((resolve) => {
        if (signal.aborted) {
            resolve("abort");
            return;
        }
        onAbort = () => resolve("abort");
        signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
        while (true) {
            // Race the next chunk against an abort.
            const nextResult = iter.next();
            const raceResult = await Promise.race([
                nextResult.then((r) => ({ kind: "chunk", r })),
                abortPromise.then(() => ({ kind: "abort" })),
            ]);
            if (raceResult.kind === "abort") {
                // Drain the iterator + close any handles. The
                // caller will see the abort via the signal
                // (`signal.aborted === true`).
                void iter.return?.();
                return null;
            }
            const { r } = raceResult;
            if (r.done === true) {
                // EOF. If we have a partial line (no trailing
                // newline), return it; otherwise null.
                if (buf.length === 0)
                    return null;
                return Buffer.concat(buf).toString("utf8");
            }
            // Process the chunk. We split on `\n` so a chunk
            // that contains multiple lines advances the
            // buffer correctly (e.g. test fakes sometimes
            // push `"line 1\nline 2\n"` as one chunk).
            const value = r.value;
            const chunkBuf = Buffer.isBuffer(value)
                ? value
                : typeof value === "string"
                    ? Buffer.from(value, "utf8")
                    : Buffer.from(value);
            // Search for newline in the chunk.
            let nlIdx = -1;
            for (let i = 0; i < chunkBuf.length; i++) {
                if (chunkBuf[i] === 0x0a /* \n */) {
                    nlIdx = i;
                    break;
                }
            }
            if (nlIdx === -1) {
                // No newline in this chunk — buffer it.
                buf.push(chunkBuf);
                continue;
            }
            // Newline found. Everything up to (but not including)
            // the newline is the line; everything after is
            // the start of the next line. We push the
            // remainder back into the stream so the next
            // readLine call picks it up.
            const lineBytes = Buffer.concat([...buf, chunkBuf.subarray(0, nlIdx)]);
            buf.length = 0;
            const remainder = chunkBuf.subarray(nlIdx + 1);
            if (remainder.length > 0) {
                // Unshift the remainder so it's read first on
                // the next call. We use a tiny UnshiftBuffer
                // helper to avoid pulling in a stream library.
                unshiftChunk(iter, remainder);
            }
            // Echo the line to `output` (REPL convention;
            // the user sees their own input).
            output.write(lineBytes.toString("utf8") + "\n");
            return lineBytes.toString("utf8");
        }
    }
    finally {
        if (onAbort !== undefined) {
            signal.removeEventListener("abort", onAbort);
        }
    }
}
/**
 * Push `chunk` back to the front of the async iterator
 * so the next `iter.next()` returns it as the next
 * value.
 *
 * **Implementation:** we replace the iterator's `next`
 * method with a wrapper that returns `chunk` first, then
 * delegates to the original. The wrapper is per-iterator;
 * we store the replacement on the iterator object.
 */
function unshiftChunk(iter, chunk) {
    const u = iter;
    if (u._unshift === undefined) {
        u._unshift = [];
    }
    u._unshift.push(chunk);
    // Wrap `next` so the next call returns the unshifted
    // chunk first. We re-wrap each time the queue is
    // exhausted.
    const originalNext = iter.next.bind(iter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    iter.next = async () => {
        const next = u._unshift.shift();
        if (next !== undefined) {
            return { value: next, done: false };
        }
        // Restore the original `next` so subsequent calls
        // go directly to the underlying iterator.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iter.next = originalNext;
        return originalNext();
    };
}
//# sourceMappingURL=repl-stdin.js.map