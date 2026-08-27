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
import type { Readable, Writable } from "node:stream";
import type { UserQuestionProvider } from "../user-questions.js";
/** The default multiline-mode sentinel. `"""` on its own line ends input. */
export declare const DEFAULT_MULTILINE_SENTINEL = "\"\"\"";
/** Constructor options for `createReplStdinProvider`. */
export interface ReplStdinProviderOptions {
    /**
     * The stream to read from. Default `process.stdin`.
     * Tests inject a `Readable.from([...])` to drive the
     * provider without spawning a real REPL.
     */
    input?: Readable;
    /**
     * The stream to write the prompt to. Default
     * `process.stdout`. Tests inject a `Writable` that
     * pushes into an array.
     */
    output?: Writable;
    /**
     * The multiline-mode end-of-input sentinel. Default
     * `"""` (Python convention). Set to a different string
     * if the user is likely to need to type `"""` literally.
     */
    multilineSentinel?: string;
    /**
     * The provider name. Default `"repl-stdin"`. Stable
     * identifier used by `/user-questions status`.
     */
    name?: string;
}
/**
 * Create the REPL stdin provider. Default name
 * `"repl-stdin"`. The provider honors `req.signal`
 * (stops reading on abort).
 */
export declare function createReplStdinProvider(opts?: ReplStdinProviderOptions): UserQuestionProvider;
//# sourceMappingURL=repl-stdin.d.ts.map