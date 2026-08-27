/**
 * F17.2.5 — Tier 1 info commands.
 *
 * 8 print/info commands that fill the gap between the F17.2
 * basics and what codex / claude-code / pi ship. The data
 * sources already exist (`agent.getCost`, `agent.getSessionId`,
 * `agent.getLspServers`, `agent.getHooks`, the scoreboard
 * from F6, the verifier from §12, the TOML profile config
 * from the README); these commands just format them.
 *
 * **Tier 1 = no new agent capabilities.** No compaction
 * algorithm, no AGENTS.md generation, no journaled action
 * log. Just data display.
 *
 * | Command             | Source                                |
 * |---------------------|---------------------------------------|
 * | `/session`          | `agent.getSessionId()`                 |
 * | `/context`          | `agent.getMessageCount()` + `getCost()`|
 * | `/scoreboard`       | `ctx.scoreboard` (F6, optional)       |
 * | `/rules`            | `ctx.verifierRules` (optional)        |
 * | `/lsp`              | `agent.getLspServers()`                |
 * | `/hooks`            | `agent.getHooks()`                     |
 * | `/mcp`              | v0 placeholder (no MCP servers yet)   |
 * | `/profile [name]`   | `ctx.profileLoader` (optional)         |
 *
 * **Stability:** `BUILTIN_INFO_COMMANDS` is the public surface.
 * Adding new info commands is additive.
 */
import type { ReplCommand } from "./types.js";
/**
 * The shape of a TOML profile, as documented in the README.
 * Keys are optional (a profile may set only some of them).
 */
export interface ReplProfile {
    provider?: string;
    model?: string;
    sandbox?: string;
    approval?: string;
    [key: string]: unknown;
}
/**
 * F17.2.5: list of the 8 Tier 1 info commands. The runner
 * includes this in the default registry alongside the
 * F17.2 commands (`BUILTIN_COMMANDS`).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts`).
 */
export declare const BUILTIN_INFO_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands-info.d.ts.map