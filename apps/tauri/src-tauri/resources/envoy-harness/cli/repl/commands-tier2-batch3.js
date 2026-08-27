// ---------------------------------------------------------------------------
// 1. /rename <title> — set the session's display title
// ---------------------------------------------------------------------------
/**
 * Maximum title length. codex uses 100; claudecode
 * uses ~80. We default to 100 to match the codex
 * convention. Titles longer than this are truncated
 * with a warning (the session still works; the
 * truncation is for display only).
 */
const MAX_TITLE_LENGTH = 100;
/**
 * `/rename <title>` — update the session's display
 * title. The title is shown by `/session` (F17.2.5)
 * and is persisted in the `PersistedSession` JSONL
 * header. When the session is in-memory, the title
 * is mutated in place.
 *
 * **v0 argument shape:** all whitespace-separated
 * tokens after `/rename` are joined with a single
 * space. The title is a single line (no embedded
 * newlines). Empty title → "title cannot be empty"
 * to stderr.
 *
 * **Why "title" and not "name":** codex/claudecode
 * both use the word "rename" but treat the value
 * as a label (e.g. "fix login bug"). We use "title"
 * internally (matches the `SessionMetadata.title`
 * field) but the user-facing command is `/rename`
 * (matches the codex/claudecode convention).
 */
const renameCommand = {
    name: "/rename",
    description: "set the session's display title (visible in /session and persisted sessions)",
    handler(args, ctx) {
        if (args.length === 0) {
            ctx.stderr.write("error: /rename requires a title argument\n");
            return;
        }
        const raw = args.join(" ").trim();
        if (raw.length === 0) {
            ctx.stderr.write("error: title cannot be empty\n");
            return;
        }
        // Collapse internal whitespace to single spaces;
        // strip leading/trailing whitespace. The session
        // metadata is intended for single-line display.
        const title = raw.replace(/\s+/g, " ");
        let final = title;
        let truncated = false;
        if (title.length > MAX_TITLE_LENGTH) {
            final = title.slice(0, MAX_TITLE_LENGTH - 1) + "…";
            truncated = true;
        }
        // Use the Agent's public setTitle (it delegates to
        // `Session.setTitle`; the session field itself is
        // private). Persisted sessions write through to disk.
        ctx.agent.setTitle(final);
        if (truncated) {
            ctx.stdout.write(`renamed: ${final} (truncated to ${MAX_TITLE_LENGTH} chars)\n`);
        }
        else {
            ctx.stdout.write(`renamed: ${final}\n`);
        }
    },
};
// ---------------------------------------------------------------------------
// 2. /copy — print the last assistant response
// ---------------------------------------------------------------------------
/**
 * `/copy` — print the last assistant text from the
 * most recent agent turn. The REPL's loop tracks
 * this in `ReplContext.lastResponse` (set after
 * every turn's `agent.run` call). When no turn
 * has happened yet, prints "no response yet" to
 * stderr.
 *
 * **Why print, not clipboard:** the v0 CLI runs in
 * a non-interactive environment (CI, scripted
 * runs, `envoy-harness --repl` in a tmux pane).
 * The "copy" verb in the user-facing sense is
 * "give me the text so I can do something with
 * it" — piping to `pbcopy`, `xclip`, or just
 * reading the terminal scrollback. A real
 * clipboard integration is a host concern
 * (the Tauri app can wire it; the v0 CLI
 * shouldn't try).
 *
 * **v0 limitations:**
 * - Only the LAST response. No `/copy <n>` for
 *   older turns. A future chunk can add a
 *   message index (F14.3+ candidate, or skip).
 * - Empty responses (model returned a tool call
 *   only) print "(no text in last response)".
 *   The user can still `/diff` or inspect the
 *   session file.
 */
const copyCommand = {
    name: "/copy",
    description: "print the last assistant response (so you can copy it manually)",
    handler(_args, ctx) {
        const text = ctx.lastResponse;
        if (text === undefined) {
            ctx.stderr.write("no response yet (run a turn first)\n");
            return;
        }
        if (text.length === 0) {
            ctx.stdout.write("(no text in last response)\n");
            return;
        }
        ctx.stdout.write(text);
        if (!text.endsWith("\n")) {
            ctx.stdout.write("\n");
        }
    },
};
// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------
/**
 * F14.1: list of the 2 Tier 2 batch 3 commands. The
 * runner includes this in the default registry after
 * `BUILTIN_TIER2_BATCH2_COMMANDS` (built-ins always
 * win on name collision).
 *
 * **Defined last** because each entry is a `const`
 * declared above. Forward references in `const`
 * arrays would force us to either inline the
 * literals (less readable) or convert each command
 * to a function declaration (less idiomatic for a
 * data literal). The bottom-of-file position is
 * the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts`,
 * `BUILTIN_INFO_COMMANDS` in `commands-info.ts`,
 * `BUILTIN_TIER2_COMMANDS` in `commands-tier2.ts`,
 * and `BUILTIN_TIER2_BATCH2_COMMANDS` in
 * `commands-tier2-batch2.ts`).
 */
// ---------------------------------------------------------------------------
// 3. /memory — memory store commands (list / read / add)
// ---------------------------------------------------------------------------
/**
 * `/memory <subcommand> ...` — inspect + write the
 * memory store. Subcommands:
 *
 * - `list` — print the title of every memory.
 * - `read <name>` — print one memory's full body.
 * - `add <name> <body>` — write a new memory.
 *
 * **Why a single `/memory` command (not three
 * separate slash commands):** the slash-command
 * namespace is finite; using 3 slots for one
 * capability wastes it. The subcommand dispatcher
 * keeps the surface minimal.
 *
 * **Hermetic:** no LLM. The store reads + writes
 * files. `add` is the user-as-judge path; the LLM
 * path lives in `consolidateMemories` (called by
 * the host at session end, not from a slash
 * command).
 */
const memoryCommand = {
    name: "/memory",
    description: "memory commands. Subcommands: list, read <name>, add <name> <body>.",
    async handler(args, ctx) {
        if (!ctx.memoryStore) {
            ctx.stderr.write("no memory store configured\n");
            return;
        }
        const sub = args[0] ?? "list";
        switch (sub) {
            case "list": {
                const list = await ctx.memoryStore.list();
                if (list.length === 0) {
                    ctx.stdout.write("(no memories)\n");
                    return;
                }
                for (const m of list) {
                    const tags = m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
                    ctx.stdout.write(`- ${m.name}${tags} — ${m.title}\n`);
                }
                return;
            }
            case "read": {
                const name = args[1];
                if (name === undefined) {
                    ctx.stderr.write("usage: /memory read <name>\n");
                    return;
                }
                const mem = await ctx.memoryStore.read(name);
                if (mem === undefined) {
                    ctx.stderr.write(`memory not found: ${name}\n`);
                    return;
                }
                ctx.stdout.write(`# ${mem.title}\n\n${mem.body}\n`);
                return;
            }
            case "add": {
                const name = args[1];
                const body = args.slice(2).join(" ");
                if (name === undefined || body.length === 0) {
                    ctx.stderr.write("usage: /memory add <name> <body>\n");
                    return;
                }
                try {
                    await ctx.memoryStore.write({
                        name,
                        title: titleFromName(name),
                        tags: [],
                        created: new Date().toISOString().slice(0, 10),
                        body,
                    });
                    ctx.stdout.write(`added: ${name}\n`);
                }
                catch (err) {
                    ctx.stderr.write(`error: ${err.message}\n`);
                }
                return;
            }
            default:
                ctx.stderr.write(`unknown /memory subcommand: ${sub} (try: list, read, add)\n`);
        }
    },
};
/** Default title for a newly-added memory: a
 *  humanized version of the name. The user can
 *  rename via the underlying store (or a future
 *  `/memory edit` command). */
function titleFromName(name) {
    return name
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}
export const BUILTIN_TIER2_BATCH3_COMMANDS = [
    renameCommand,
    copyCommand,
    memoryCommand,
];
//# sourceMappingURL=commands-tier2-batch3.js.map