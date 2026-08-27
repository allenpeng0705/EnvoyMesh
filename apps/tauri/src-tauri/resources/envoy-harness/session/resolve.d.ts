/**
 * Session resolution — moved from `cli/run.ts`
 * in T3.2.
 *
 * The function decides which `Session` instance
 * to hand to the agent loop, based on the CLI
 * flags `--resume`, `--fork`, `--persist`, and
 * the default (in-memory). The CLI calls this
 * once per `run` / `repl` invocation; the REPL
 * loop has its own persistence wiring (see
 * `runReplDispatch` in `cli/run/repl.ts`).
 *
 * **Why a separate file:** the function is
 * session-resolver logic, not CLI plumbing.
 * It belongs next to `Session` / `SessionStore`
 * in `src/session/`, not in `src/cli/run/`. The
 * move also unblocks a future non-CLI caller
 * (e.g. a programmatic `resolveSession` from
 * a Tauri menu) — the function now has no
 * `cli/run`-internal dependencies.
 */
import { type Session, type SessionMetadata } from "../index.js";
import type { ParsedArgs } from "../cli/argv.js";
/**
 * Resolve the session for a CLI invocation. The
 * three modes:
 *
 * 1. `--resume <id>` — load from disk, return.
 *    The loaded session's `metadata.cwd` +
 *    `permissionMode` win (the user might have
 *    changed cwd since they created the session;
 *    that's their call).
 * 2. `--fork <id>` — load the source, copy the
 *    messages into a NEW persisted session (fresh
 *    id), return the new one. The new id is
 *    written to stderr so the user can `--resume`
 *    it later.
 * 3. `--persist` (no `--resume` / `--fork`) —
 *    create a new persisted session.
 * 4. (none of the above) — return a fresh
 *    in-memory session.
 *
 * **Mutual exclusion:** `--resume` + `--fork`
 * and `--resume` + `--persist` throw
 * `CliError(EXIT_USAGE)`.
 *
 * @param parsed the parsed argv (must have
 *              `subcommand: "run"`)
 * @param meta the session metadata to use when
 *             creating a new session
 * @param sessionDir the on-disk directory (used
 *                   for `--resume` / `--fork` /
 *                   `--persist`); the CLI computes
 *                   this via `defaultSessionDir`
 * @param stderr the stderr writable (for the
 *               "forked session X -> Y" and
 *               "persisted session: Y" lines)
 */
export declare function resolveSession(parsed: Extract<ParsedArgs, {
    subcommand: "run";
}>, meta: SessionMetadata, sessionDir: string, stderr: NodeJS.WritableStream): Promise<Session>;
//# sourceMappingURL=resolve.d.ts.map