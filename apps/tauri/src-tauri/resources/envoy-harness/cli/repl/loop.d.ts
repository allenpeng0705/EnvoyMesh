/**
 * F17.1 + F17.2 — REPL loop.
 *
 * The interactive REPL reads lines, dispatches them to a long-lived
 * `Agent`, and prints the result. A single `Agent` is reused across
 * turns so the session, hooks, AGENTS.md, and permission state are
 * preserved.
 *
 * **Scope:**
 * - F17.1: loop + agent reuse + exit on `/quit`, `/exit`, or EOF.
 * - F17.2: slash command registry (built-ins: `/help`, `/model`,
 *   `/provider`, `/sandbox`, `/approval`, `/clear`, `/cost`,
 *   `/status`, `/quit`; host-extensible via
 *   `ReplOptions.customCommands`).
 *
 * **Out of scope (later chunks):**
 * - History persistence (F17.3).
 * - Tab completion (deferred to F17.5 if needed).
 * - TUI rendering (out of scope for v0; plain readline + ANSI).
 *
 * **Design doc:** `docs/design.en.md` (Phase 6 F17).
 * **Implementation plan:** `docs/implementation-plan.md` §6.7.
 */
import type { ReplOptions, ReplResult } from "./types.js";
/**
 * Run the REPL. Returns when the user types `/quit`/`/exit` or
 * hits Ctrl-D. Errors from the agent loop print to stderr but
 * don't kill the REPL (the next turn can still run).
 *
 * **Why a separate `runRepl` (not inlined into `runAgent`)?**
 * the lifecycle is different: `runAgent` is one-shot (build → run
 * → print → exit), `runRepl` is long-lived (build once → loop).
 * Keeping them separate makes the dispatch in `run.ts` a clean
 * `if (args.repl) runRepl(...) else runAgent(...)`.
 */
export declare function runRepl(opts: ReplOptions): Promise<ReplResult>;
//# sourceMappingURL=loop.d.ts.map