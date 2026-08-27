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
import { CliError, EXIT_USAGE, InMemorySession, newSessionId, SessionStore, } from "../index.js";
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
export async function resolveSession(parsed, meta, sessionDir, stderr) {
    // --resume-remote requires the mesh adapter (Package 3).
    // Package 1 parses the flag and fails clearly — no network.
    if (parsed.resumeRemote) {
        const parts = parsed.resumeRemote.split("/");
        if (parts.length < 2 || parts[0] === "" || parts.slice(1).join("/") === "") {
            throw new CliError("--resume-remote expects <node>/<session>", EXIT_USAGE);
        }
        throw new CliError(`--resume-remote ${parsed.resumeRemote} requires mesh adapter (Package 3)`, EXIT_USAGE);
    }
    // --resume and --fork are mutually exclusive.
    if (parsed.resume && parsed.fork) {
        throw new CliError("--resume and --fork are mutually exclusive (pick one)", EXIT_USAGE);
    }
    // --resume and --persist are mutually exclusive too (the REPL
    // path enforces the same rule; the one-shot path silently
    // ignored --persist before).
    if (parsed.resume && parsed.persist) {
        throw new CliError("--resume and --persist are mutually exclusive (pick one)", EXIT_USAGE);
    }
    // Default: in-memory session.
    if (!parsed.resume && !parsed.fork && !parsed.persist) {
        return new InMemorySession(newSessionId(), meta);
    }
    // --resume, --fork, --persist all need a SessionStore.
    const store = new SessionStore({ dir: sessionDir });
    // --resume: load and return.
    if (parsed.resume) {
        try {
            const session = await store.load(parsed.resume);
            // Stamp provenance so a later checkpoint/round-trip
            // records that this process resumed the session.
            if (session.metadata.provenance === undefined) {
                session.metadata.provenance = { resumedFrom: parsed.resume };
            }
            else if (session.metadata.provenance.resumedFrom === undefined) {
                session.metadata.provenance = {
                    ...session.metadata.provenance,
                    resumedFrom: parsed.resume,
                };
            }
            if ("checkpoint" in session && typeof session.checkpoint === "function") {
                await session.checkpoint({ resumedFrom: parsed.resume });
            }
            return session;
        }
        catch (err) {
            if (err instanceof CliError)
                throw err;
            throw new CliError(`failed to load session ${parsed.resume}: ${err.message}`, EXIT_USAGE);
        }
    }
    // --fork: load the source, copy messages to a new session.
    if (parsed.fork) {
        let source;
        try {
            source = await store.load(parsed.fork);
        }
        catch (err) {
            throw new CliError(`failed to load session ${parsed.fork} for fork: ${err.message}`, EXIT_USAGE);
        }
        // Create a new persisted session with a fresh id.
        // Inherit the source's title if set, else use the new
        // session's title (the user can /rename later).
        const newMeta = {
            cwd: meta.cwd,
            ...(meta.permissionMode !== undefined
                ? { permissionMode: meta.permissionMode }
                : {}),
            startedAt: meta.startedAt,
            title: source.metadata.title ?? meta.title ?? "forked session",
        };
        const forked = await store.createWithId(newSessionId(), newMeta);
        // Copy the source's messages.
        for (const m of source.messages) {
            forked.appendMessage(m.role, m.content);
        }
        stderr.write(`forked session ${parsed.fork} -> new session ${forked.id}\n`);
        return forked;
    }
    // --persist: create a new persisted session.
    const session = await store.create(meta);
    stderr.write(`persisted session: ${session.id}\n`);
    return session;
}
//# sourceMappingURL=resolve.js.map