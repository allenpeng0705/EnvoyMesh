/**
 * F17.1 + F17.2 — REPL types.
 *
 * The interactive REPL reads lines from a `LineReader`, dispatches
 * them to a long-lived `Agent`, and prints the result. A single
 * `Agent` is reused across turns (so the session, hooks, AGENTS.md,
 * and permission state are preserved).
 *
 * **Scope:**
 * - F17.1: the loop + agent reuse + exit on `/quit`, `/exit`, or EOF.
 * - F17.2: slash command registry (`/help`, `/model`, `/provider`,
 *   `/sandbox`, `/approval`, `/clear`, `/cost`, `/status`,
 *   `/quit` + aliases).
 * - F17.3: history persistence (deferred).
 *
 * **Design doc:** `docs/design.en.md` (Phase 6 F17).
 * **Implementation plan:** `docs/implementation-plan.md` §6.7.
 */
import type { HookRegistry } from "../../hooks/registry.js";
import type { ModelAdapter } from "../../model.js";
import type { Agent } from "../../agent.js";
import type { SubagentRecord } from "../../subagent/types.js";
import type { VerifierRule } from "../../verifier/types.js";
import type { SkillRegistry } from "../../skills/registry.js";
import type { RunParsedArgs } from "../argv.js";
import type { ReplCommandRegistry } from "./registry.js";
/**
 * Async line source for the REPL. The default implementation wraps
 * `node:readline` on stdin; tests inject a fake that yields
 * predetermined lines so they can drive the loop deterministically.
 */
export interface LineReader extends AsyncIterable<string> {
    /**
     * Pull the next line. Returns `{ value, done: false }` on a
     * line, or `{ done: true }` on EOF / close.
     */
    next(): Promise<IteratorResult<string>>;
    /**
     * Close the underlying stream. Called from the REPL's `finally`
     * so we don't leak the readline interface on early exit.
     */
    close(): void;
}
/**
 * Options for `runRepl`. The host (CLI runner, programmatic caller)
 * provides the model + args; everything else is optional with a
 * sensible default.
 */
export interface ReplOptions {
    /** The model adapter. Required (same as `AgentOptions.model`). */
    model: ModelAdapter;
    /**
     * The parsed CLI args. Used to populate `AgentOptions`
     * (`sandbox`, `approval`, `maxTurns`, `maxCostUsd`, `cwd`,
     * `tracer`).
     */
    args: RunParsedArgs;
    /** Hook registry. Default: a fresh `HookRegistry()`. */
    hooks?: HookRegistry;
    /** Cwd. Default: `args.cwd ?? process.cwd()`. */
    cwd?: string;
    /** The prompt string. Default: `"envoy> "`. */
    prompt?: string;
    /** Stream to write the prompt + agent output to. Default: `process.stdout`. */
    stdout?: NodeJS.WritableStream;
    /** Stream to write errors to (unknown commands, agent errors). Default: `process.stderr`. */
    stderr?: NodeJS.WritableStream;
    /**
     * Line reader. Default: a readline-based reader on stdin.
     * Tests inject a fake that yields predetermined lines.
     */
    lineReader?: LineReader;
    /**
     * F17.2: host-registered slash commands. Built-ins always
     * win on name collision. Use this to extend the REPL with
     * project-specific commands (e.g. `/pr`, `/deploy`).
     */
    customCommands?: ReadonlyArray<ReplCommand>;
    /**
     * F17.2.5: optional scoreboard (F6). The `/scoreboard`
     * command reads this; when undefined, the command prints
     * "no scoreboard loaded".
     */
    scoreboard?: {
        entries?: () => ReadonlyArray<unknown>;
    };
    /**
     * F17.2.5: optional verifier rules. The `/rules` command
     * reads this; when undefined, falls back to DEFAULT_RULES.
     * Shape matches the public `VerifierRule` type from
     * `src/verifier/types.ts`.
     */
    verifierRules?: ReadonlyArray<VerifierRule>;
    /**
     * Phase G: skill registry override. When set, the REPL does
     * not scan the default project/user skill roots — the caller
     * controls exactly which skills the agent sees. Tests pass an
     * empty registry so transcripts are hermetic (the skill-catalog
     * fragment is only injected when the registry is non-empty).
     */
    skills?: SkillRegistry;
    /**
     * F17.2.5: optional profile loader. The `/profile` command
     * reads this; when undefined, prints "no profile loader".
     * The host reads the TOML config and adapts it to the
     * `ReplProfileLoader` shape.
     */
    profileLoader?: ReplProfileLoader;
    /**
     * F17.2.5: optional LSP manager. When set, the 4 LSP
     * tools are auto-registered (F9.2) and the `/lsp`
     * command lists the active servers. When undefined,
     * the LSP tools are not registered and `/lsp` prints
     * "no LSP servers configured".
     */
    lspManager?: import("../../lsp/index.js").LspManager;
    /**
     * F17.3: path to the history file. On REPL start, the
     * file is read (if it exists) and the lines become the
     * initial history. On REPL exit, the accumulated history
     * is written back to the file.
     *
     * **Default:** `~/.local/state/envoy-harness/history`
     * (or `$ENVOY_HARNESS_HISTORY` if set). Override via
     * this option for tests (a temp file) or for hosts
     * that want a different location.
     *
     * **Disable:** set this to `""` (empty string) to
     * skip history persistence entirely. Useful for
     * non-interactive use cases (CI, scripted runs).
     */
    historyPath?: string;
    /**
     * F17.3: max number of history lines to keep. When the
     * history exceeds this size, the oldest lines are
     * dropped (FIFO). Default: 1000.
     */
    historySize?: number;
    /**
     * F17.6: sub-agent registry. The `/agents` command
     * reads from this. When the agent's `meshSubmitter`
     * implements `listSubagents()`, the loop auto-wires
     * this option (no need for the host to set it
     * explicitly). For tests, the host can inject a
     * custom registry (e.g. a stub that returns a
     * predetermined list of records).
     *
     * **Why a separate option, not a method on Agent:**
     * the REPL's loop is the chokepoint; it builds the
     * agent internally and needs to extract the
     * submitter. A separate `subagentRegistry` option
     * lets tests inject a registry without constructing
     * a real `LocalMeshSubmitter`.
     */
    subagentRegistry?: SubagentRegistry;
    /**
     * Phase A / Item 5: the user-question service. When
     * set, the REPL loop uses this service instead of
     * creating a fresh one (the default behavior is
     * "create a fresh service + register the REPL
     * stdin provider"). Tests inject a fake service
     * here to drive `ask_user` tool calls
     * deterministically. Hosts that want a different
     * provider (Tauri, mesh) can pass their own
     * pre-populated service.
     */
    userQuestions?: import("../../interaction/index.js").UserQuestionService;
    /**
     * Phase A / Item 2: the memory store. When set,
     * the REPL's `/memory` commands use this store
     * directly. The default behavior (when unset) is
     * to create a fresh `LocalMemoryStore` rooted at
     * `./memories` (or `$ENVOY_MEMORY_DIR` when set).
     * Tests inject a `LocalMemoryStore` rooted at a
     * temp dir.
     */
    memoryStore?: import("../../memories/index.js").MemoryStore;
    /**
     * F14.1: seed value for `ReplContext.lastResponse`.
     * When set, the loop uses this as the initial
     * `lastResponse` (before any turns have run).
     * Used by tests to exercise the `/copy` command
     * without going through a real agent turn.
     *
     * The loop overwrites this field on every turn
     * (so it's only the initial value that's
     * controlled). For runtime hosts, leave it
     * undefined.
     */
    lastResponse?: string;
    /**
     * F14.2: when both `sessionStore` and `resumeFromId`
     * are set, the loop loads the persisted session
     * from the store and passes it to the Agent
     * (instead of creating a fresh `InMemorySession`).
     *
     * **Why options on the loop, not via `Agent` setup:**
     * the loop is the chokepoint — it builds the Agent
     * from the loaded session. Threading the
     * `SessionStore` through the loop's options
     * matches the existing pattern (history file,
     * LSP manager, subagent registry all follow the
     * same shape: loop-level option, no Agent API
     * change).
     *
     * **Mutual exclusion:** if `sessionStore` is set
     * without `resumeFromId`, the loop throws
     * (`sessionStore requires resumeFromId`).
     *
     * **For `--persist` REPL mode:** set
     * `sessionStore` + a `createSession?: () => Promise<Session>`
     * factory (NOT `resumeFromId`). The loop calls
     * the factory to mint a fresh `PersistedSession`
     * and uses that. v0 keeps this simple: the CLI
     * runner's `runReplDispatch` builds the session
     * itself when `parsed.persist` is set, then
     * passes it via a different code path. Hosts
     * that want a different shape can construct
     * the session in `createSession`.
     */
    sessionStore?: import("../../session/index.js").SessionStore;
    /**
     * F14.2: the id of the persisted session to
     * resume. Required when `sessionStore` is set
     * (see `sessionStore` for the exception list).
     */
    resumeFromId?: string;
    /**
     * F14.2: optional factory for creating a new
     * persisted session. When set, the loop calls
     * this factory to mint a fresh `PersistedSession`
     * (used by `--persist` REPL mode). When
     * undefined, the loop uses the default
     * `InMemorySession` (or, when `sessionStore +
     * resumeFromId` are set, the loaded persisted
     * session).
     *
     * The factory is async to accommodate the
     * `mkdir -p` + `fs.writeFile` round-trip in
     * `PersistedSession.create()`. The loop awaits
     * it; errors propagate as REPL startup
     * failures (the loop throws before reading the
     * first line).
     */
    createSession?: () => Promise<import("../../session.js").Session>;
    /**
     * F14.3: custom diff fetcher for the `/review`
     * command. The default implementation spawns
     * `git diff` (or `git diff --cached` with the
     * `staged` arg) in the cwd. Tests inject a
     * custom fetcher to assert the /review flow
     * without needing a real git repo.
     *
     * **Return shape:** `{ stdout, stderr, exitCode }`,
     * same as `child_process.spawnSync`. The /review
     * command treats non-zero exit + non-empty stderr
     * as an error (prints to stderr); non-zero exit
     * with empty stderr is "no changes" (git's
     * normal exit-1-on-changes case).
     */
    reviewDiff?: (opts: {
        cwd: string;
        staged: boolean;
    }) => {
        stdout: string;
        stderr: string;
        exitCode: number;
        error?: string;
    };
}
/**
 * The result of a REPL session. Returned from `runRepl` so the
 * caller (the CLI runner) can build a `RunResult` for symmetry
 * with the single-shot path.
 */
export interface ReplResult {
    /** Always 0 for now (F17.1). Agent errors print to stderr but don't fail the REPL. */
    exitCode: number;
    /** Number of turns the agent ran (excludes blank + exit + unknown-slash lines). */
    turns: number;
    /** Total cost in USD across all turns. */
    totalCostUsd: number;
    /** The session id (shared across all turns). */
    sessionId: string;
}
/**
 * F17.2.5: a profile loaded from the TOML config. The keys
 * are open-ended; the runner formats whatever the host
 * provides. The well-known keys are `provider`, `model`,
 * `sandbox`, `approval` (per the README).
 */
export type ReplProfile = Readonly<Record<string, unknown>>;
/**
 * F17.6: sub-agent registry. The `/agents` command
 * reads from this. The default impl is wired by the
 * loop from `agent.getMeshSubmitter()?.listSubagents?.()`;
 * hosts can override via `ReplOptions.subagentRegistry`.
 *
 * **Why a small interface, not the full
 * `MeshSubmitter`:** the REPL only needs the
 * listing capability. A smaller surface is easier
 * to mock in tests (no need to construct a real
 * `LocalMeshSubmitter`).
 */
export interface SubagentRegistry {
    /**
     * Return a snapshot of the spawned sub-agents.
     * The returned array is a read-only view (the
     * caller MUST NOT mutate it).
     */
    list(): ReadonlyArray<SubagentRecord>;
}
/**
 * F17.2.5: the profile loader. The host injects one via
 * `ReplOptions.profileLoader`. The runner calls `list()`
 * for `/profile` (no args) and `get(name)` for `/profile
 * <name>`.
 */
export interface ReplProfileLoader {
    /** List the available profile names. */
    list(): ReadonlyArray<string>;
    /** Get a profile by name, or `null` if it doesn't exist. */
    get(name: string): ReplProfile | null;
}
/**
 * F17.2: the context passed to a slash command's handler.
 * Carries the live agent + the parsed CLI args + the streams.
 * Commands can mutate `args` (e.g. `/sandbox` updates the
 * permission mode) and the next turn picks up the change.
 */
export interface ReplContext {
    /** The current Agent. Commands can mutate it via the
     *  public setters (`setModel`, `setAskHandler`,
     *  `setPermissionMode`, `clearSession`, `getCost`). */
    agent: Agent;
    /** Current parsed args. Mutable; commands update fields
     *  in place (e.g. `args.sandbox` after `/sandbox`). */
    args: RunParsedArgs;
    /** Streams. */
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    /** Counter for turns (read-only; managed by `runRepl`). */
    turns: number;
    /** Counter for cost (read-only; managed by `runRepl`). */
    totalCostUsd: number;
    /** The live command registry. Set by `runRepl` before
     *  dispatching; the `/help` command reads it to enumerate
     *  the visible commands. The type is non-optional because
     *  the runner always sets it; if a host constructs a
     *  custom context (in tests), the field is required. */
    registry: ReplCommandRegistry;
    /** F17.2.5: optional scoreboard (F6). The `/scoreboard`
     *  command reads this; when undefined, the command prints
     *  "no scoreboard loaded". */
    scoreboard?: {
        entries?: () => ReadonlyArray<unknown>;
    };
    /** F17.2.5: optional verifier rules. The `/rules` command
     *  reads this; when undefined, falls back to DEFAULT_RULES. */
    verifierRules?: ReadonlyArray<VerifierRule>;
    /** F17.2.5: optional profile loader. The `/profile` command
     *  reads this; when undefined, prints "no profile loader". */
    profileLoader?: ReplProfileLoader;
    /** F17.6: optional sub-agent registry. The `/agents`
     *  command reads this; when undefined, prints
     *  "no sub-agents (the agent has no meshSubmitter
     *  or the submitter doesn't implement listSubagents)". */
    subagentRegistry?: SubagentRegistry;
    /** Phase A / Item 2: the memory store. The `/memory`
     * commands read + write this; when undefined, the
     * commands print "no memory store configured".
     * The REPL loop sets this from
     * `ReplOptions.memoryStore` (or constructs a
     * `LocalMemoryStore` from `$ENVOY_MEMORY_DIR` /
     * `./memories` as a default). */
    memoryStore?: import("../../memories/index.js").MemoryStore;
    /**
     * F14.1: the last assistant text from the most recent
     * agent turn. The loop updates this after every turn;
     * the `/copy` command reads it. `undefined` before
     * the first turn (no response yet to copy).
     *
     * **Why a context field, not a method on Agent:**
     * the REPL's loop is the chokepoint — it knows when
     * a turn completes and what the assistant text was
     * (it already prints it to stdout). Threading the
     * text through a single field keeps the contract
     * simple. Tests inject a value via the
     * `lastResponse` field below for deterministic
     * assertions.
     */
    lastResponse?: string;
    /**
     * F14.3: custom diff fetcher for `/review`. The
     * loop sets this from `ReplOptions.reviewDiff`
     * (default: `undefined`, in which case `/review`
     * uses its own `defaultReviewDiff` which spawns
     * `git diff` / `git diff --cached`). Tests inject
     * a custom fetcher to assert the `/review` flow
     * without needing a real git repo.
     */
    reviewDiff?: (opts: {
        cwd: string;
        staged: boolean;
    }) => {
        stdout: string;
        stderr: string;
        exitCode: number;
    };
}
/**
 * F17.2: the shape of a slash command. The registry is
 * open: built-ins are registered in `commands.ts`, and
 * hosts can add project-specific commands via
 * `ReplOptions.customCommands`.
 *
 * **Built-ins always win** on name collision. The registry
 * resolves names case-sensitively (matches the input
 * exactly); `/HELP` does NOT match `/help`.
 */
export interface ReplCommand {
    /** The slash name, including the leading `/`. Example: `"/help"`. */
    name: string;
    /** One-line description shown in `/help`. */
    description: string;
    /** Hidden commands are not listed in `/help` (e.g. `/exit` is an alias of `/quit`). */
    hidden?: boolean;
    /**
     * Run the command. `args` is the tokenized args (the
     * leading slash-name is stripped; `parseCommandLine`
     * splits on whitespace, no quote handling in v0).
     *
     * **Throw** to surface an error to the user. The REPL
     * catches the throw and prints `error: <message>` to
     * stderr; the loop continues.
     */
    handler: (args: ReadonlyArray<string>, ctx: ReplContext) => Promise<void> | void;
}
//# sourceMappingURL=types.d.ts.map