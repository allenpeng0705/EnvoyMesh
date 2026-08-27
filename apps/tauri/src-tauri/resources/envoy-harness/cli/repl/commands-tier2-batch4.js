/**
 * F14.3 — Tier 2 batch 4 commands.
 *
 * Two real-feature commands that complete the F14
 * REPL surface (the F18 gap-analysis commands
 * `codex /review` + `codex /export`):
 *
 * - `/review [staged]` — runs the model as a code
 *   reviewer. Reads `git diff` (default) or
 *   `git diff --cached` (with the `staged` arg)
 *   and sends the diff to the model with a
 *   system prompt. Prints the review to stdout.
 *   No diff (clean tree) → "no changes to review".
 *   Non-git dir → error to stderr.
 *
 * - `/export [format] [path]` — exports the
 *   current session. Formats: `jsonl` (default)
 *   and `md` (Markdown). Path: defaults to
 *   `<cwd>/<sessionId>.<ext>`. Writes a file the
 *   user can share / archive.
 *
 * **Why a separate file from F17.5/F17.6/F14.1:**
 consistent with the existing tier-2 batches
 (one file per batch). F14.3 is the F18 commands
 bundle — `/review` and `/export` are the last
 two F18 commands not yet shipped.
 *
 * **v0 limitations:**
 * - `/review` does NOT chunk very large diffs.
 *   A diff with 50k+ lines is sent in one model
 *   call (which may exceed the model's context
 *   window). A future chunk can add diff
 *   truncation / chunking.
 * - `/review` is human-text only (no machine-
 *   readable review). A future chunk can add
 *   `/review --format=json`.
 * - `/export` does NOT redact secrets. The
 *   exported file is the raw session. Users
 *   who share exported files should review
 *   them first.
 * - `/export` only writes JSONL or MD. PDF,
 *   HTML, etc. are future-chunk candidates.
 */
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { applyTransition, createPlanState, PlanTransitionError, } from "../../plan/index.js";
// ---------------------------------------------------------------------------
// 1. /review [staged] — model-as-reviewer of git diff
// ---------------------------------------------------------------------------
/**
 * System prompt for the code reviewer. The LLM
 * is told to look for bugs, missing tests, and
 * style issues, and to output a structured
 * review (findings by file/section + an
 * overall summary).
 *
 * **Why a system prompt, not a user prompt:**
 the diff can be very long; a system prompt
 lets the model see the instruction and the
 diff separately (modern models handle this
 better than interleaving).
 */
const REVIEW_SYSTEM_PROMPT = `You are a code reviewer for a software project.
Examine the provided git diff carefully and write
a structured review. Your review MUST include:

1. **Findings** — a bulleted list of specific
   issues, each with: file + line range, severity
   (critical / major / minor / nit), and a one-
   sentence description. If there are no issues,
   say "no issues found".
2. **Missing tests** — if the diff adds or changes
   behavior without a test, list it. Be specific
   about what should be tested.
3. **Style / readability** — call out anything
   that hurts future maintainers.
4. **Overall summary** — a 1-2 sentence verdict.

Be specific. Quote the relevant code. Do NOT
write any preamble like "Here's the review" or
"Sure, I'll review this". Start with the
findings list.

If the diff is empty or contains only
non-code changes (whitespace, comments), say
"no actionable code changes to review" and
stop.`;
const REVIEW_USER_PROMPT_HEAD = `Examine the following git diff and write the code review.`;
const REVIEW_MAX_DIFF_CHARS = 200_000;
/**
 * Default diff fetcher: spawns `git diff` (or
 * `git diff --cached`) in the given cwd.
 *
 * **Why a function, not a class:** v0 is a thin
 * wrapper. The function is replaceable via
 * `ReplOptions.reviewDiff` (used by tests).
 *
 * **Exit code handling:** `git diff` returns 0
 * when there are no changes, 1 when there are
 * changes (per git's convention), and non-zero
 * with stderr on error. The /review command
 * treats non-zero + non-empty stderr as an
 * error; non-zero with empty stderr is "no
 * changes" (we look at the output, not the
 * code).
 */
function defaultReviewDiff(opts) {
    const args = opts.staged ? ["diff", "--cached"] : ["diff"];
    const result = spawnSync("git", args, {
        cwd: opts.cwd,
        encoding: "utf-8",
    });
    return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? -1,
        // spawnSync sets `error` when the binary can't be spawned
        // (e.g. git not installed) — status is null and stderr is
        // empty, so without this the failure would masquerade as
        // "no changes to review".
        ...(result.error ? { error: result.error.message } : {}),
    };
}
/**
 * Format a `ModelResponse`'s text content as a
 * single string. Mirrors `/init`'s helper — both
 * are one-shot side effects that read the model's
 * text response and ignore tool calls.
 */
function extractText(content) {
    const parts = [];
    for (const block of content) {
        if (block.type === "text")
            parts.push(block.text);
    }
    return parts.join("\n").trim();
}
const reviewCommand = {
    name: "/review",
    description: "review the working tree (or staged changes) with the model",
    async handler(args, ctx) {
        const staged = args.length > 0 && args[0] === "staged";
        const cwd = ctx.args.cwd ?? process.cwd();
        // Use the injected fetcher (tests) or the
        // default (production). Both return the same
        // shape.
        const diff = ctx.reviewDiff
            ? ctx
                .reviewDiff({ cwd, staged })
            : defaultReviewDiff({ cwd, staged });
        if (diff.error) {
            // git not installed / couldn't spawn: real error.
            ctx.stderr.write(`error: ${diff.error}\n`);
            return;
        }
        if (diff.stderr && diff.exitCode !== 0) {
            // git error (not a repo, git not installed,
            // bad flags, etc.)
            ctx.stderr.write(`error: ${diff.stderr.trim()}\n`);
            return;
        }
        if (diff.stdout.trim() === "") {
            ctx.stdout.write("no changes to review\n");
            return;
        }
        // v0: truncate very large diffs. A future
        // chunk can add chunked reviews (one per
        // hunk, summarized at the end).
        let diffText = diff.stdout;
        let truncated = false;
        if (diffText.length > REVIEW_MAX_DIFF_CHARS) {
            diffText =
                diffText.slice(0, REVIEW_MAX_DIFF_CHARS) +
                    `\n\n[truncated to ${REVIEW_MAX_DIFF_CHARS} chars]`;
            truncated = true;
        }
        // 1. Fire the model directly (NOT through
        //    `agent.run`). Same one-shot side-effect
        //    pattern as `/init` (F17.5): the review
        //    prompt + response are NOT added to the
        //    main transcript. Adding them would
        //    confuse the next turn ("why is there
        //    a code-review prompt in my context?").
        let text;
        try {
            const messages = [
                { role: "system", content: [{ type: "text", text: REVIEW_SYSTEM_PROMPT }] },
                {
                    role: "user",
                    content: [
                        { type: "text", text: REVIEW_USER_PROMPT_HEAD },
                        { type: "text", text: diffText },
                    ],
                },
            ];
            const result = await ctx.agent.getModel().complete({
                messages,
                tools: [],
            });
            text = extractText(result.content);
        }
        catch (err) {
            ctx.stderr.write(`error: model call failed: ${err.message}\n`);
            return;
        }
        if (text.length === 0) {
            ctx.stderr.write("error: model returned no text\n");
            return;
        }
        if (truncated) {
            ctx.stdout.write(`(diff truncated to ${REVIEW_MAX_DIFF_CHARS} chars)\n\n`);
        }
        ctx.stdout.write(text);
        if (!text.endsWith("\n")) {
            ctx.stdout.write("\n");
        }
    },
};
/**
 * Parse the format arg. Returns the canonical
 * format or `null` for an unknown / missing
 * value (caller distinguishes via the `present`
 * flag).
 */
function parseFormat(arg) {
    if (arg === undefined)
        return { format: "jsonl", present: false };
    if (arg === "jsonl")
        return { format: "jsonl", present: true };
    if (arg === "md" || arg === "markdown")
        return { format: "md", present: true };
    return { format: "jsonl", present: false };
}
/**
 * Render a session as JSONL. The format is the
 * same as `PersistedSession` (header line +
 * one message per line). For `PersistedSession`,
 * we copy the file (avoids re-encoding the
 * content — preserves any custom metadata or
 * tool-result fields verbatim).
 */
async function renderJsonl(session, targetPath) {
    // The on-disk PersistedSession has the
    // authoritative format. We can rebuild the
    // header + messages from the in-memory
    // representation, but the persisted file is
    // a direct copy when available.
    const header = {
        _kind: "header",
        id: session.id,
        metadata: session.metadata,
    };
    const lines = [JSON.stringify(header)];
    for (const m of session.messages) {
        lines.push(JSON.stringify(m));
    }
    await fs.writeFile(targetPath, lines.join("\n") + "\n", "utf-8");
}
/**
 * Render a session as Markdown. The format is
 * human-readable: a YAML-ish front matter
 * block (id, title, cwd, startedAt, message
 * count) followed by one section per message.
 *
 * **Why front matter:** the user can drop the
 * exported file into a static-site generator
 * (Hugo, Jekyll) and get a page out of it
 * without further processing.
 */
async function renderMd(session, targetPath) {
    const lines = [];
    lines.push("---");
    lines.push(`id: ${session.id}`);
    lines.push(`title: ${session.metadata.title ?? "(untitled)"}`);
    lines.push(`cwd: ${session.metadata.cwd}`);
    lines.push(`started_at: ${session.metadata.startedAt}`);
    if (session.metadata.permissionMode) {
        lines.push(`permission_mode: ${session.metadata.permissionMode}`);
    }
    lines.push(`messages: ${session.messages.length}`);
    lines.push("---");
    lines.push("");
    for (const m of session.messages) {
        lines.push(`## ${m.role}`);
        lines.push("");
        for (const block of m.content) {
            if (block.type === "text") {
                lines.push(block.text);
                lines.push("");
            }
            else if (block.type === "tool_call") {
                lines.push(`**Tool call** (\`${block.name}\`, id \`${block.id}\`):`);
                lines.push("");
                lines.push("```json");
                lines.push(JSON.stringify(block.args, null, 2));
                lines.push("```");
                lines.push("");
            }
            else if (block.type === "tool_result") {
                const contentText = typeof block.content === "string"
                    ? block.content
                    : JSON.stringify(block.content, null, 2);
                const isError = block.isError ? " (error)" : "";
                lines.push(`**Tool result** for \`${block.toolCallId}\`${isError}:`);
                lines.push("");
                lines.push("```");
                lines.push(contentText);
                lines.push("```");
                lines.push("");
            }
        }
    }
    await fs.writeFile(targetPath, lines.join("\n"), "utf-8");
}
const exportCommand = {
    name: "/export",
    description: "export the current session (jsonl | md; default <cwd>/<sessionId>.<ext>)",
    async handler(args, ctx) {
        const cwd = ctx.args.cwd ?? process.cwd();
        const formatArg = args[0];
        const pathArg = args[1];
        const { format, present } = parseFormat(formatArg);
        if (formatArg !== undefined && !present) {
            ctx.stderr.write(`error: unknown format: ${formatArg} (expected jsonl | md)\n`);
            return;
        }
        const ext = format === "md" ? "md" : "jsonl";
        const targetPath = pathArg
            ? (path.isAbsolute(pathArg) ? pathArg : path.join(cwd, pathArg))
            : path.join(cwd, `${ctx.agent.getSessionId()}.${ext}`);
        // F-fix: /export writes a file. Respect the session's
        // permission mode (like /init) and keep the target inside
        // the cwd — an absolute path arg could otherwise write
        // anywhere on the machine.
        if (ctx.agent.getPermissionMode() === "read-only") {
            ctx.stderr.write("error: /export writes a file, but the session is read-only " +
                "(use /sandbox workspace-write first)\n");
            return;
        }
        if (!isWithin(cwd, targetPath)) {
            ctx.stderr.write(`error: export path is outside the session cwd: ${targetPath}\n`);
            return;
        }
        // Read the live session from the agent via the public
        // getter (InMemorySession or PersistedSession both
        // implement the same interface).
        const session = ctx.agent.getSession();
        try {
            if (format === "md") {
                await renderMd(session, targetPath);
            }
            else {
                await renderJsonl(session, targetPath);
            }
        }
        catch (err) {
            ctx.stderr.write(`error: failed to write ${targetPath}: ${err.message}\n`);
            return;
        }
        ctx.stdout.write(`exported: ${targetPath} (${session.messages.length} messages)\n`);
    },
};
/** Boundary-aware containment: is `p` inside `root`? */
function isWithin(root, p) {
    const r = path.resolve(root);
    const target = path.resolve(p);
    return target === r || target.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}
/**
 * The plan-mode REPL command. Reads + writes the
 * plan state on the session (`session.getPlan()`
 * / `session.setPlan()`); the actual lifecycle
 * lives in `src/plan/state.ts` (the state
 * machine). This command is the user-facing
 * dispatcher — it translates REPL arg tokens to
 * transitions + applies them.
 *
 * **Why a REPL command at all:** the model can
 * also write a plan in plain text. The REPL
 * command makes the plan a *structured* record
 * (with lifecycle metadata), so the next model
 * call can see "this plan is approved" (the
 * bounded-fragment machinery in
 * `src/plan/inject.ts` only injects approved
 * plans).
 *
 * **v0 limitations:** see the file-level JSDoc.
 */
const planCommand = {
    name: "/plan",
    description: "plan mode. Subcommands: enter, show, edit <text>, " +
        "propose, approve, reject [reason], exit.",
    handler(args, ctx) {
        const sub = (args[0] ?? "show");
        // The session's `getPlan()` returns the persisted
        // state, or `undefined` when no plan has been set.
        // For the dispatcher's purposes, "no plan" is
        // equivalent to the initial state (inactive draft).
        const session = ctx.agent.getSession();
        const current = session.getPlan() ?? createPlanState();
        try {
            switch (sub) {
                case "enter": {
                    const next = applyTransition(current, { kind: "enter" });
                    session.setPlan(next);
                    ctx.stdout.write(`plan mode: entered (status: ${next.reviewStatus})\n`);
                    return;
                }
                case "show": {
                    if (!current.active) {
                        ctx.stdout.write("(no active plan; use /plan enter to start)\n");
                        return;
                    }
                    if (current.planText.length === 0) {
                        ctx.stdout.write(`(plan is empty, status: ${current.reviewStatus}; ` +
                            "use /plan edit <text> to set the plan)\n");
                        return;
                    }
                    const reason = current.rejectionReason
                        ? `, rejected: ${current.rejectionReason}`
                        : "";
                    ctx.stdout.write(`--- plan (${current.reviewStatus}, updated ${current.updatedAt}${reason}) ---\n`);
                    ctx.stdout.write(current.planText);
                    if (!current.planText.endsWith("\n")) {
                        ctx.stdout.write("\n");
                    }
                    ctx.stdout.write("---\n");
                    return;
                }
                case "edit": {
                    const text = args.slice(1).join(" ");
                    if (text.length === 0) {
                        ctx.stderr.write("usage: /plan edit <text>\n");
                        return;
                    }
                    const next = applyTransition(current, {
                        kind: "edit",
                        planText: text,
                    });
                    session.setPlan(next);
                    ctx.stdout.write(`plan updated (${text.length} chars, status reverted to draft)\n`);
                    return;
                }
                case "propose": {
                    const next = applyTransition(current, { kind: "propose" });
                    session.setPlan(next);
                    ctx.stdout.write(`plan proposed (status: ${next.reviewStatus})\n`);
                    return;
                }
                case "approve": {
                    const next = applyTransition(current, { kind: "approve" });
                    session.setPlan(next);
                    ctx.stdout.write("plan approved (will be injected as a top-priority " +
                        "fragment on the next model call)\n");
                    return;
                }
                case "reject": {
                    const reason = args.slice(1).join(" ");
                    // The state machine accepts `reject` with or
                    // without a reason. We build the transition
                    // dynamically to keep the call site readable.
                    const transition = reason.length > 0
                        ? { kind: "reject", reason }
                        : { kind: "reject" };
                    const next = applyTransition(current, transition);
                    session.setPlan(next);
                    if (reason.length > 0) {
                        ctx.stdout.write(`plan rejected: ${reason}\n`);
                    }
                    else {
                        ctx.stdout.write("plan rejected\n");
                    }
                    return;
                }
                case "exit": {
                    const next = applyTransition(current, { kind: "exit" });
                    session.setPlan(next);
                    ctx.stdout.write("plan mode: exited (plan text + status preserved for audit)\n");
                    return;
                }
                default:
                    ctx.stderr.write("usage: /plan <enter|show|edit <text>|propose|approve|" +
                        "reject [reason]|exit>\n");
            }
        }
        catch (err) {
            // `applyTransition` throws `PlanTransitionError`
            // on invalid transitions (e.g. `approve` before
            // `propose`). We unwrap the message and prepend
            // a friendly "error: " so the user sees the
            // cause, not the wrapper.
            const message = err instanceof PlanTransitionError
                ? err.message.replace(/^plan transition '[^']+' failed: /, "")
                : err.message;
            ctx.stderr.write(`error: ${message}\n`);
        }
    },
};
// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------
/**
 * F14.3 + Phase A / Item 6: list of the 3 Tier 2
 * batch 4 commands. The runner includes this in
 * the default registry after
 * `BUILTIN_TIER2_BATCH3_COMMANDS` (built-ins
 * always win on name collision).
 *
 * **Defined last** because each entry is a `const`
 * declared above. Forward references in `const`
 * arrays would force us to either inline the
 * literals (less readable) or convert each command
 * to a function declaration (less idiomatic for
 * a data literal). The bottom-of-file position is
 * the cleanest fix (same pattern as
 * `BUILTIN_COMMANDS` in `commands.ts`,
 * `BUILTIN_INFO_COMMANDS` in `commands-info.ts`,
 * `BUILTIN_TIER2_COMMANDS` in `commands-tier2.ts`,
 * `BUILTIN_TIER2_BATCH2_COMMANDS` in
 * `commands-tier2-batch2.ts`, and
 * `BUILTIN_TIER2_BATCH3_COMMANDS` in
 * `commands-tier2-batch3.ts`).
 */
export const BUILTIN_TIER2_BATCH4_COMMANDS = [
    reviewCommand,
    exportCommand,
    planCommand,
];
//# sourceMappingURL=commands-tier2-batch4.js.map