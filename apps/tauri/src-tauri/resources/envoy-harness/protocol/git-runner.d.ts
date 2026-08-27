/**
 * Read-only git helpers for protocol `git/*` methods and TUI `/diff`.
 */
export interface GitRunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
/** Run `git diff` in cwd (unstaged vs HEAD by default). */
export declare function runGitDiff(cwd: string, options?: {
    staged?: boolean;
    stat?: boolean;
}): GitRunResult;
/** Run `git status --porcelain` in cwd. */
export declare function runGitStatus(cwd: string): GitRunResult;
/** Format git output for display (errors vs empty vs content). */
export declare function formatGitOutput(result: GitRunResult): string;
//# sourceMappingURL=git-runner.d.ts.map