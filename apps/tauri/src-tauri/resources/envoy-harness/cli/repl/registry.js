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
/**
 * The slash command registry. Built-ins are registered on
 * construction; hosts can layer custom commands via
 * `registerAll(customCommands)`. The registry is mutable
 * but thread-unsafe — `runRepl` is the only writer in v0.
 */
export class ReplCommandRegistry {
    commands = new Map();
    /**
     * Register a single command. Overwrites any existing
     * command with the same name.
     */
    register(command) {
        this.commands.set(command.name, command);
    }
    /**
     * Register many commands at once. Built-ins are
     * registered first; the host's `customCommands` are
     * registered second, but `register` is order-insensitive
     * within a batch (last write wins on name collision).
     * The runner uses a different order (built-ins always
     * win) — see `buildRegistry` below.
     */
    registerAll(commands) {
        for (const c of commands)
            this.register(c);
    }
    /** Look up a command by name. Returns `undefined` if not found. */
    lookup(name) {
        return this.commands.get(name);
    }
    /**
     * List all non-hidden commands, sorted by name. Used by
     * `/help`.
     */
    listVisible() {
        return Array.from(this.commands.values())
            .filter((c) => !c.hidden)
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    /** Total registered commands (for diagnostics). */
    get size() {
        return this.commands.size;
    }
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
export function parseCommandLine(line) {
    if (!line.startsWith("/"))
        return null;
    // Strip the leading `/` and split on whitespace.
    const trimmed = line.slice(1).trim();
    if (trimmed === "") {
        return { name: "", args: [] };
    }
    const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
    const name = `/${tokens[0] ?? ""}`;
    const args = tokens.slice(1);
    return { name, args };
}
/**
 * The set of names that trigger a clean exit. The
 * dispatcher returns `{ kind: "exit" }` for these; the
 * REPL's `for await` loop sees this and breaks.
 *
 * **Exported** because the loop also uses this to skip
 * exit commands from the history (F17.3 — exit
 * commands are noise in the persisted history).
 */
export const EXIT_NAMES = new Set(["/quit", "/exit"]);
export async function dispatchCommand(registry, name, args, ctx) {
    // Empty name (just `/` typed alone): show help.
    if (name === "") {
        return { kind: "unknown", name: "/" };
    }
    if (EXIT_NAMES.has(name)) {
        return { kind: "exit" };
    }
    const command = registry.lookup(name);
    if (!command) {
        return { kind: "unknown", name };
    }
    try {
        await command.handler(args, ctx);
        return { kind: "ok" };
    }
    catch (err) {
        return { kind: "error", message: err.message };
    }
}
//# sourceMappingURL=registry.js.map