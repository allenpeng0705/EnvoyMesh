/**
 * Public types for the CLI subcommand handlers.
 * Extracted in T3.2 so each subcommand file
 * (`one-shot.ts`, `repl.ts`, `self-evolve.ts`,
 * `team.ts`) and the helpers file can import
 * the result / option types without re-defining
 * them.
 *
 * **Public API re-exports:** the same types
 * are still re-exported from `src/cli/index.ts`
 * (via `run.js`). The split is internal —
 * external consumers see no change.
 */
import type { Readable } from "node:stream";
import type { HookRegistry, ModelAdapter, ProtocolSessionBackend, SandboxExecutor, SkillRegistry, Tracer } from "../../index.js";
import type { LineReader } from "../repl/index.js";
/** Options the runner accepts. The bin script and tests both
 *  pass a `model` so the runner is provider-agnostic. */
export interface RunOptions {
    /** The argv to parse. Default: `process.argv.slice(2)`. */
    argv?: ReadonlyArray<string>;
    /** The model adapter. Default: throw (v0 requires explicit
     *  injection — there's no built-in provider in Phase 1). */
    model?: ModelAdapter;
    /** A hook registry. Default: a fresh `HookRegistry()`. */
    hooks?: HookRegistry;
    /** The cwd. Default: `process.cwd()`. */
    cwd?: string;
    /** Where to write the human-readable result. Default: stdout. */
    stdout?: NodeJS.WritableStream;
    /** Where to write errors / status. Default: stderr. */
    stderr?: NodeJS.WritableStream;
    /**
     * Phase E / G: stdin for `--acp` JSON-RPC. Default:
     * `process.stdin`. Tests inject a `PassThrough`.
     */
    stdin?: Readable;
    /**
     * Phase E / G: override the ACP session backend (tests /
     * EnvoyMesh inject a live `createAgentSessionBackend`).
     * When unset, `--acp` uses the demo fake unless `model`
     * is also set.
     */
    protocolBackend?: ProtocolSessionBackend;
    /** F9.1: per-call approval handler. When the agent loop
     *  hits a hook decision of `kind: "ask"`, this handler is
     *  called. The default (when undefined) is a built-in
     *  fallback that writes a one-line "ask" record to stderr
     *  and returns `deny` (safe in headless contexts). */
    askHandler?: import("../../index.js").AskHandler;
    /**
     * F9.4: tracer. When set, the agent emits trace
     * events to this tracer instead of the default
     * NullTracer. The CLI's `--json` flag wires a
     * `JsonLinesTracer` to stdout automatically;
     * programmatic callers can inject a custom
     * tracer (e.g. one that ships to a logging
     * service).
     */
    tracer?: Tracer;
    /**
     * F14.2: when `args.repl` is set, the runner
     * uses this line reader instead of opening
     * readline on stdin. Tests inject a fake that
     * yields predetermined lines (so the test
     * doesn't hang on stdin). The bin script leaves
     * this undefined (the default readline reader
     * opens stdin).
     */
    lineReader?: LineReader;
    /**
     * Phase F / CLI bridge: a pre-built `SandboxExecutor`.
     * When set, takes priority over `parsed.sandboxExecutor`
     * (the `--sandbox-executor` CLI flag). Both ultimately
     * flow into the `Agent` constructor's `sandboxExecutor`
     * option — the programmatic path is for tests + library
     * users that want a custom executor (e.g. an instrumented
     * mock for hermeticity).
     */
    sandboxExecutor?: SandboxExecutor;
    /**
     * Phase G: skill registry override. When set, the CLI does not
     * scan the default project/user skill roots — the caller
     * controls exactly which skills the agent sees. Tests pass an
     * empty registry for hermetic transcripts; hosts (EnvoyMesh)
     * can point at mesh-scoped skills.
     */
    skills?: SkillRegistry;
}
/** Result of a successful `run` invocation. */
export interface RunResult {
    /** Discriminator for the union (`CliRunResult`). */
    subcommand: "run";
    /** The agent's final content. */
    content: string;
    /** The agent's stop reason. */
    stopReason: string;
    /** The session id. */
    sessionId: string;
    /** Number of agent loop iterations. */
    iterations: number;
    /** Number of tool calls executed. */
    toolCalls: number;
}
/** Result of a successful `self-evolve` invocation. */
export interface SelfEvolveRunResult {
    /** Discriminator for the union (`CliRunResult`). */
    subcommand: "self-evolve";
    /** Whether the cycle's candidate was kept (would have been, in shadow mode). */
    kept: boolean;
    /** The scoreboard entry written by the cycle. */
    version: number;
    hypothesis: string;
    status: "kept" | "reverted";
    passRateBefore: number;
    passRateAfter: number;
    nRuns: number;
    rulesetHash: string;
    /** Federated pull + adopt results (only present when --pull is set). */
    federated?: {
        /** Whether the pull was skipped (optIn: false). */
        skipped: boolean;
        /** Number of candidates that passed the local gate. */
        adopted: number;
        /** Number of candidates that failed the local gate. */
        rejected: number;
        /** Number of candidates filtered out before the gate. */
        filtered: number;
    };
}
/** Result of a successful `team` invocation. */
export interface TeamRunResult {
    /** Discriminator for the union. */
    subcommand: "team";
    /** The team's name. */
    teamName: string;
    /** Per-agent results, in execution order. */
    agents: ReadonlyArray<{
        id: string;
        finalText: string;
        stopReason: string;
        durationMs: number;
    }>;
    /** "completed" if all agents finished cleanly. */
    status: "completed" | "failed";
    /** Error message if `status === "failed"`. */
    error?: string;
}
/** Union of the subcommand results. */
export interface DoctorRunResult {
    subcommand: "doctor";
    checks: ReadonlyArray<{
        name: string;
        ok: boolean;
        detail: string;
    }>;
}
export interface TuiRunResult {
    subcommand: "tui";
}
export type CliRunResult = RunResult | SelfEvolveRunResult | TeamRunResult | DoctorRunResult | TuiRunResult;
/** The process exit code. */
export type ExitCode = 0 | 1 | 2 | 64 | 65 | 66;
export declare const EXIT_OK: ExitCode;
export declare const EXIT_ERROR: ExitCode;
export declare const EXIT_USAGE: ExitCode;
export declare const EXIT_DATAERR: ExitCode;
export declare const EXIT_NOINPUT: ExitCode;
//# sourceMappingURL=types.d.ts.map