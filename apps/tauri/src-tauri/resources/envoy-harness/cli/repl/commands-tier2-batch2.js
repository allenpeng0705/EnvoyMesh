/**
 * F17.6 — Tier 2 batch 2 commands.
 *
 * Two real-feature commands that complete the F17
 * REPL surface:
 * - `/agents` — list sub-agents spawned by this
 *   session's `task` tool calls. Reads from
 *   `ctx.subagentRegistry.list()`.
 * - `/diff` — `git diff` vs HEAD. Thin wrapper
 *   around the `git` CLI.
 *
 * **Why a separate file from F17.5's
 * `commands-tier2.ts`:** consistent with the
 * existing F17.2 / F17.2.5 split (one file per
 * tier). The two batches are distinct
 * (commit-wise) but live in the same directory.
 *
 * **`/undo`** reverts the last `write` / `edit` tool change (action journal).
 *
 * **v0 limitations:**
 * - `/diff` runs `git diff` (no args; unstaged
 *   changes vs HEAD). The `--stat` flag is a
 *   future chunk.
 * - `/diff` does NOT use the bash tool (no
 *   permission check, no validation). The user
 *   explicitly opted into the diff view; the
 *   permission policy doesn't apply to read-only
 *   inspection commands.
 * - `/agents` shows a flat list; no grouping
 *   by status / parent / capability. Future:
 *   `/agents --running` filters to running.
 */
import { spawnSync } from "node:child_process";
// ---------------------------------------------------------------------------
// 1. /agents — list spawned sub-agents
// ---------------------------------------------------------------------------
/**
 * `SubagentRecord` (from `subagent/types.ts`):
 * `{ sessionId, capabilityTag, objective, startedAt,
 * completedAt?, durationMs?, status, costUsd? }`.
 *
 * **One line per record.** Format:
 * `<status-icon>  <capabilityTag>  <sessionId-prefix>  <cost>  <duration>  <objective-truncated>`
 *
 * Example:
 * `✓  research  a1b2c3d4…  $0.0012  3.2s  Find the EnvoyMesh runbook…`
 *
 * The sessionId is truncated to 8 chars + `…` for
 * readability (the full id is still in the registry).
 * The objective is truncated to 50 chars + `…` if
 * longer. Long objectives are common (sub-agents
 * are spawned with detailed instructions).
 */
function formatRecordLine(record) {
    // Status icon.
    const icon = record.status === "running"
        ? "▶"
        : record.status === "completed"
            ? "✓"
            : record.status === "failed"
                ? "✗"
                : "?"; // partial
    // Truncated session id (8 chars + ellipsis).
    const sessionShort = record.sessionId.length > 8
        ? record.sessionId.slice(0, 8) + "…"
        : record.sessionId;
    // Cost.
    const cost = record.costUsd !== undefined
        ? `$${record.costUsd.toFixed(4)}`
        : "—";
    // Duration.
    const duration = record.durationMs !== undefined
        ? `${(record.durationMs / 1000).toFixed(1)}s`
        : "—";
    // Truncated objective.
    const objMax = 50;
    const obj = record.objective.length > objMax
        ? record.objective.slice(0, objMax - 1) + "…"
        : record.objective;
    return `${icon}  ${record.capabilityTag.padEnd(16)}  ${sessionShort}  ${cost.padStart(8)}  ${duration.padStart(6)}  ${obj}`;
}
const agentsCommand = {
    name: "/agents",
    description: "list sub-agents spawned in this session",
    handler(_args, ctx) {
        const registry = ctx.subagentRegistry;
        if (!registry) {
            ctx.stdout.write("no sub-agents (the agent has no meshSubmitter, or the submitter doesn't implement listSubagents)\n");
            return;
        }
        const records = registry.list();
        if (records.length === 0) {
            ctx.stdout.write("no sub-agents spawned in this session\n");
            return;
        }
        const lines = [];
        lines.push(`sub-agents: ${records.length} (${records.filter((r) => r.status === "running").length} running)`);
        for (const r of records) {
            lines.push(`  ${formatRecordLine(r)}`);
        }
        ctx.stdout.write(lines.join("\n") + "\n");
    },
};
// ---------------------------------------------------------------------------
// 2. /diff — `git diff` vs HEAD
// ---------------------------------------------------------------------------
/**
 * The default diff runner: spawns `git diff` in the
 * given cwd and returns stdout/stderr/exit code.
 *
 * **Why a function, not a class:** v0 is a thin
 * wrapper. A function with explicit args is
 * easier to test (we can swap it out via a
 * `ReplOptions.diffRunner?` field if we ever
 * need to mock it; for now, the tests use a
 * real `git` invocation in a temp dir).
 *
 * **Why not via the bash tool:** the bash tool
 * validates commands against the session's
 * permission mode. `/diff` is a read-only
 * inspection — the user wants to see the diff,
 * not be blocked by a permission check. The
 * `git` CLI is the right level here.
 *
 * **Exit code:** `git diff` returns 0 when there
 * are no changes, 1 when there are changes, and
 * non-zero (with stderr) on error. We treat
 * non-zero + stderr as an error; non-zero without
 * stderr is just "there are changes" (we ignore
 * the code and look at the output).
 */
function defaultDiff(cwd) {
    const result = spawnSync("git", ["diff"], {
        cwd,
        encoding: "utf-8",
    });
    return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? -1,
    };
}
const diffCommand = {
    name: "/diff",
    description: "show git diff (vs HEAD)",
    handler(_args, ctx) {
        const cwd = ctx.args.cwd ?? process.cwd();
        const result = defaultDiff(cwd);
        if (result.stderr && result.exitCode !== 0) {
            // git error (not a repo, git not installed, etc.)
            ctx.stderr.write(`error: ${result.stderr.trim()}\n`);
            return;
        }
        if (result.stdout.trim() === "") {
            ctx.stdout.write("no changes\n");
            return;
        }
        ctx.stdout.write(result.stdout);
        // git diff may omit a trailing newline on the
        // last hunk; add one for clean output.
        if (!result.stdout.endsWith("\n")) {
            ctx.stdout.write("\n");
        }
    },
};
const undoCommand = {
    name: "/undo",
    description: "revert the last write or edit tool change",
    handler(_args, ctx) {
        if (!ctx.agent.canUndo()) {
            ctx.stdout.write("nothing to undo\n");
            return;
        }
        void ctx.agent
            .undoLastFileChange()
            .then((result) => {
            ctx.stdout.write(`undone: ${result.action} ${result.path}\n`);
        })
            .catch((err) => {
            ctx.stderr.write(`undo failed: ${err instanceof Error ? err.message : String(err)}\n`);
        });
    },
};
// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------
/**
 * F17.6: list of the 2 Tier 2 batch 2 commands. The
 * runner includes this in the default registry after
 * `BUILTIN_TIER2_COMMANDS` (built-ins always win on
 * name collision).
 *
 * **Defined last** because each entry is a `const`
 * declared above. Forward references in `const` arrays
 * would force us to either inline the literals (less
 * readable) or convert each command to a function
 * declaration (less idiomatic for a data literal).
 * The bottom-of-file position is the cleanest fix
 * (same pattern as `BUILTIN_COMMANDS` in
 * `commands.ts`, `BUILTIN_INFO_COMMANDS` in
 * `commands-info.ts`, and `BUILTIN_TIER2_COMMANDS` in
 * `commands-tier2.ts`).
 */
export const BUILTIN_TIER2_BATCH2_COMMANDS = [
    agentsCommand,
    diffCommand,
    undoCommand,
];
//# sourceMappingURL=commands-tier2-batch2.js.map