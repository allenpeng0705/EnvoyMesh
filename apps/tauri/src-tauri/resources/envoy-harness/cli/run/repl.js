/**
 * The `--repl` dispatch. Extracted in T3.2 from
 * `cli/run.ts`.
 *
 * Wraps `runRepl` (the F17.1 interactive loop) and
 * converts its result to a `RunResult` for symmetry
 * with the one-shot path. The REPL has its own
 * persistence wiring (it calls `sessionStore.load`
 * lazily inside the loop), so this dispatcher
 * doesn't use `resolveSession`.
 *
 * **F14.2 persistence wiring:**
 * - `--session-dir <path>` + `--resume <id>`: load the
 *   persisted session and pass `sessionStore +
 *   resumeFromId` to the loop.
 * - `--session-dir <path>` + `--persist` (no `--resume`):
 *   create a new persisted session and pass
 *   `createSession` (a factory that the loop awaits).
 * - Otherwise: the default in-memory session
 *   (no `sessionStore` / `resumeFromId` / `createSession`).
 *
 * `CliError(EXIT_USAGE)` surfaces the "missing
 * session" / "bad file" cases (so the bin script's
 * exit code is 64, not 1). All other errors
 * propagate as `Error` (a programming bug).
 */
import { EXIT_USAGE, SessionStore, runRepl, } from "../../index.js";
import { CliError } from "./errors.js";
import { defaultSessionDir, resolveModel } from "./helpers.js";
export async function runReplDispatch(parsed, options, stdout, stderr) {
    // Resolve the model the same way `runAgent` does: use the
    // injected model if provided, else dispatch via --provider +
    // env vars.
    const model = resolveModel(parsed, options);
    // F14.2: build the persistence options. Three modes
    // (see also the same block in `runAgent` / `resolveSession`):
    //   1. --resume <id>  → load the persisted session.
    //   2. --persist      → create a new persisted session.
    //   3. neither        → default in-memory.
    // `--resume` + `--fork` are mutually exclusive (F14.1
    // enforces this in `resolveSession` for the one-shot
    // path; we don't accept `--fork` in REPL mode at
    // all — it's a one-shot concept).
    if (parsed.resume && parsed.persist) {
        throw new CliError("--resume and --persist are mutually exclusive in --repl mode (pick one)", EXIT_USAGE);
    }
    // We collect the persistence options for the
    // `runRepl` call below. We need a SessionStore
    // for both --resume and --persist; the Session
    // instance itself is built lazily (either by
    // `sessionStore.load(id)` for --resume, or by
    // the `createSession` factory for --persist).
    let sessionStore;
    let resumeFromId;
    let createSession;
    if (parsed.resume || parsed.persist) {
        sessionStore = new SessionStore({ dir: defaultSessionDir(parsed) });
        if (parsed.resume) {
            // Validate the session exists up front (the
            // loop would also throw on `sessionStore.load`,
            // but doing it here gives us a clean
            // `CliError(EXIT_USAGE)` for the bin script).
            if (!(await sessionStore.exists(parsed.resume))) {
                throw new CliError(`--resume: session not found: ${parsed.resume}`, EXIT_USAGE);
            }
            resumeFromId = parsed.resume;
            stderr.write(`resumed session: ${parsed.resume}\n`);
        }
        else {
            // --persist: create a new persisted session.
            // We build a `SessionMetadata` from the parsed
            // args (cwd + sandbox). The loop awaits the
            // factory; the file is created on first call.
            const meta = {
                cwd: parsed.cwd ?? options.cwd ?? process.cwd(),
                permissionMode: parsed.sandbox ?? "read-only",
                startedAt: new Date().toISOString(),
                title: "repl",
            };
            const store = sessionStore;
            createSession = async () => {
                const s = await store.create(meta);
                // Print the new session id to stderr so the
                // user can --resume it later.
                stderr.write(`persisted session: ${s.id}\n`);
                return s;
            };
        }
    }
    const replResult = await runRepl({
        model,
        args: parsed,
        ...(options.hooks ? { hooks: options.hooks } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
        ...(options.lineReader ? { lineReader: options.lineReader } : {}),
        ...(options.skills ? { skills: options.skills } : {}),
        ...(sessionStore ? { sessionStore } : {}),
        ...(resumeFromId ? { resumeFromId } : {}),
        ...(createSession ? { createSession } : {}),
        stdout,
        stderr,
    });
    return {
        subcommand: "run",
        content: "",
        stopReason: "end_turn",
        sessionId: replResult.sessionId,
        iterations: replResult.turns,
        toolCalls: 0,
    };
}
//# sourceMappingURL=repl.js.map