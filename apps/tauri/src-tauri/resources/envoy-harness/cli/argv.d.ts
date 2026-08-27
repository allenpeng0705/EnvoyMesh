/**
 * argv parser for the envoy-harness CLI.
 *
 * **Design doc:** `docs/design.md` §19.
 *
 * **Phase 1+3 scope:** the v0 flag set for `envoy-harness` and
 * the `self-evolve` subcommand. We don't try to match every
 * flag from §19 in this chunk — the parser is designed to be
 * additive (new flags append to `KNOWN_FLAGS` without breaking
 * existing tests). The full §19 surface lands in later chunks.
 *
 * **Subcommand dispatch:** the first non-flag positional is
 * treated as a subcommand (`self-evolve` is the only one in
 * v0; `envoy-harness [prompt]` is the default / no-subcommand
 * form). The top-level `parseArgs` returns a discriminated
 * union; callers narrow on `subcommand`.
 *
 * **Why a hand-rolled parser?** `process.argv.slice(2)` is a
 * single line; a `commander` / `yargs` dependency is overkill
 * for v0. The parser is small enough to read in one screen.
 *
 * **Stability:** `ParsedArgs` is the public type. New fields
 * are additive (default to `undefined`).
 */
import type { PermissionMode } from "../types.js";
import { type PluginConfigEntry } from "../plugins/config-parser.js";
/** Args for the default `run` subcommand (no subcommand keyword). */
export interface RunParsedArgs {
    subcommand: "run";
    /** `--help`: print help and exit. */
    help: boolean;
    /** `--version`: print version and exit. */
    version: boolean;
    /** `--json`: machine-readable JSON Lines output (Phase 2). */
    json: boolean;
    /** `--sandbox <mode>`: permission mode. */
    sandbox: PermissionMode | undefined;
    /**
     * `--sandbox-executor <name>`: opt into a kernel-level
     * sandbox backend. `none` is the default (validators only,
     * hermetic tests). Supported: `landlock` (Linux only),
     * `seatbelt` (macOS only), `windows-sandbox` (Windows only).
     * On a non-matching platform the resolver falls back to noop
     * rather than fail-closed.
     */
    sandboxExecutor: "landlock" | "seatbelt" | "windows-sandbox" | "none" | undefined;
    /** `--approval <mode>`: ask-for-approval policy. */
    approval: string | undefined;
    /** `--model <id>`: model identifier (passed to the adapter). */
    model: string | undefined;
    /** `--provider <name>`: provider name (openai, anthropic, etc.). */
    provider: string | undefined;
    /** `--cwd <path>`: override the working directory. */
    cwd: string | undefined;
    /** `--max-turns <n>`: max iterations for the agent loop. */
    maxTurns: number | undefined;
    /** `--max-cost-usd <n>`: cost ceiling (Phase 2). */
    maxCostUsd: number | undefined;
    /** `--resume <session-id>`: resume a saved session. */
    resume: string | undefined;
    /**
     * Phase D / Item 14b: `--resume-remote <node>/<session>`.
     * Parsed for forward-compat; Package 1 stubs with a clear
     * "requires mesh adapter" error (no network).
     */
    resumeRemote: string | undefined;
    /** `--fork <session-id>`: fork a saved session. */
    fork: string | undefined;
    /**
     * F14.1: `--persist` (no value). Opt in to disk
     * persistence for the new session. When set,
     * the runner creates a `PersistedSession`
     * instead of an `InMemorySession` and writes
     * the session id to stderr for `--resume` later.
     */
    persist: boolean;
    /**
     * T2.2: `--config <path>`: explicit path to a
     * TOML config file. Default is
     * `~/.config/envoy-harness/config.toml` (or
     * `$ENVOY_HARNESS_CONFIG` if set). The file
     * is optional; missing file → empty config.
     * CLI flags still win over the file (design §20.1
     * layer composition).
     */
    config?: string | undefined;
    /**
     * Phase B / Item 15.1: `--import-config <path>`:
     * path to a config file in a foreign format
     * (codex, deepseek). Imported into the native
     * `ConfigLayer`; imported values win over the
     * native `--config` file but lose to explicit
     * CLI flags. Requires `--from <format>` to
     * pick the importer.
     */
    importConfig?: string | undefined;
    /**
     * Phase B / Item 15.1: `--from <format>`: the
     * format of the `--import-config` file. v0
     * supports `codex` only. The two flags are
     * required together (passing one without the
     * other is a usage error).
     */
    importFrom?: string | undefined;
    /**
     * Phase B / Item 3.1: `--plugin <module>` (repeatable):
     * a plugin module path to load. The path MUST be in
     * the curated whitelist (security boundary). v0
     * accepts the built-in samples (e.g.
     * `envoy-harness-plugin-audit-log`). An empty array
     * means "no plugins loaded" (the default).
     */
    plugins: string[];
    /**
     * Phase B / Item 3.3: `--plugin-config <name>.<key>=<value>`
     * (repeatable): a per-plugin config entry. The
     * `<name>.` prefix scopes the entry to a specific
     * plugin; multiple flags for the same plugin
     * accumulate. The runner builds a
     * `Map<name, Record<string, unknown>>` via
     * `mergePluginConfigs` and passes the right config
     * to each plugin's `register(module, config, ctx)`.
     * An empty array means "no configs supplied" (the
     * default; every plugin gets `{}`).
     */
    pluginConfigs: PluginConfigEntry[];
    /**
     * F14.1: `--session-dir <path>`: where to
     * store / load persisted sessions. Default
     * `~/.local/state/envoy-harness/sessions`.
     * Override via `ENVOY_HARNESS_SESSION_DIR` env
     * var (set in `run.ts` when not specified on
     * the CLI).
     */
    sessionDir: string | undefined;
    /** `--plan`: plan-only mode. */
    plan: boolean;
    /** `--repl`: enter the interactive REPL (F17.1). */
    repl: boolean;
    /**
     * Phase E / G: `--acp` — serve ACP JSON-RPC on stdio
     * (Content-Length framing). No positional prompt.
     * Mutually exclusive with `--repl`.
     */
    acp: boolean;
    /**
     * `--peers <id>@<host:port>` (repeatable): static peer cluster for
     * mesh collaboration (cluster rail, /peers, /route, …). Also reads
     * `ENVOY_PEERS` when no CLI peers are given.
     */
    peers: Array<{
        id: string;
        endpoint: string;
    }>;
    /** `--connect-timeout-ms <n>`: per-peer TCP connect timeout. */
    peerConnectTimeoutMs: number | undefined;
    /** `--no-color`: disable ANSI colors. */
    noColor: boolean;
    /** `--verbose`: print hook fires and validator verdicts. */
    verbose: boolean;
    /** `--quiet`: suppress human output, only stream-json. */
    quiet: boolean;
    /** Positional args: the prompt (or `-` for stdin, or a file path). */
    positional: string[];
}
/** Args for the `self-evolve` subcommand. */
export interface SelfEvolveParsedArgs {
    subcommand: "self-evolve";
    /** `--help`: print help and exit. */
    help: boolean;
    /** `--version`: print version and exit. */
    version: boolean;
    /** `--model <id>`: model identifier (passed to the adapter). */
    model: string | undefined;
    /** `--provider <name>`: provider name. */
    provider: string | undefined;
    /** `--scoreboard <path>`: scoreboard YAML file. */
    scoreboard: string | undefined;
    /** `--snapshot-dir <path>`: snapshot directory. */
    snapshotDir: string | undefined;
    /** `--benchmark <path>`: frozen benchmark YAML file. */
    benchmark: string | undefined;
    /** `--ruleset <path>`: live ruleset file (committed on `kept`). */
    ruleset: string | undefined;
    /** `--agents-md <path>`: user AGENTS.md (snapshotted, not edited in v0). */
    agentsMd: string | undefined;
    /** `--adoptions <path>`: federated adoptions YAML file. */
    adoptions: string | undefined;
    /** `--commit`: actually write the candidate on `kept` (default: shadow). */
    commit: boolean;
    /** `--recent-failures <n>`: number of recent entries to feed the prompt. */
    recentFailures: number | undefined;
    /** `--pull`: opt in to federated pull (off by default per design §13.3). */
    pull: boolean;
    /** `--peer-id <id>`: this peer's id (recorded in the adoptions log). */
    peerId: string | undefined;
    /** `--no-color`: disable ANSI colors. */
    noColor: boolean;
    /** `--verbose`: print hook fires and validator verdicts. */
    verbose: boolean;
    /** `--quiet`: suppress human output, only stream-json. */
    quiet: boolean;
}
/** Args for the `team` subcommand. */
export interface TeamParsedArgs {
    subcommand: "team";
    /** `--help`: print help and exit. */
    help: boolean;
    /** `--version`: print version and exit. */
    version: boolean;
    /** `--model <id>`: model identifier (passed to the adapter). */
    model: string | undefined;
    /** `--provider <name>`: provider name. */
    provider: string | undefined;
    /** `--cwd <path>`: override the working directory. */
    cwd: string | undefined;
    /** `--input <s>`: the team-level input (substituted
     *  into each agent's objective as `${input}`). */
    input: string | undefined;
    /** `--json`: machine-readable JSON Lines output. */
    json: boolean;
    /** `--quiet`: suppress human output, only stream-json. */
    quiet: boolean;
    /** The first positional: the path to the TOML
     *  team config. */
    positional: string[];
}
/** Args for the `doctor` subcommand. */
export interface DoctorParsedArgs {
    subcommand: "doctor";
    help: boolean;
    version: boolean;
    config?: string | undefined;
}
/** Args for the `mcp` subcommand (stdio MCP server). */
export interface McpParsedArgs {
    subcommand: "mcp";
    help: boolean;
    version: boolean;
    cwd?: string | undefined;
}
/** Args for the `tui` subcommand (delegate to envoy-harness-tui). */
export interface TuiParsedArgs {
    subcommand: "tui";
    help: boolean;
    version: boolean;
    noColor: boolean;
}
export type ParsedArgs = RunParsedArgs | SelfEvolveParsedArgs | TeamParsedArgs | DoctorParsedArgs | McpParsedArgs | TuiParsedArgs;
/** Error thrown when argv parsing fails. Caught by the runner. */
export declare class ArgvError extends Error {
    constructor(message: string);
}
/**
 * Parse `argv` (typically `process.argv.slice(2)`) into a
 * `ParsedArgs` object. The first non-flag positional selects
 * the subcommand; `self-evolve` is the only one in v0.
 *
 * Unknown flags throw `ArgvError`; this is intentional — silent
 * acceptance of unknown flags would mask typos.
 */
export declare function parseArgs(argv: ReadonlyArray<string>): ParsedArgs;
/** Print the help text to stderr (or wherever `out` points). */
export declare function formatHelp(version: string): string;
//# sourceMappingURL=argv.d.ts.map