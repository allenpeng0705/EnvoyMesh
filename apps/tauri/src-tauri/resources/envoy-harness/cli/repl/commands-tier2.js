/**
 * F17.5 — Tier 2 batch 1 commands (real features).
 *
 * Three commands that go beyond print/info:
 * - `/new` — start a fresh session (clear transcript + new id)
 * - `/compact` — context window compaction. Flags (chunk 1.2):
 *   - default → drop-oldest, keep last 20 messages
 *   - `--keep N` → drop-oldest with custom N
 *   - `--summarize` → LLM-summarize the dropped messages
 *   - `--budget N` → drop until total tokens ≤ N (token budget)
 * - `/init` — generate AGENTS.md via an LLM call + write to cwd
 *
 * **Why a separate file:** these commands need new Agent
 * capabilities (`newSession`, `compact`, `generateAgentsMd`).
 * The Tier 1 commands (F17.2.5) were pure data display.
 *
 * **Phase A / Item 1 (chunk 1.2):** added `--budget N` and
 * `--remote` flags. The `--remote` flag is parsed but the
 * v0 implementation is "log a warning + fall back to
 * budget" (the remote-history transport is a future chunk —
 * it needs a network or local-file target).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
/**
 * Default number of recent messages to keep when compacting.
 * Codex / Claude Code / pi use 20-30; we default to 20 to
 * match the lower end. The `--keep N` flag overrides.
 */
const DEFAULT_COMPACT_KEEP = 20;
/**
 * Default token budget for the `--budget` strategy. The
 * value is deliberately small enough to be observable in
 * tests (a transcript that fits under 100 tokens is rare
 * in real sessions; the default is for "I have no idea
 * how much room I have, give me a reasonable default").
 * Hosts that know the model's context window should pass
 * `--budget <window - headroom>` explicitly.
 */
const DEFAULT_COMPACT_BUDGET = 4000;
// ---------------------------------------------------------------------------
// 1. /new — start a fresh session
// ---------------------------------------------------------------------------
const newCommand = {
    name: "/new",
    description: "start a fresh session (new id, empty transcript)",
    handler(_args, ctx) {
        ctx.agent.newSession();
        ctx.stdout.write(`new session: ${ctx.agent.getSessionId()}\n`);
    },
};
/**
 * Parse the `/compact` argument list. Returns the parsed
 * flags + the error string (when the args are malformed).
 *
 * The parser is permissive about flag ORDER (flags can
 * appear in any position). Unknown flags are errors. A
 * trailing positional number is a backward-compat
 * shortcut for `--keep <n>` (preserves the v0 syntax
 * `/compact 5`).
 *
 * @example
 *   parseCompactArgs([])                                  // → {}
 *   parseCompactArgs(["5"])                                // → { keep: 5 }  (legacy)
 *   parseCompactArgs(["--keep", "5"])                      // → { keep: 5 }
 *   parseCompactArgs(["--summarize", "--budget", "1000"]) // → { summarize: true, budget: 1000 }
 */
function parseCompactArgs(args) {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        switch (a) {
            case "--keep": {
                const v = args[++i];
                if (v === undefined) {
                    return { result, error: "--keep requires a value" };
                }
                const n = Number(v);
                if (!Number.isFinite(n) || n <= 0) {
                    return { result, error: `invalid --keep value: ${v}` };
                }
                result.keep = n;
                break;
            }
            case "--summarize": {
                result.summarize = true;
                break;
            }
            case "--budget": {
                const v = args[++i];
                if (v === undefined) {
                    return { result, error: "--budget requires a value" };
                }
                const n = Number(v);
                // `--budget 0` is a valid (if degenerate) request:
                // the user is asking for an "as small as possible"
                // compaction. The underlying strategy returns
                // `overBudget: true` when the system message
                // alone exceeds 0 tokens, which is the expected
                // behavior. Negative values are still rejected.
                if (!Number.isFinite(n) || n < 0) {
                    return { result, error: `invalid --budget value: ${v}` };
                }
                result.budget = n;
                break;
            }
            case "--remote": {
                result.remote = true;
                break;
            }
            default: {
                // A flag-like string (`--foo`) is an unknown
                // flag — never a positional arg. This catches
                // typos BEFORE we try to interpret the string
                // as a number.
                if (a.startsWith("--")) {
                    return { result, error: `unknown flag: ${a}` };
                }
                // Backward-compat: a trailing positional number
                // is a shortcut for `--keep <n>`. The v0 syntax
                // was `/compact 5`. Only one positional is
                // allowed; a non-numeric positional is an error.
                if (result.keep !== undefined) {
                    return {
                        result,
                        error: `unexpected positional arg: ${a} (only one is allowed)`,
                    };
                }
                const n = Number(a);
                if (!Number.isFinite(n) || n <= 0) {
                    return { result, error: `invalid keep count: ${a}` };
                }
                result.keep = n;
                break;
            }
        }
    }
    return { result, error: undefined };
}
const compactCommand = {
    name: "/compact",
    description: "compact the session. Default: drop-oldest (keep last 20). " +
        "Flags: --keep N (custom keep count), --summarize (LLM-summarize the dropped part), " +
        "--budget N (token-budget strategy), --remote (remote-history stub).",
    async handler(args, ctx) {
        const { result: parsed, error } = parseCompactArgs(args);
        if (error !== undefined) {
            ctx.stderr.write(`error: ${error}\n`);
            return;
        }
        // `--remote` is a v0 stub. The remote-history
        // transport needs a target (mesh node or local file);
        // a future chunk wires it. For now, log a warning +
        // fall back to the budget strategy.
        if (parsed.remote) {
            ctx.stderr.write("warning: --remote is a stub in v0; falling back to --budget " +
                `(${DEFAULT_COMPACT_BUDGET} tokens)\n`);
            parsed.budget ??= DEFAULT_COMPACT_BUDGET;
            parsed.remote = false;
        }
        const before = ctx.agent.getMessageCount();
        // Dispatch by flag. The strategies are mutually
        // exclusive: --budget wins over --keep + --summarize
        // when both are set (the budget is the strongest
        // contract).
        if (parsed.budget !== undefined) {
            const r = ctx.agent.compactWithBudget(parsed.budget);
            const after = ctx.agent.getMessageCount();
            const note = r.overBudget
                ? " (over budget — consider --summarize)"
                : "";
            ctx.stdout.write(`compacted (budget): ${before} → ${after} messages ` +
                `(${r.totalTokensAfter} tokens, dropped ${r.droppedCount})${note}\n`);
            return;
        }
        if (parsed.summarize) {
            const keep = parsed.keep ?? DEFAULT_COMPACT_KEEP;
            try {
                await ctx.agent.compactWithSummary(keep, async (dropped) => {
                    const text = dropped
                        .map((m) => `${m.role}: ${JSON.stringify(m.content)}`)
                        .join("\n");
                    const result = await ctx.agent.getModel().complete({
                        messages: [
                            {
                                role: "system",
                                content: [
                                    {
                                        type: "text",
                                        text: "You are a session summarizer. Summarize the dropped " +
                                            "conversation below into 2-4 sentences, preserving " +
                                            "decisions, file paths, and unresolved questions. " +
                                            "Output ONLY the summary.",
                                    },
                                ],
                            },
                            { role: "user", content: [{ type: "text", text }] },
                        ],
                        tools: [],
                    });
                    return result.content
                        .filter((b) => b.type === "text")
                        .map((b) => b.text)
                        .join("\n")
                        .trim();
                });
            }
            catch (err) {
                ctx.stderr.write(`error: summarization failed (${err.message}); falling back to drop-oldest\n`);
                ctx.agent.compact(keep);
            }
            const after = ctx.agent.getMessageCount();
            ctx.stdout.write(`compacted (summarize): ${before} → ${after} messages (kept last ${keep}, with summary)\n`);
            return;
        }
        // Default: drop-oldest with optional --keep. The
        // output format matches the v0 contract — the test
        // suite asserts the EXACT string. New strategies
        // (--budget, --summarize) add their own labels
        // because they're opt-in.
        const keep = parsed.keep ?? DEFAULT_COMPACT_KEEP;
        ctx.agent.compact(keep);
        const after = ctx.agent.getMessageCount();
        ctx.stdout.write(`compacted: ${before} → ${after} messages (kept last ${keep})\n`);
    },
};
// ---------------------------------------------------------------------------
// 3. /init — generate AGENTS.md via the LLM
// ---------------------------------------------------------------------------
/**
 * System prompt for the AGENTS.md generator. The LLM is told
 * to examine the cwd and write a project-specific AGENTS.md
 * (similar to `claude /init` + `codex --init`).
 */
const INIT_SYSTEM_PROMPT = `You are an AGENTS.md generator.
Examine the current working directory using the read_file and
list_dir tools. Write a concise AGENTS.md (max 200 lines) that
captures:
- The project's purpose (what it does, in 1-2 sentences)
- The tech stack (language, framework, key dependencies)
- The build / test / lint commands
- Code style conventions (if you can infer them)
- Anything unusual about the project that an AI agent would
  need to know to be productive.

Output ONLY the AGENTS.md content (no commentary, no fences).
Do not include any other text.`;
/**
 * The single message we send to the model. The model uses
 * tools to inspect the cwd, then returns the AGENTS.md
 * content as the response text.
 */
const INIT_USER_PROMPT = "Examine the current working directory and write an AGENTS.md.";
/**
 * Parse a model response and return the text content.
 * v0: the model returns a flat text block (no tool calls
 * needed — the prompt is short and the model has direct
 * knowledge of the cwd via tools, but for v0 we keep it
 * simple: a single text response).
 *
 * **Why no tool loop:** the v0 implementation just sends a
 * single user message; the LLM responds with text. A future
 * chunk can add a proper tool loop (read_file + list_dir)
 * if the LLM needs to inspect the cwd.
 */
function extractText(content) {
    const parts = [];
    for (const block of content) {
        if (block.type === "text")
            parts.push(block.text);
    }
    return parts.join("\n").trim();
}
const initCommand = {
    name: "/init",
    description: "generate AGENTS.md for the current cwd",
    async handler(_args, ctx) {
        const cwd = ctx.args.cwd ?? process.cwd();
        const target = path.join(cwd, "AGENTS.md");
        // F-fix: `/init` writes a file. In a read-only session
        // (default, or after `/sandbox read-only`) that must be
        // refused — the sandbox policy applies to the REPL's own
        // commands too.
        if (ctx.agent.getPermissionMode() === "read-only") {
            ctx.stderr.write("error: /init writes AGENTS.md, but the session is read-only " +
                "(use /sandbox workspace-write first)\n");
            return;
        }
        // 1. Fire the model directly (NOT through `agent.run`).
        //
        //    **Why bypass agent.run:** `/init` is a one-shot
        //    side effect, not a real conversation turn. Adding
        //    the AGENTS.md generator prompt + response to the
        //    main transcript would confuse the next turn
        //    ("why is there an AGENTS.md generator prompt in
        //    my context?"). So we just call the model adapter
        //    with a fresh message array and capture the text.
        //
        //    **v0 simplification:** no tool loop, no session.
        //    Just the system prompt + user prompt and a text
        //    response. A future chunk can add a proper tool
        //    loop (read_file + list_dir) if the LLM needs to
        //    inspect the cwd.
        let result;
        try {
            const messages = [
                { role: "system", content: [{ type: "text", text: INIT_SYSTEM_PROMPT }] },
                { role: "user", content: [{ type: "text", text: INIT_USER_PROMPT }] },
            ];
            result = await ctx.agent.getModel().complete({
                messages,
                tools: [],
            });
        }
        catch (err) {
            ctx.stderr.write(`error: model call failed: ${err.message}\n`);
            return;
        }
        const text = extractText(result.content);
        if (text.length === 0) {
            ctx.stderr.write("error: model returned no text\n");
            return;
        }
        // 2. Write the AGENTS.md. We DON'T create the parent
        //    dir (the cwd is presumed to exist; if it doesn't,
        //    the write fails with a clear error).
        try {
            await fs.writeFile(target, text + "\n", "utf-8");
        }
        catch (err) {
            ctx.stderr.write(`error: failed to write ${target}: ${err.message}\n`);
            return;
        }
        ctx.stdout.write(`wrote AGENTS.md: ${target} (${text.split("\n").length} lines)\n`);
    },
};
/**
 * F17.5: list of the 3 Tier 2 batch 1 commands. The runner
 * includes this in the default registry after
 * `BUILTIN_COMMANDS` and `BUILTIN_INFO_COMMANDS` (built-ins
 * always win on name collision).
 *
 * **Defined last** because each entry is a `const` declared
 * above. Forward references in `const` arrays would force
 * us to either inline the literals (less readable) or
 * convert each command to a function declaration (less
 * idiomatic for a data literal). The bottom-of-file
 * position is the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts` and
 * `BUILTIN_INFO_COMMANDS` in `commands-info.ts`).
 */
export const BUILTIN_TIER2_COMMANDS = [
    newCommand,
    compactCommand,
    initCommand,
];
//# sourceMappingURL=commands-tier2.js.map