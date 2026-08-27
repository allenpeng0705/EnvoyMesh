/**
 * F17.2 — Slash command registry.
 *
 * A small registry that maps `/command` names to handlers.
 * The built-in commands (in `commands.ts`) are registered
 * by default. Hosts can extend via `ReplOptions.customCommands`;
 * built-ins always win on name collision.
 *
 * **Dispatch flow:**
 *
 * 1. The REPL reads a line.
 * 2. If the line starts with `/`, call `parseCommandLine` to
 *    split into `{ name, args }`.
 * 3. Look up the name in the registry (case-sensitive).
 * 4. If found, invoke `handler(args, ctx)`. If `handler` throws,
 *    the REPL prints `error: <message>` to stderr.
 * 5. If not found, the REPL prints `unknown command: <name>`
 *    + the help text to stderr.
 *
 * **Why a class (not a plain object)?** a class lets `runRepl`
 * register the built-ins once (per process lifetime) and add
 * `customCommands` per call. A plain `Map` would have to
 * rebuild on every `runRepl` call.
 *
 * **Stability:** the registry is the public API for slash
 * commands. Adding new built-ins is additive.
 */
import type { ReplCommand, ReplContext } from "./types.js";
/**
 * The slash command registry. Built-ins are registered on
 * construction; hosts can layer custom commands via
 * `registerAll(customCommands)`. The registry is mutable
 * but thread-unsafe — `runRepl` is the only writer in v0.
 */
export declare class ReplCommandRegistry {
    private commands;
    /**
     * Register a single command. Overwrites any existing
     * command with the same name.
     */
    register(command: ReplCommand): void;
    /**
     * Register many commands at once. Built-ins are
     * registered first; the host's `customCommands` are
     * registered second, but `register` is order-insensitive
     * within a batch (last write wins on name collision).
     * The runner uses a different order (built-ins always
     * win) — see `buildRegistry` below.
     */
    registerAll(commands: ReadonlyArray<ReplCommand>): void;
    /** Look up a command by name. Returns `undefined` if not found. */
    lookup(name: string): ReplCommand | undefined;
    /**
     * List all non-hidden commands, sorted by name. Used by
     * `/help`.
     */
    listVisible(): ReplCommand[];
    /** Total registered commands (for diagnostics). */
    get size(): number;
}
/**
 * Tokenize a line that starts with `/`. The first token
 * (the slash name) is the `name`; the rest are `args`
 * (split on whitespace, no quote handling in v0).
 *
 * Returns `null` for lines that don't start with `/` (the
 * caller should send them to the model). Returns
 * `{ name: "", args: [] }` for `/` with no name (the
 * caller should print help).
 *
 * **Why a separate function?** testable in isolation;
 * the dispatcher doesn't need to know about tokenization.
 */
export declare function parseCommandLine(line: string): {
    name: string;
    args: ReadonlyArray<string>;
} | null;
/**
 * Dispatch a parsed command to its handler. Returns
 * `{ kind: "ok" }` on success, `{ kind: "exit" }` for
 * `/quit` (or its aliases), or `{ kind: "unknown", name }`
 * if the command isn't registered.
 *
 * The dispatcher catches handler errors and returns
 * `{ kind: "error", message }` so the REPL can print
 * `error: <message>` to stderr without killing the loop.
 */
export type DispatchResult = {
    kind: "ok";
} | {
    kind: "exit";
} | {
    kind: "unknown";
    name: string;
} | {
    kind: "error";
    message: string;
};
/**
 * The set of names that trigger a clean exit. The
 * dispatcher returns `{ kind: "exit" }` for these; the
 * REPL's `for await` loop sees this and breaks.
 *
 * **Exported** because the loop also uses this to skip
 * exit commands from the history (F17.3 — exit
 * commands are noise in the persisted history).
 */
export declare const EXIT_NAMES: ReadonlySet<string>;
export declare function dispatchCommand(registry: ReplCommandRegistry, name: string, args: ReadonlyArray<string>, ctx: ReplContext): Promise<DispatchResult>;
//# sourceMappingURL=registry.d.ts.map