/**
 * Read-only git helpers for protocol `git/*` methods and TUI `/diff`.
 */
import { spawnSync } from "node:child_process";
/** Run `git diff` in cwd (unstaged vs HEAD by default). */
export function runGitDiff(cwd, options) {
    const args = ["diff"];
    if (options?.staged === true)
        args.push("--cached");
    if (options?.stat === true)
        args.push("--stat");
    const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
    return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? -1,
    };
}
/** Run `git status --porcelain` in cwd. */
export function runGitStatus(cwd) {
    const result = spawnSync("git", ["status", "--porcelain"], {
        cwd,
        encoding: "utf-8",
    });
    return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? -1,
    };
}
/** Format git output for display (errors vs empty vs content). */
export function formatGitOutput(result) {
    if (result.stderr.length > 0 && result.exitCode !== 0 && result.exitCode !== 1) {
        return result.stderr.trim();
    }
    const out = result.stdout.trim();
    if (out.length === 0) {
        return "(no changes)";
    }
    return out;
}
//# sourceMappingURL=git-runner.js.map