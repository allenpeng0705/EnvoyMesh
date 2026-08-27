/**
 * F17.2 — Built-in slash commands.
 *
 * The REPL ships with 9 slash commands that operate on
 * local state (no model call):
 *
 * | Command            | Effect                                                |
 * |--------------------|-------------------------------------------------------|
 * | `/help`            | List all visible commands.                            |
 * | `/model <id>`      | Swap the model adapter (F17.2 setter).                 |
 * | `/provider <name>` | Swap via `createProviderAdapter` (env-driven).        |
 * | `/sandbox <mode>`  | Change permission mode (rebuilds the policy).         |
 * | `/approval <mode>` | Change the per-call approval policy.                  |
 * | `/clear`           | Reset the session transcript (keep AGENTS.md).        |
 * | `/cost`            | Print accumulated cost + token usage.                 |
 * | `/status`          | Print current model / sandbox / turn count.           |
 * | `/quit`            | Exit the REPL. (alias: `/exit`)                       |
 *
 * **Why a function, not a class?** each command is a small
 * (5-20 LoC) `ReplCommand` literal. A class would just
 * hide the handler in `this.handle()` for no gain.
 *
 * **Note on `/sandbox` and `/approval`:** the Agent has
 * setters (`setPermissionMode`, `setAskHandler`) that
 * take effect on the next tool call. The Session's
 * `metadata.permissionMode` is immutable (per the Session
 * contract), so the running policy reflects the current
 * mode; the session's metadata reflects the start-of-
 * session mode. This is documented in the setter JSDoc.
 *
 * **Stability:** `BUILTIN_COMMANDS` is the public surface.
 * Adding new built-ins is additive; renaming or removing
 * one is a breaking change.
 */
import type { ReplCommand } from "./types.js";
/**
 * F17.2: list of the 9 built-in slash commands. The
 * registry picks this up by default. Hosts that want a
 * different set can pass `customCommands` instead (the
 * runner then ignores the built-ins).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix.
 */
export declare const BUILTIN_COMMANDS: ReadonlyArray<ReplCommand>;
//# sourceMappingURL=commands.d.ts.map