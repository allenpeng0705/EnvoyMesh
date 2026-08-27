/**
 * F17.1 + F17.2 — REPL types.
 *
 * The interactive REPL reads lines from a `LineReader`, dispatches
 * them to a long-lived `Agent`, and prints the result. A single
 * `Agent` is reused across turns (so the session, hooks, AGENTS.md,
 * and permission state are preserved).
 *
 * **Scope:**
 * - F17.1: the loop + agent reuse + exit on `/quit`, `/exit`, or EOF.
 * - F17.2: slash command registry (`/help`, `/model`, `/provider`,
 *   `/sandbox`, `/approval`, `/clear`, `/cost`, `/status`,
 *   `/quit` + aliases).
 * - F17.3: history persistence (deferred).
 *
 * **Design doc:** `docs/design.en.md` (Phase 6 F17).
 * **Implementation plan:** `docs/implementation-plan.md` §6.7.
 */
export {};
//# sourceMappingURL=types.js.map