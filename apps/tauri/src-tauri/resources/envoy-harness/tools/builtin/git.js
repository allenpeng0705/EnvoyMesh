/**
 * git — the read-only git operations built-in tool.
 *
 * **Design doc:** §10.2.
 *
 * **T3.5 scope:** read-only operations only
 * (`status`, `diff`, `log`, `branch --list`).
 * Mutating ops (`commit`, `push`, `branch -b`,
 * `pr`) stay in `bash` for now — the 6 bash
 * validators enforce the same policy at the
 * command-parse level (e.g. `git commit` is
 * blocked in read-only).
 *
 * **Why a tool (vs `bash` for everything):**
 * structured read-only access. The model gets
 * a clean schema (`op: "status" | "diff" | "log"`)
 * instead of having to construct git's CLI
 * (which is parseable but verbose). The
 * `bash` tool handles mutating ops.
 *
 * **Permission model:** all read-only ops are
 * allowed in any permission mode (read is
 * always allowed).
 *
 * **Output:** the raw git stdout. The model
 * parses diffs / status / log the same way it
 * would if it ran `git` via bash.
 */
import { spawn } from "node:child_process";
import { z } from "zod";
/**
 * The git tool. One required discriminator: `op`.
 * Other parameters depend on `op` (validated by
 * the per-op union below).
 */
export const gitTool = {
    name: "git",
    description: "Read-only git operations. Op is one of: " +
        "'status' (working tree status), " +
        "'diff' (unified diff; `staged: true` for staged changes, `ref: 'HEAD~1'` for a specific ref), " +
        "'log' (recent commits; `max: 10` to cap), " +
        "'branchList' (list local branches). " +
        "Mutating ops (commit, push, branch -b) are NOT exposed here; use the bash tool.",
    parameters: z.discriminatedUnion("op", [
        z.object({ op: z.literal("status") }),
        z.object({
            op: z.literal("diff"),
            staged: z
                .boolean()
                .optional()
                .describe("If true, show staged changes (--cached)"),
            ref: z
                .string()
                .optional()
                .describe("A git ref (branch / commit / HEAD~N) to diff against"),
        }),
        z.object({
            op: z.literal("log"),
            max: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Maximum number of commits to show (default 20)"),
        }),
        z.object({ op: z.literal("branchList") }),
    ]),
    async execute(input, ctx) {
        const args = (() => {
            switch (input.op) {
                case "status":
                    return ["status", "--porcelain"];
                case "diff":
                    return [
                        "diff",
                        ...(input.staged === true ? ["--cached"] : []),
                        ...(input.ref !== undefined ? [input.ref] : []),
                    ];
                case "log":
                    return ["log", `--max-count=${input.max ?? 20}`, "--oneline"];
                case "branchList":
                    return ["branch", "--list"];
            }
        })();
        return new Promise((resolve) => {
            // T3.12: forward ctx.abortSignal to the child
            // so an aborted run can interrupt a hung `git`
            // process. (The bash tool does the same — see
            // `src/tools/builtin/bash.ts`.) Without this,
            // a stuck `git log` on a large repo would
            // block the run's abort path until the child
            // returned on its own.
            const child = spawn("git", args, {
                cwd: ctx.cwd,
                signal: ctx.abortSignal,
            });
            const out = [];
            const err = [];
            child.stdout.on("data", (c) => out.push(c));
            child.stderr.on("data", (c) => err.push(c));
            child.on("close", (code) => {
                if (code !== 0) {
                    resolve({
                        content: `git ${args.join(" ")} failed: ${Buffer.concat(err).toString("utf8") || "no stderr"}`,
                        isError: true,
                    });
                    return;
                }
                resolve({
                    content: Buffer.concat(out).toString("utf8"),
                });
            });
            child.on("error", (err) => {
                resolve({
                    content: `git error: ${err.message}`,
                    isError: true,
                });
            });
        });
    },
};
//# sourceMappingURL=git.js.map