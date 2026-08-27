/**
 * Agent — the main loop that drives model ↔ tool execution.
 *
 * **Design doc:** `docs/design.md` §3 (runtime core).
 *
 * **The loop (per design §3.4):**
 *
 * 1. Append the user's prompt to the session.
 * 2. Call the model with the full transcript + available tools.
 * 3. Append the assistant's response to the session.
 * 4. If the response has no tool calls, return the result.
 * 5. For each tool call:
 *    a. Fire `PreToolUse` hook; abort if `block`.
 *    b. Validate args against the tool's zod schema.
 *    c. Execute the tool.
 *    d. Fire `PostToolUse` hook; honor `modify`.
 *    e. Append the tool result to the session.
 * 6. Loop back to step 2.
 *
 * **Max iterations:** the loop is bounded by `maxIterations`
 * (default 50). If exceeded, the agent throws — the orchestrator
 * (CLI / mesh) is responsible for retry / abort policy. A
 * runaway loop is a configuration error, not a recoverable
 * condition.
 *
 * **Error handling:** tool exceptions are caught and turned into
 * `isError: true` tool results. The model can read the error
 * message and try again. Only the `maxIterations` exhaustion
 * is a hard throw.
 *
 * **Hook integration:** PreToolUse / PostToolUse are wired in.
 * The other 10 hook events (SessionStart, PreCompact, etc.) are
 * fired by the orchestrator (CLI / mesh), not the agent loop.
 * Per design §8.1, the agent loop is one of several fire sites.
 *
 * **Stability:** the public API is `run()`. Adding new options
 * (e.g. `systemPrompt`) is additive.
 */
import { HookRegistry } from "./hooks/index.js";
import { ActionJournal } from "./action-journal.js";
import type { ModelAdapter } from "./model.js";
import type { Session } from "./session.js";
import type { ContentBlock, ToolRegistry } from "./tools/index.js";
import type { AskForApproval, AskHandler, PermissionMode, SandboxPolicy } from "./types.js";
import { CostTracker } from "./cost.js";
import type { SandboxExecutor } from "./sandbox/types.js";
import type { LspManager } from "./lsp/index.js";
import type { Tracer } from "./trace/index.js";
import type { MeshSubmitter } from "./subagent/index.js";
import type { FanOutRegistry } from "./subagent/fan-out.js";
import { ToolExecutor } from "./agent/tool-executor.js";
import { type TurnHints } from "./interaction/turn-hints.js";
import type { UserQuestionService } from "./interaction/user-questions.js";
/** Default max iterations before the agent throws. */
export declare const DEFAULT_MAX_ITERATIONS = 50;
/** F10.2: default cap on sub-agents per turn.
 *  Picked to be generous (the model rarely needs
 *  more than 3-4 sub-agents in one turn) while
 *  still bounding cost. The host can lower this
 *  for production. */
export declare const DEFAULT_MAX_SUBAGENTS = 8;
export interface AgentOptions {
    /** The model adapter. Required. */
    model: ModelAdapter;
    /** The tool registry. The agent looks up tools by name. */
    tools: ToolRegistry;
    /** The session. The agent appends to its transcript. */
    session: Session;
    /**
     * Hook registry. Defaults to a **fresh** `HookRegistry` per Agent so
     * PreToolUse / ACP permission hooks cannot stack on a process-wide
     * singleton. Pass `defaultRegistry` explicitly only when intentional.
     */
    hooks?: HookRegistry;
    /** Working directory for tool execution. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Max iterations before throwing. Default 50. */
    maxIterations?: number;
    /**
     * Abort signal. When aborted, the agent stops the loop and
     * any in-flight tool is canceled (via the `ToolContext`'s
     * `abortSignal`).
     */
    abortSignal?: AbortSignal;
    /**
     * Optional system prompt. Prepended to the transcript as a
     * system message before the first model call. v0 simply
     * appends; adapters that prefer separate system channels
     * can read the first system message and inject it natively.
     */
    systemPrompt?: string;
    /**
     * F7.5: cost ceiling. When the accumulated
     * `costTracker.total().costUsd` exceeds this number, the
     * agent aborts (sets `stopReason: "aborted"`). The check
     * happens after every model call that reports `usage`.
     * `0` means "no cap" (the cross-verify path passes 0 as
     * "free"; a $0 ceiling would abort on the first token
     * spend). Default: no cap.
     */
    maxCostUsd?: number;
    /**
     * F9.1: per-call approval handler. When a hook returns
     * `kind: "ask"`, the agent loop pauses and calls this
     * handler. The handler returns an `AskDecision`
     * (allow / deny / modify). When `undefined`, the agent
     * defaults to `deny` (safe default — the tool is
     * blocked with "no ask handler configured").
     */
    askHandler?: AskHandler;
    /**
     * F9.2: LSP manager. When provided, the 4 LSP tools
     * (`lsp_definition`, `lsp_references`, `lsp_hover`,
     * `lsp_diagnostics`) are auto-registered with the
     * tool registry. No manager → no LSP tools (the
     * model's tool list doesn't mention LSP at all).
     *
     * **Lifecycle:** the agent does NOT close the
     * manager. The host (Tauri, the CLI) owns the
     * `LspManager`'s lifecycle; the agent borrows it for
     * the duration of a run.
     */
    lspManager?: LspManager;
    /**
     * F9.4: tracer. When undefined, a `NullTracer` is
     * used (no observable side effect). The CLI's
     * `--json` flag wires a `JsonLinesTracer` to stdout.
     *
     * **Sync contract:** `Tracer.emit` is synchronous.
     * The agent does not await; a tracer that needs
     * async I/O must buffer.
     */
    tracer?: Tracer;
    /**
     * F10.1: mesh submitter. When set, the `task`
     * tool is auto-registered with the parent's tool
     * registry. The model can spawn sub-agents via
     * the `task` tool; the submitter decides where
     * the sub-agent runs (locally, on a peer, etc.).
     *
     * **No submitter → no `task` tool.** The model
     * never sees the tool if the host hasn't
     * configured a submitter. This is the
     * "opt-in" pattern: sub-agents are an explicit
     * capability the host turns on.
     *
     * **Default submitter:** `LocalMeshSubmitter` +
     * `defaultBuildSubagentFactory` are the
     * recommended defaults for a same-node host.
     * Cross-node hosts inject a future
     * `RemoteMeshSubmitter`.
     */
    meshSubmitter?: MeshSubmitter;
    /**
     * F10.2: max sub-agents per turn. Hard cap
     * on the number of `task` calls the model
     * can emit in a single iteration. Default: 8.
     *
     * **When exceeded:** the agent refuses ALL the
     * `task` calls in that turn (returns one
     * `isError: true` tool_result per refused call
     * with the message `"maxSubagents reached: N
     * task calls in one turn (cap is M). Refused."`).
     * **Why refuse all, not partial:** partial runs
     * would hide the constraint from the model;
     * refusing all teaches the model to budget
     * its sub-agents.
     *
     * **Sub-agent cost:** the parent's `maxCostUsd`
     * cap is unchanged (it's a per-Agent cap, only
     * the parent's model calls). Sub-agents have
     * their own `CostTracker`s. The host budgets
     * sub-agents separately via each `task` call's
     * `cost_ceiling_usd`.
     */
    maxSubagents?: number;
    /**
     * F10.4.1: optional fan-out registry. When set,
     * the `task` tool consults the registry on every
     * call. If a `FanOutSpec` matches the input's
     * `capability_tag`, the tool expands ONE model
     * call into N parallel sub-agents (per the
     * spec's `count`), then aggregates the N results
     * into ONE for the model.
     *
     * **No registry → no fan-out** (F10.1 + F10.2
     * baseline). The model emits N `task` calls;
     * the agent runs them in parallel. With a
     * registry, the host controls fan-out without
     * teaching the model about it.
     *
     * **Example:** the host wants every
     * `capability_tag: "research"` call to fan out
     * to 3 sub-agents with different objectives.
     * The model emits ONE call; the registry
     * expands it. The model sees ONE result.
     */
    fanOutRegistry?: FanOutRegistry;
    /**
     * F10.6: the parent session id, when this
     * `Agent` is a SUB-agent. When set, every
     * `TraceEvent` emitted by this agent carries
     * `subagentOf: <parentSessionId>`. The PARENT's
     * own agents do NOT set this (the parent is the
     * root; its events have no `subagentOf`).
     *
     * **Who sets it:** the `LocalMeshSubmitter`'s
     * `defaultBuildSubagentFactory` (when `parentTracer`
     * is set) and the F10.3.2 `RemoteMeshSubmitter`
     * factory. The host doesn't set this directly;
     * the submitter does.
     *
     * **Why a separate field, not just `sessionId`:**
     * the sub-agent has its own `sessionId` (the
     * sub-agent's own `AgentStartEvent.sessionId`).
     * `subagentOf` points UP to the parent, separate
     * from the sub-agent's own id. A Tauri UI showing
     * a tree (parent → 3 sub-agents) uses
     * `subagentOf` for the parent edge and
     * `sessionId` for the child node.
     */
    subagentOf?: string;
    /**
     * Approval policy for the session. Controls how `ask`
     * hook decisions are resolved:
     *
     * - `never`: asks are denied unconditionally (fail-closed,
     *   even if a host installed an allow-ing `askHandler`).
     * - `unless-trusted` / `on-request` / `granular`: asks are
     *   delegated to `askHandler` (default: deny when no handler
     *   is installed).
     *
     * Default: `on-request` (delegate). v0 has no per-tool
     * trust metadata, so `unless-trusted` and `granular` behave
     * like `on-request` until such metadata exists.
     */
    approval?: import("./types.js").AskForApproval;
    /**
     * T3.3: MCP client registry. When provided, the
     * agent collects the registered clients' tools
     * (prefixed `mcp__<server>__<tool>`) and exposes
     * them to the model. The registry owns the
     * clients' lifecycles; `agent.close()` (when
     * added in a future chunk) will call
     * `registry.closeAll()`. v0: the host injects a
     * pre-populated registry; the stdio transport
     * (that would populate it from `[mcp_servers]`
     * in the TOML config) lands in a follow-up
     * sub-chunk.
     */
    mcpClients?: import("./mcp/index.js").McpClientRegistry;
    /**
     * Phase C: background job registry. When set, `abort()` calls
     * `disposeOwner(session.id)` so background bash / terminal
     * sends are cancelled with the session.
     */
    jobRegistry?: import("./jobs/types.js").JobRegistry;
    /**
     * Phase C: terminal session service. When set, `abort()` closes
     * every terminal owned by `session.id`.
     */
    terminalService?: import("./terminal/types.js").TerminalSessionService;
    /**
     * Memory store for per-turn memory-index injection.
     */
    memoryStore?: import("./memories/store.js").MemoryStore;
    /**
     * Skill registry for per-turn skill-catalog injection.
     */
    skills?: import("./skills/registry.js").SkillRegistry;
    /**
     * Codex-shaped shell env filter applied to bash / background jobs.
     */
    shellEnvironmentPolicy?: import("./config/shell-env.js").ShellEnvironmentPolicy;
    /**
     * Optional pre-built sandbox policy (from ConfigLayer). When set,
     * overrides the policy derived from session permission mode alone.
     */
    sandboxPolicy?: import("./types.js").SandboxPolicy;
    /**
     * Phase F: optional explicit OS sandbox executor.
     * When omitted, the agent resolves one from the
     * live sandbox policy + host platform (landlock
     * on Linux, seatbelt on macOS, noop elsewhere /
     * when `backend: "none"`).
     */
    sandboxExecutor?: import("./sandbox/types.js").SandboxExecutor;
    /**
     * Phase B / Item 3.1: capability-module registry.
     * When set, the constructor stores it on the
     * `agent.plugins` field. The host (the CLI runner)
     * constructs the agent FIRST (so the plugin's
     * hooks / tools can register on the SAME
     * `HookRegistry` / `ToolRegistry` the agent uses),
     * then loads + registers the plugins via
     * `registry.register(module, config, ctx)` where
     * `ctx.hooks` and `ctx.tools` are the agent's own
     * registries. The agent itself doesn't auto-wire
     * plugins — the host owns that step.
     *
     * **Future chunks** add the integration: `/plugins`
     * REPL command, sub-agent inheritance, and the
     * `disposeAll()` call on `clearSession` /
     * `newSession`.
     */
    plugins?: import("./plugins/index.js").PluginRegistry;
    /**
     * Phase A / Item 5: the user-question service. When
     * set, the agent:
     *
     * 1. Auto-registers the `ask_user` tool on the tool
     *    registry (the model can then call it to ask the
     *    human questions; the tool delegates to the
     *    service).
     * 2. Installs an `AskForApproval` shim as the default
     *    `askHandler` (when no explicit `askHandler` was
     *    provided). Hooks that return `kind: "ask"` go
     *    through the same service, so the human sees ONE
     *    interaction surface for both `ask_user` and
     *    approval.
     *
     * **No service → no `ask_user` tool, no shim.** The
     * existing v0 behavior is preserved (no model-facing
     * ask_user; `askHandler` defaults to deny or the
     * host-injected handler).
     *
     * **Why opt-in:** the headless / Tauri / mesh hosts
     * each wire their own provider. The CLI one-shot
     * path deliberately does NOT set this (no human
     * channel); the existing `defaultAskHandler` (deny +
     * log) is the right behavior.
     */
    userQuestions?: UserQuestionService;
}
/** What `Agent.run()` returns. */
export interface AgentResult {
    /** The final assistant content blocks. */
    content: ContentBlock[];
    /**
     * Why the loop exited. `tool_use` is the model's own signal
     * (it emitted tool calls but the model stop reason is still
     * `end_turn` after the agent executes them). `max_iterations`
     * is the agent's own bound. `aborted` is the user / system.
     */
    stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "max_iterations" | "aborted";
    /** Number of model calls made. */
    iterations: number;
    /** Total tool calls executed. */
    toolCalls: number;
    /**
     * The full transcript (system + user + assistant + tool). The
     * verifier reads from this to check sandbox-respect and
     * approval-respect. v0 exposes the full transcript so the
     * verifier can see exactly what the worker did.
     */
    messages: ReadonlyArray<import("./tools/index.js").Message>;
    /**
     * Effective sandbox policy. The verifier's `sandbox-respected`
     * rule uses this to bound which paths are allowed.
     */
    sandboxPolicy: SandboxPolicy;
    /**
     * Accumulated cost + token metrics across the run. F7.1:
     * populated from each `ModelResponse.usage` via the
     * `CostTracker`. `costUsd` is 0 when no usage was reported
     * (e.g. FakeModel, local models, or adapters that don't
     * surface usage).
     */
    metrics: {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    };
    /**
     * Optional follow-up suggestions and deferred tasks recorded via
     * `suggest_follow_ups` during this turn.
     */
    turnHints?: TurnHints;
}
export declare class Agent {
    /** @internal */
    model: ModelAdapter;
    /** @internal */
    tools: ToolRegistry;
    /** @internal */
    session: Session;
    /** @internal */
    hooks: HookRegistry;
    /** @internal */
    cwd: string;
    /** @internal */
    maxIterations: number;
    /** @internal */
    abortController: AbortController;
    /** @internal */
    systemPrompt: string | undefined;
    /** @internal */
    toolCallCount: number;
    /** @internal Effective sandbox policy, derived from the session. The verifier reads this. */
    sandboxPolicy: SandboxPolicy;
    /**
     * @internal Phase F: optional host-supplied OS sandbox
     * executor. When undefined, `getSandboxExecutor` resolves
     * from policy + platform.
     */
    sandboxExecutor: SandboxExecutor | undefined;
    /** @internal Cost tracker; populated across the run. F7.1. */
    costTracker: CostTracker;
    /** @internal F7.5: cost ceiling; when exceeded, the agent aborts. */
    maxCostUsd: number | undefined;
    /** @internal F9.1: per-call approval handler. */
    askHandler: AskHandler | undefined;
    /** @internal F9.2: LSP manager (when provided, the 4 LSP tools are registered). */
    lspManager: LspManager | undefined;
    /** @internal F9.4: tracer. Always non-null (defaults to NullTracer). */
    tracer: Tracer;
    /** @internal F10.1: mesh submitter. When set, the `task` tool
     *  is auto-registered in the constructor. */
    meshSubmitter: MeshSubmitter | undefined;
    /** @internal F10.4.1: fan-out registry. When set, the `task`
     *  tool consults it on every call. */
    fanOutRegistry: FanOutRegistry | undefined;
    /**
     * T3.3: MCP client registry. When set, the
     * `mcp__<server>__<tool>` calls in the model's
     * response are routed to the matching client.
     * The host injects the registry via
     * `AgentOptions.mcpClients`; the stdio transport
     * (which would populate it from the TOML config)
     * lands in a follow-up sub-chunk.
     */
    mcpClients: import("./mcp/index.js").McpClientRegistry | undefined;
    /** @internal Phase C: dispose background jobs on abort. */
    jobRegistry: import("./jobs/types.js").JobRegistry | undefined;
    /** @internal Phase C: close owned terminals on abort. */
    terminalService: import("./terminal/types.js").TerminalSessionService | undefined;
    /** @internal Per-turn memory index injection. */
    memoryStore: import("./memories/store.js").MemoryStore | undefined;
    /** @internal Per-turn skill catalog injection. */
    skills: import("./skills/registry.js").SkillRegistry | undefined;
    /** @internal Digest of last injected skill catalog (KV-cache stable). */
    skillCatalogDigest: string | undefined;
    /** @internal Shell env policy for bash/jobs. */
    shellEnvironmentPolicy: import("./config/shell-env.js").ShellEnvironmentPolicy | undefined;
    /** @internal F10.2: max sub-agents per turn. */
    maxSubagents: number;
    /** @internal F10.6: parent session id (when this is a
     *  sub-agent). Every `TraceEvent.emit` includes
     *  this as `subagentOf` so the parent tracer can
     *  attribute events without consumer-side
     *  inference. Undefined for the root agent. */
    subagentOf: string | undefined;
    /**
     * @internal Phase B / Item 3.1: capability-module
     * registry. When set, the agent exposes a
     * `CapabilityContext` to the registry (so plugins can
     * register hooks / tools on this agent). The host
     * owns the registry's lifetime; the agent is just
     * a consumer.
     */
    plugins: import("./plugins/index.js").PluginRegistry | undefined;
    /** @internal F-fix: approval policy. Defaults to `on-request`. */
    approval: AskForApproval;
    /**
     * @internal Phase A / Item 5: the user-question service.
     * When set, the agent exposes the `ask_user` tool and
     * (when no explicit `askHandler` is configured) routes
     * approval asks through the same service. The setter
     * `setUserQuestions` lets hosts (e.g. the REPL) install
     * the service after construction; the tool is
     * registered / unregistered on the tool registry.
     */
    userQuestions: UserQuestionService | undefined;
    /**
     * @internal Protocol / TUI: assistant token sink for the
     * current `run()` turn. Set by `createAgentSessionBackend`
     * during `prompt`; cleared in `finally`.
     */
    assistantStreamSink: ((delta: string) => void) | undefined;
    /**
     * @internal Protocol / TUI: live tool stdout sink for the
     * current `run()` turn. Set by `createAgentSessionBackend`
     * during `prompt`; cleared in `finally`.
     */
    toolOutputSink: ((info: {
        toolName: string;
        callId: string;
        stdout: string;
    }) => void) | undefined;
    /** @internal Write/edit journal for `/undo`. */
    actionJournal: ActionJournal;
    /** @internal Follow-ups / deferrals collected during the current `run()`. */
    turnHints: TurnHints;
    /**
     * @internal Phase A / Item 5 (self-review): `true` when
     * `this.askHandler` is the auto-installed
     * `AskForApproval` shim (i.e. NOT an explicit
     * host-supplied handler). Used by `setUserQuestions`
     * to know whether the shim should be REPLACED on a
     * service change, and by `setAskHandler(undefined)`
     * to know whether to install / clear the shim.
     *
     * **Invariant:** `this.askHandlerIsShim === false`
     * whenever `this.askHandler` is an explicit
     * host-supplied handler. The constructor + both
     * setters keep this invariant.
     */
    askHandlerIsShim: boolean;
    /**
     * T2.3: the per-tool-call execution seam, extracted
     * from this file. `run()` calls `executor.executeMany(calls, iter)`
     * for each batch of tool calls in the model's response.
     * The executor holds no state of its own — it reads
     * everything from a `ToolExecutorContext` that's
     * rebuilt each time `executor` is reassigned (today:
     * never; the context captures the live references).
     *
     * @internal T3.1: now public (no modifier) so the
     * `runAgentLoop` function in `./agent/run-loop.ts`
     * can call `agent.executor.executeMany`. The
     * public API doesn't expose `executor` — consumers
     * use `Agent.run`, never `agent.executor` directly.
     */
    executor: ToolExecutor;
    constructor(options: AgentOptions);
    /**
     * T2.3: build the ToolExecutor context. Called once
     * in the constructor; the returned object holds
     * references (not snapshots) so the executor always
     * reads the agent's live state. `sandboxPolicy`,
     * `askHandler`, and `approval` are getter callbacks
     * because they can change at runtime (REPL slash
     * commands `/sandbox`, future `/askHandler`, and
     * `/approval`).
     */
    private buildExecutorContext;
    /** The AbortSignal tools see in their context. */
    get abortSignal(): AbortSignal;
    /** Whether `/undo` can restore the last write/edit. */
    canUndo(): boolean;
    /** Restore the last journaled write or edit. */
    undoLastFileChange(): Promise<{
        path: string;
        action: "restored" | "removed";
    }>;
    /** Clear follow-up hints at the start of each `run()`. */
    clearTurnHints(): void;
    /** Merge hints from `suggest_follow_ups` tool calls. */
    recordTurnHints(partial: TurnHints): void;
    /**
     * Abort the agent. The current iteration finishes (we don't
     * interrupt in-flight model calls), but the loop exits before
     * the next one starts. Tools in flight see their `abortSignal`
     * fire.
     */
    abort(reason?: unknown): void;
    /**
     * F17.2: replace the model adapter. Takes effect on the next
     * `agent.run()` call. The current turn (if any) finishes with
     * the old model.
     *
     * **Why public:** the REPL's `/model` and `/provider` slash
     * commands need to swap models mid-session without rebuilding
     * the Agent (and re-discovering AGENTS.md / re-registering
     * hooks). The swap is just a field replacement; no other
     * state depends on the model's identity.
     *
     * **Cost tracking:** the cost tracker is keyed by the
     * `response.model` field that each adapter populates, NOT
     * by the adapter's identity. So a model swap doesn't
     * require touching the cost tracker — the next response
     * carries the new model's name.
     */
    setModel(model: ModelAdapter): void;
    /**
     * F17.5: read-only access to the current model adapter.
     * The `/init` REPL command uses this to fire a one-shot
     * model call without going through `agent.run` (which
     * would pollute the main session transcript).
     *
     * **Why public:** the REPL's slash commands need to
     * invoke the model outside the agent loop (e.g. for
     * `AGENTS.md` generation). Exposing `getModel()` keeps
     * the adapter identity encapsulated while letting
     * commands fire their own `complete()` calls.
     */
    getModel(): ModelAdapter;
    /**
     * F17.6: read-only access to the mesh submitter (when
     * one is configured). The REPL's `/agents` command uses
     * this to read the sub-agent registry.
     *
     * **Why public:** the REPL's loop builds the agent
     * internally; it doesn't have the submitter reference
     * to pass to commands. Exposing `getMeshSubmitter()`
     * lets the loop extract the submitter (when present)
     * and wire it into `ReplContext.subagentRegistry`.
     *
     * **Why read-only:** the submitter is a per-Agent
     * configuration; commands must NOT swap it mid-run.
     * If a host needs to swap submitters, they construct
     * a new `Agent`.
     *
     * **Returns `undefined` when no submitter is
     * configured** (the agent has no `task` tool; the
     * `/agents` command should print "no sub-agents
     * configured" in that case).
     */
    getMeshSubmitter(): MeshSubmitter | undefined;
    /**
     * F17.2: replace the per-call approval handler. Takes effect
     * on the next tool call. Pass `undefined` to remove the
     * handler and fall back to the default (deny by default;
     * the auto-installed shim if a `UserQuestionService` is
     * registered).
     *
     * **Phase A / Item 5 (self-review):** the handler is
     * considered "explicit" (the host owns it) whenever
     * `handler !== undefined` OR `this.askHandlerIsShim`
     * is false. The shim is the default; `setAskHandler`
     * is the only way to install a non-default explicit
     * handler. Calling `setAskHandler(undefined)` RESTORES
     * the default — if a service is registered, the shim
     * is re-installed; if not, the handler stays
     * `undefined` (deny).
     */
    setAskHandler(handler: AskHandler | undefined): void;
    /**
     * Phase A / Item 5: install / replace the
     * `UserQuestionService`. When set, the `ask_user` tool
     * is (re)registered on the tool registry; when unset
     * the tool is removed (the model no longer sees it).
     *
     * **The approval shim:** if the current `askHandler`
     * is the auto-installed shim (i.e. NO explicit
     * handler is set), this setter REPLACES the shim
     * with a new one that closes over the new service
     * (so approval hooks go through the right service).
     * If the host passed an explicit handler, the
     * explicit handler is left alone (it takes
     * precedence). The setter does NOT overwrite an
     * explicit handler — use `setAskHandler` for that.
     *
     * **Re-registration:** passing a new service replaces
     * the previously-registered `ask_user` tool (the old
     * service is no longer reachable from the model). The
     * shim is rebuilt against the new service so approval
     * goes through the right one.
     */
    setUserQuestions(service: UserQuestionService | undefined): void;
    /**
     * F17.2: change the permission mode. Rebuilds the
     * `sandboxPolicy` from the new mode + the agent's cwd. The
     * next tool call (e.g. `bash`) sees the new policy.
     *
     * **Note:** the session's `metadata.permissionMode` is
     * immutable (it's `readonly` per the Session contract). We
     * don't update the session — we just rebuild the local
     * `sandboxPolicy`. The session's metadata reflects the
     * mode at session start; the running policy reflects the
     * current mode.
     */
    setPermissionMode(mode: NonNullable<Session["metadata"]["permissionMode"]>): void;
    /**
     * F17.2 / protocol: change approval policy and wire the
     * ask handler (mirrors REPL `/approval`).
     */
    setApprovalPolicy(mode: import("./types.js").AskForApproval): void;
    /** Current approval policy label. */
    getApprovalPolicy(): import("./types.js").AskForApproval;
    /**
     * F-fix: the current effective permission mode (the live
     * policy, which `/sandbox` can change after session start).
     * Used by the REPL's `/init` to refuse writes in read-only
     * sessions.
     */
    getPermissionMode(): PermissionMode;
    /**
     * F17.2: clear the session transcript. The next turn starts
     * with a clean transcript; the agent's tools, hooks, and
     * AGENTS.md are preserved.
     */
    clearSession(): void;
    /**
     * F17.5: compact the session by dropping the oldest
     * messages, keeping the last `keep` messages. The system
     * message (if present) is always preserved at the
     * start of the session.
     *
     * **v0 limitation:** this is the "drop oldest" version
     * (truncation). A future chunk can add LLM-based
     * summarization (replace the dropped messages with a
     * summary block that the LLM generates).
     *
     * **Why public:** the REPL's `/compact` slash command
     * uses this when the transcript gets long. The host
     * (Tauri app) can also wire it to a manual button.
     */
    compact(keep: number): void;
    /**
     * Phase 8 / v2.1 — compact with LLM summarization (Codex
     * compaction parity). Drops the oldest messages (keeping the
     * last `keep` + the system message) and injects a summary of
     * the dropped messages as a system block, so the model keeps
     * the gist without the full history.
     *
     * **Why a summarizer callback (not a model call inside
     * Agent):** the Agent doesn't own the model call policy
     * (cost, prompts); the host decides. The REPL wires a
     * one-shot `getModel().complete(...)` call; a Tauri host can
     * inject a different summarizer.
     *
     * **No-op** when the session is shorter than `keep` (nothing
     * to summarize). The summary is inserted BEFORE the kept
     * messages so the model sees it as prior context.
     *
     * @param keep The number of most-recent messages to keep.
     * @param summarize Receives the dropped messages and returns
     *   a summary string (may be empty — then no block is added).
     */
    compactWithSummary(keep: number, summarize: (dropped: ReadonlyArray<import("./tools/index.js").Message>) => Promise<string>): Promise<void>;
    /**
     * Phase A / Item 1 (chunk 1.1) — compact the session by
     * TOKEN BUDGET. Drops the oldest messages until the total
     * token estimate fits `budget`. The token estimate is a
     * pure, hermetic function (`estimateMessageTokens` in
     * `src/context/budget.ts`); a real tokenizer can replace
     * it in a future chunk without changing this signature.
     *
     * **When to use:** long-running REPL sessions where tool
     * results can dominate the token budget. A count-based
     * compaction (`compact(keep)`) is a bad proxy for the real
     * budget.
     *
     * **No-op** when the session already fits. The system
     * message is always preserved.
     *
     * **Returns** the post-compaction token count + an
     * `overBudget` flag — `true` means the system message
     * alone exceeded the budget. The caller can escalate to
     * `compactWithSummary` in that case.
     *
     * @returns `{ totalTokensAfter, overBudget }` from the
     *   underlying math. `droppedCount` is also returned for
     *   parity with the other compact variants.
     */
    compactWithBudget(budget: number): {
        totalTokensAfter: number;
        overBudget: boolean;
        droppedCount: number;
    };
    /**
     * F17.5: rebuild the session with a new id. The current
     * session is replaced by a fresh `InMemorySession`; the
     * transcript is gone (start from scratch). The agent's
     * tools, hooks, model, and AGENTS.md are preserved.
     *
     * **Why public:** the REPL's `/new` command needs to start
     * a fresh session without rebuilding the whole agent
     * (the user might have set a custom model, sandbox, hooks).
     *
     * **Why a new id:** the session id is the audit-trail key.
     * A new id makes the boundary between "old session" and
     * "new session" explicit in logs.
     */
    newSession(): void;
    /**
     * F17.2: snapshot of the cost tracker's current totals.
     * Used by `/cost` to print accumulated spend + tokens.
     */
    getCost(): {
        costUsd: number;
        inputTokens: number;
        outputTokens: number;
    };
    /**
     * F17.2.5: the session id. Used by `/session` to print
     * the current session's id (useful for log correlation
     * + resume).
     */
    getSessionId(): string;
    /**
     * F14.3: read-only access to the underlying `Session`
     * (in-memory or persisted). Commands like `/export`
     * need the full transcript (id + metadata + messages),
     * which `getSessionId()`/`getMessageCount()` don't
     * provide. v0 reached into the private field via a
     * cast; this is the public seam.
     */
    getSession(): Session;
    /**
     * F14.1: set the session's display title. Persisted
     * implementations (`PersistedSession`) write through to
     * disk so the title survives a `--resume`.
     */
    setTitle(title: string): void;
    /**
     * F17.2.5: the message count of the current session.
     * Used by `/context` to print the transcript size.
     */
    getMessageCount(): number;
    /**
     * F17.2.5: snapshot of LSP servers registered with the
     * `lspManager` (when one is configured). Returns an
     * empty array when no `lspManager` is set.
     *
     * The shape is intentionally minimal: just the
     * language and rootUri per server. The 4 LSP tools
     * (lsp_definition, lsp_references, lsp_hover,
     * lsp_diagnostics) do the actual work; this is just
     * for the `/lsp` slash command.
     */
    getLspServers(): ReadonlyArray<{
        language: string;
        rootUri: string;
    }>;
    /**
     * F17.2.5: snapshot of registered hooks. Returns the
     * event name + handler count per event. Used by `/hooks`.
     */
    getHooks(): ReadonlyArray<{
        event: string;
        handlerCount: number;
    }>;
    /**
     * Run the agent loop with the given prompt. Returns the final
     * assistant content blocks and metadata about the run.
     *
     * **Side effects:** appends user / assistant / tool messages
     * to the session. Reads from the model and executes tools.
     * Fires PreToolUse and PostToolUse hooks.
     *
     * **Throws:** only on `maxIterations` exhaustion. All other
     * failures (tool errors, unknown tools, invalid args) become
     * `isError: true` tool results in the transcript.
     *
     * **T3.1:** the loop body was extracted to
     * `runAgentLoop` in `./agent/run-loop.ts` so
     * `agent.ts` can become a thin facade. The
     * behavior is identical; `runAgentLoop` reads
     * the agent's `@internal` state fields and
     * calls back into `this.emit` / `this.makeResult`.
     */
    run(prompt: string | ReadonlyArray<ContentBlock>): Promise<AgentResult>;
    /**
     * F10.6: emit a trace event, automatically tagging
     * it with `subagentOf` (when this agent is a
     * sub-agent). Centralizes the `subagentOf`
     * propagation so every emit call site can't
     * forget it.
     *
     * **Why a helper, not `...event, subagentOf` at
     * each call site:** 9 emit calls in this file.
     * A helper keeps the field consistent (one place
     * to change) and avoids the "I forgot to add
     * `subagentOf`" bug.
     *
     * **What the consumer sees:** every event from a
     * sub-agent carries `subagentOf: <parentSessionId>`.
     * The parent tracer can group/filter by
     * `subagentOf` without inferring from event
     * ordering. Existing consumers (F9.4
     * `JsonLinesTracer`, the CLI's `--json` flag)
     * ignore the field.
     *
     * @internal Used by `runAgentLoop` (T3.1) which lives
     * in a different file and can't access `private`
     * members. Public-with-internal is the minimum-
     * impact way to share the helper.
     */
    emit(event: import("./trace/index.js").TraceEvent): void;
    /**
     * Build an `AgentResult` populated with the loop's
     * metadata. Also emits the final `agent_end` trace
     * event (the last one a consumer sees before
     * stream flush).
     *
     * @internal Used by `runAgentLoop` (T3.1) which lives
     * in a different file and can't access `private`
     * members.
     */
    makeResult(content: ContentBlock[], stopReason: AgentResult["stopReason"], iterations: number): AgentResult;
}
/**
 * T3.1: `normalizeStopReason` was moved to
 * `./agent/run-loop.ts` (only the loop body
 * uses it; the Agent facade doesn't).
 */
//# sourceMappingURL=agent.d.ts.map