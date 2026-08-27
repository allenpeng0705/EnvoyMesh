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
import { HookRegistry, } from "./hooks/index.js";
import { ActionJournal } from "./action-journal.js";
import { InMemorySession, newSessionId } from "./session.js";
import { CostTracker } from "./cost.js";
import { applyShellEnvironmentPolicy } from "./config/shell-env.js";
import { policyFromMode } from "./permissions/policy.js";
import { resolveSandboxExecutor } from "./sandbox/resolve.js";
import { makeLspTools } from "./lsp/tools.js";
import { NullTracer } from "./trace/null-tracer.js";
import { makeTaskTool } from "./subagent/tools.js";
import { ToolExecutor } from "./agent/tool-executor.js";
import { runAgentLoop } from "./agent/run-loop.js";
import { compactMessages, compactMessagesBudget, compactMessagesWithSummary, } from "./agent/compact.js";
import { createAskForApprovalShim, } from "./interaction/ask-for-approval-shim.js";
import { makeAskUserTool } from "./interaction/ask-user-tool.js";
import { makeSuggestFollowUpsTool } from "./interaction/suggest-follow-ups-tool.js";
import { emptyTurnHints, hasTurnHints, mergeTurnHints, } from "./interaction/turn-hints.js";
import { makeEnterPlanModeTool, makeExitPlanModeTool, } from "./plan/mode-tools.js";
/** Default max iterations before the agent throws. */
export const DEFAULT_MAX_ITERATIONS = 50;
/** F10.2: default cap on sub-agents per turn.
 *  Picked to be generous (the model rarely needs
 *  more than 3-4 sub-agents in one turn) while
 *  still bounding cost. The host can lower this
 *  for production. */
export const DEFAULT_MAX_SUBAGENTS = 8;
export class Agent {
    // T3.1: the state fields are now public (with @internal
    // JSDoc) so the extracted `runAgentLoop` function in
    // `run-loop.ts` can read them. The Agent's PUBLIC API
    // is the set of `getX` / `setX` / `run` methods; consumers
    // should never reach into these fields directly. The
    // @internal tag tells API extractors (and humans) that
    // these are package-internal and may change without a
    // semver bump.
    /** @internal */
    model;
    /** @internal */
    tools;
    /** @internal */
    session;
    /** @internal */
    hooks;
    /** @internal */
    cwd;
    /** @internal */
    maxIterations;
    /** @internal */
    abortController;
    /** @internal */
    systemPrompt;
    /** @internal */
    toolCallCount = 0;
    /** @internal Effective sandbox policy, derived from the session. The verifier reads this. */
    sandboxPolicy;
    /**
     * @internal Phase F: optional host-supplied OS sandbox
     * executor. When undefined, `getSandboxExecutor` resolves
     * from policy + platform.
     */
    sandboxExecutor;
    /** @internal Cost tracker; populated across the run. F7.1. */
    costTracker;
    /** @internal F7.5: cost ceiling; when exceeded, the agent aborts. */
    maxCostUsd;
    /** @internal F9.1: per-call approval handler. */
    askHandler;
    /** @internal F9.2: LSP manager (when provided, the 4 LSP tools are registered). */
    lspManager;
    /** @internal F9.4: tracer. Always non-null (defaults to NullTracer). */
    tracer;
    /** @internal F10.1: mesh submitter. When set, the `task` tool
     *  is auto-registered in the constructor. */
    meshSubmitter;
    /** @internal F10.4.1: fan-out registry. When set, the `task`
     *  tool consults it on every call. */
    fanOutRegistry;
    /**
     * T3.3: MCP client registry. When set, the
     * `mcp__<server>__<tool>` calls in the model's
     * response are routed to the matching client.
     * The host injects the registry via
     * `AgentOptions.mcpClients`; the stdio transport
     * (which would populate it from the TOML config)
     * lands in a follow-up sub-chunk.
     */
    mcpClients;
    /** @internal Phase C: dispose background jobs on abort. */
    jobRegistry;
    /** @internal Phase C: close owned terminals on abort. */
    terminalService;
    /** @internal Per-turn memory index injection. */
    memoryStore;
    /** @internal Per-turn skill catalog injection. */
    skills;
    /** @internal Digest of last injected skill catalog (KV-cache stable). */
    skillCatalogDigest;
    /** @internal Shell env policy for bash/jobs. */
    shellEnvironmentPolicy;
    /** @internal F10.2: max sub-agents per turn. */
    maxSubagents;
    /** @internal F10.6: parent session id (when this is a
     *  sub-agent). Every `TraceEvent.emit` includes
     *  this as `subagentOf` so the parent tracer can
     *  attribute events without consumer-side
     *  inference. Undefined for the root agent. */
    subagentOf;
    /**
     * @internal Phase B / Item 3.1: capability-module
     * registry. When set, the agent exposes a
     * `CapabilityContext` to the registry (so plugins can
     * register hooks / tools on this agent). The host
     * owns the registry's lifetime; the agent is just
     * a consumer.
     */
    plugins;
    /** @internal F-fix: approval policy. Defaults to `on-request`. */
    approval;
    /**
     * @internal Phase A / Item 5: the user-question service.
     * When set, the agent exposes the `ask_user` tool and
     * (when no explicit `askHandler` is configured) routes
     * approval asks through the same service. The setter
     * `setUserQuestions` lets hosts (e.g. the REPL) install
     * the service after construction; the tool is
     * registered / unregistered on the tool registry.
     */
    userQuestions;
    /**
     * @internal Protocol / TUI: assistant token sink for the
     * current `run()` turn. Set by `createAgentSessionBackend`
     * during `prompt`; cleared in `finally`.
     */
    assistantStreamSink;
    /**
     * @internal Protocol / TUI: live tool stdout sink for the
     * current `run()` turn. Set by `createAgentSessionBackend`
     * during `prompt`; cleared in `finally`.
     */
    toolOutputSink;
    /** @internal Write/edit journal for `/undo`. */
    actionJournal;
    /** @internal Follow-ups / deferrals collected during the current `run()`. */
    turnHints = emptyTurnHints();
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
    askHandlerIsShim;
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
    executor;
    constructor(options) {
        this.model = options.model;
        this.tools = options.tools;
        this.session = options.session;
        this.hooks = options.hooks ?? new HookRegistry();
        this.cwd = options.cwd ?? process.cwd();
        this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        this.maxCostUsd =
            options.maxCostUsd !== undefined && options.maxCostUsd > 0
                ? options.maxCostUsd
                : undefined;
        this.askHandler = options.askHandler;
        // Phase A / Item 5 (self-review): the shim is NOT
        // installed at this point — the explicit handler
        // wins by default. The shim is installed below
        // (in the `userQuestions` block) when both
        // `userQuestions` is set AND no explicit `askHandler`
        // was provided.
        this.askHandlerIsShim = false;
        this.lspManager = options.lspManager;
        this.tracer = options.tracer ?? new NullTracer();
        this.meshSubmitter = options.meshSubmitter;
        this.fanOutRegistry = options.fanOutRegistry;
        this.mcpClients = options.mcpClients;
        this.jobRegistry = options.jobRegistry;
        this.terminalService = options.terminalService;
        this.memoryStore = options.memoryStore;
        this.skills = options.skills;
        this.skillCatalogDigest = undefined;
        this.shellEnvironmentPolicy = options.shellEnvironmentPolicy;
        this.maxSubagents = options.maxSubagents ?? DEFAULT_MAX_SUBAGENTS;
        this.subagentOf = options.subagentOf;
        this.approval = options.approval ?? "on-request";
        this.userQuestions = options.userQuestions;
        this.plugins = options.plugins;
        this.assistantStreamSink = undefined;
        this.toolOutputSink = undefined;
        this.actionJournal = new ActionJournal();
        this.turnHints = emptyTurnHints();
        this.tools.register(makeSuggestFollowUpsTool({
            record: (hints) => this.recordTurnHints(hints),
        }));
        // F9.2: register the 4 LSP tools when the host provides
        // a manager. We do this AFTER the constructor sets
        // `this.tools` so the registry is available.
        if (this.lspManager) {
            for (const tool of makeLspTools(this.lspManager)) {
                this.tools.register(tool);
            }
        }
        // Phase A / Item 5: register the `ask_user` tool when
        // the host provides a UserQuestionService. Without
        // the service, the model never sees the tool (opt-in,
        // same pattern as `task` + LSP). The tool closes
        // over the service; `setUserQuestions(s)` replaces
        // it with a fresh closure over the new service.
        if (this.userQuestions) {
            this.tools.register(makeAskUserTool({ service: this.userQuestions }));
            this.tools.register(makeEnterPlanModeTool({ userQuestions: this.userQuestions }));
            this.tools.register(makeExitPlanModeTool({ userQuestions: this.userQuestions }));
            // When the host did NOT provide an explicit
            // `askHandler`, install a shim that delegates to
            // the same service. The shim is a `AskHandler`
            // (F9.1) that translates the AskRequest into a
            // UserQuestionRequest and the answer back into
            // an AskDecision. Host-supplied handlers always
            // win (they take precedence over the shim).
            if (this.askHandler === undefined) {
                this.askHandler = createAskForApprovalShim({
                    service: this.userQuestions,
                });
                this.askHandlerIsShim = true;
            }
        }
        // F10.1: register the `task` tool when the host
        // provides a MeshSubmitter. Without one, the
        // model never sees the tool (opt-in).
        if (this.meshSubmitter) {
            // F10.5: cost aggregation callback. When the
            // task tool returns a SubagentResult (single
            // or fan-out aggregated), the parent adds the
            // result's costUsd to its own CostTracker. The
            // callback is wired through the tool to keep
            // the tool ignorant of the parent's tracker.
            const onSubagentComplete = (result) => {
                if (result.costUsd > 0) {
                    this.costTracker.addSubagentCost(result.costUsd);
                }
                // F-fix: sub-agent costs count toward the parent's cap.
                // The cap check normally runs after model calls; this is
                // the only point where sub-agent costs enter the tracker.
                if (this.maxCostUsd !== undefined) {
                    const total = this.costTracker.total();
                    if (total.costUsd > this.maxCostUsd) {
                        this.abortController.abort(`max-cost-usd exceeded (incl. sub-agent costs): $${total.costUsd.toFixed(4)} > $${this.maxCostUsd}`);
                    }
                }
            };
            this.tools.register(makeTaskTool({
                submitter: this.meshSubmitter,
                ...(this.fanOutRegistry ? { fanOutRegistry: this.fanOutRegistry } : {}),
                onSubagentComplete,
                maxSubagents: this.maxSubagents,
            }));
        }
        if (options.abortSignal) {
            // Wrap caller-provided signal so we can also fire on
            // internal errors without leaking listeners.
            this.abortController = new AbortController();
            if (options.abortSignal.aborted) {
                this.abortController.abort(options.abortSignal.reason);
            }
            else {
                options.abortSignal.addEventListener("abort", () => this.abortController.abort(options.abortSignal.reason), { once: true });
            }
        }
        else {
            this.abortController = new AbortController();
        }
        this.systemPrompt = options.systemPrompt;
        // Host-supplied ConfigLayer policy wins; otherwise derive from
        // session permission mode (bash uses this via ToolContext).
        this.sandboxPolicy =
            options.sandboxPolicy ??
                policyFromMode(this.session.metadata.permissionMode ?? "read-only", this.cwd);
        this.sandboxExecutor = options.sandboxExecutor;
        // Cost tracker. v0 defaults to "local" (which has $0 pricing);
        // F7.2+ adapters set the model name in their ModelResponse, so
        // cost is attributed per-response rather than per-construction.
        this.costTracker = new CostTracker({ model: "local" });
        // T2.3: build the ToolExecutor. The context captures
        // live references to the agent's state; methods on the
        // executor (executeMany, execute) read them at call
        // time, not construction time. `noteToolCall` is a
        // closure that bumps the per-run counter.
        this.executor = new ToolExecutor(this.buildExecutorContext());
    }
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
    buildExecutorContext() {
        return {
            hooks: this.hooks,
            tools: this.tools,
            session: this.session,
            cwd: this.cwd,
            getSandboxPolicy: () => this.sandboxPolicy,
            getSandboxExecutor: () => this.sandboxExecutor ??
                resolveSandboxExecutor({ policy: this.sandboxPolicy }),
            getAskHandler: () => this.askHandler,
            getApproval: () => this.approval,
            getShellEnv: () => applyShellEnvironmentPolicy(this.shellEnvironmentPolicy),
            abortSignal: this.abortController.signal,
            maxSubagents: this.maxSubagents,
            meshSubmitter: this.meshSubmitter,
            mcpClients: this.mcpClients,
            // The agent's `emit` wraps the tracer with the
            // `subagentOf` tag. We pass the bound method
            // so the executor doesn't have to know about
            // sub-agent state.
            emit: (event) => this.emit(event),
            // Counter increment as a closure so the
            // executor never has to touch `this.toolCallCount`
            // directly.
            noteToolCall: () => {
                this.toolCallCount++;
            },
            emitToolOutput: (info) => {
                this.toolOutputSink?.(info);
            },
            recordUndo: (entry) => {
                this.actionJournal.push(entry);
            },
        };
    }
    /** The AbortSignal tools see in their context. */
    get abortSignal() {
        return this.abortController.signal;
    }
    /** Whether `/undo` can restore the last write/edit. */
    canUndo() {
        return this.actionJournal.canUndo();
    }
    /** Restore the last journaled write or edit. */
    async undoLastFileChange() {
        return this.actionJournal.undoLast();
    }
    /** Clear follow-up hints at the start of each `run()`. */
    clearTurnHints() {
        this.turnHints = emptyTurnHints();
    }
    /** Merge hints from `suggest_follow_ups` tool calls. */
    recordTurnHints(partial) {
        this.turnHints = mergeTurnHints(this.turnHints, partial);
    }
    /**
     * Abort the agent. The current iteration finishes (we don't
     * interrupt in-flight model calls), but the loop exits before
     * the next one starts. Tools in flight see their `abortSignal`
     * fire.
     */
    abort(reason) {
        this.abortController.abort(reason);
        const owner = this.session.id;
        if (this.jobRegistry !== undefined) {
            void this.jobRegistry.disposeOwner(owner);
        }
        if (this.terminalService !== undefined) {
            for (const snap of this.terminalService.list(owner)) {
                void this.terminalService
                    .kill(owner, snap.sessionId, "session aborted")
                    .catch(() => undefined);
            }
        }
    }
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
    setModel(model) {
        this.model = model;
    }
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
    getModel() {
        return this.model;
    }
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
    getMeshSubmitter() {
        return this.meshSubmitter;
    }
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
    setAskHandler(handler) {
        this.askHandler = handler;
        if (handler !== undefined) {
            // Explicit handler — host owns it. The shim
            // is no longer active.
            this.askHandlerIsShim = false;
            return;
        }
        // `handler === undefined` — restore the default.
        if (this.userQuestions !== undefined) {
            // A service is registered; the default IS the
            // shim. Install a fresh one.
            this.askHandler = createAskForApprovalShim({
                service: this.userQuestions,
            });
            this.askHandlerIsShim = true;
        }
        else {
            // No service; the default is deny. Stay
            // `undefined`; clear the shim flag.
            this.askHandlerIsShim = false;
        }
    }
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
    setUserQuestions(service) {
        this.userQuestions = service;
        // Replace the tool. The ToolRegistry throws on
        // duplicate names; unregister the old one first
        // (idempotent — `false` when no tool was
        // registered).
        this.tools.unregister("ask_user");
        this.tools.unregister("enter_plan_mode");
        this.tools.unregister("exit_plan_mode");
        if (service) {
            this.tools.register(makeAskUserTool({ service }));
            this.tools.register(makeEnterPlanModeTool({ userQuestions: service }));
            this.tools.register(makeExitPlanModeTool({ userQuestions: service }));
        }
        // Replace the shim if (a) the current askHandler
        // is the previously-installed shim OR (b) no
        // askHandler is set at all. In both cases, the
        // new shim is the "default" — install it. An
        // EXPLICIT askHandler always wins (no shim
        // install).
        const shimIsCurrent = this.askHandlerIsShim || this.askHandler === undefined;
        if (service && shimIsCurrent) {
            this.askHandler = createAskForApprovalShim({ service });
            this.askHandlerIsShim = true;
        }
        else if (service === undefined && this.askHandlerIsShim) {
            // Unregister: clear the shim. If an explicit
            // handler was set, leave it alone — the host
            // owns the lifecycle.
            this.askHandler = undefined;
            this.askHandlerIsShim = false;
        }
    }
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
    setPermissionMode(mode) {
        this.sandboxPolicy = policyFromMode(mode, this.cwd);
    }
    /**
     * F17.2 / protocol: change approval policy and wire the
     * ask handler (mirrors REPL `/approval`).
     */
    setApprovalPolicy(mode) {
        this.approval = mode;
        if (mode === "never") {
            this.setAskHandler(async () => ({
                kind: "deny",
                reason: "approval mode is 'never'",
            }));
        }
        else {
            this.setAskHandler(undefined);
        }
    }
    /** Current approval policy label. */
    getApprovalPolicy() {
        return this.approval;
    }
    /**
     * F-fix: the current effective permission mode (the live
     * policy, which `/sandbox` can change after session start).
     * Used by the REPL's `/init` to refuse writes in read-only
     * sessions.
     */
    getPermissionMode() {
        return this.sandboxPolicy.mode;
    }
    /**
     * F17.2: clear the session transcript. The next turn starts
     * with a clean transcript; the agent's tools, hooks, and
     * AGENTS.md are preserved.
     */
    clearSession() {
        this.session.clear();
    }
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
    compact(keep) {
        const next = compactMessages(this.session.messages, keep);
        // No-op when there was nothing to drop (the function returns
        // the same transcript unchanged).
        if (next.length === this.session.messages.length)
            return;
        // Clear + re-append.
        this.session.clear();
        for (const m of next) {
            this.session.appendMessage(m.role, m.content);
        }
    }
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
    async compactWithSummary(keep, summarize) {
        const { messages: next, droppedCount } = await compactMessagesWithSummary(this.session.messages, keep, summarize);
        // No-op when there was nothing to drop (the function returns
        // the same transcript unchanged). Note: message COUNT is not a
        // reliable no-op signal — a one-for-one summary insertion keeps
        // the count equal while changing content.
        if (droppedCount === 0)
            return;
        this.session.clear();
        for (const m of next) {
            this.session.appendMessage(m.role, m.content);
        }
    }
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
    compactWithBudget(budget) {
        const { messages: next, totalTokensAfter, overBudget, droppedCount } = compactMessagesBudget(this.session.messages, budget);
        if (droppedCount === 0) {
            return { totalTokensAfter, overBudget, droppedCount };
        }
        this.session.clear();
        for (const m of next) {
            this.session.appendMessage(m.role, m.content);
        }
        return { totalTokensAfter, overBudget, droppedCount };
    }
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
    newSession() {
        this.session = new InMemorySession(newSessionId(), {
            cwd: this.cwd,
            // Preserve the LIVE policy mode (the `/sandbox` command may
            // have changed it after session start).
            permissionMode: this.sandboxPolicy.mode,
            startedAt: new Date().toISOString(),
            title: "repl",
        });
    }
    /**
     * F17.2: snapshot of the cost tracker's current totals.
     * Used by `/cost` to print accumulated spend + tokens.
     */
    getCost() {
        return this.costTracker.total();
    }
    /**
     * F17.2.5: the session id. Used by `/session` to print
     * the current session's id (useful for log correlation
     * + resume).
     */
    getSessionId() {
        return this.session.id;
    }
    /**
     * F14.3: read-only access to the underlying `Session`
     * (in-memory or persisted). Commands like `/export`
     * need the full transcript (id + metadata + messages),
     * which `getSessionId()`/`getMessageCount()` don't
     * provide. v0 reached into the private field via a
     * cast; this is the public seam.
     */
    getSession() {
        return this.session;
    }
    /**
     * F14.1: set the session's display title. Persisted
     * implementations (`PersistedSession`) write through to
     * disk so the title survives a `--resume`.
     */
    setTitle(title) {
        this.session.setTitle(title);
    }
    /**
     * F17.2.5: the message count of the current session.
     * Used by `/context` to print the transcript size.
     */
    getMessageCount() {
        return this.session.messages.length;
    }
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
    getLspServers() {
        if (!this.lspManager)
            return [];
        return this.lspManager.listServers();
    }
    /**
     * F17.2.5: snapshot of registered hooks. Returns the
     * event name + handler count per event. Used by `/hooks`.
     */
    getHooks() {
        return this.hooks.list();
    }
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
    async run(prompt) {
        return runAgentLoop(this, prompt);
    }
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
    emit(event) {
        if (this.subagentOf !== undefined) {
            this.tracer.emit({ ...event, subagentOf: this.subagentOf });
        }
        else {
            this.tracer.emit(event);
        }
    }
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
    makeResult(content, stopReason, iterations) {
        const cost = this.costTracker.total();
        // F9.4: emit agent_end. This is the last event
        // the tracer sees; consumers (e.g. the CLI's
        // --json flag) can use it to flush.
        this.emit({
            kind: "agent_end",
            ts: new Date().toISOString(),
            stopReason,
            iterations,
            toolCalls: this.toolCallCount,
            metrics: {
                inputTokens: cost.inputTokens,
                outputTokens: cost.outputTokens,
                costUsd: cost.costUsd,
            },
            ...(hasTurnHints(this.turnHints) ? { turnHints: this.turnHints } : {}),
        });
        return {
            content,
            stopReason,
            iterations,
            toolCalls: this.toolCallCount,
            messages: this.session.messages,
            sandboxPolicy: this.sandboxPolicy,
            metrics: {
                inputTokens: cost.inputTokens,
                outputTokens: cost.outputTokens,
                costUsd: cost.costUsd,
            },
            ...(hasTurnHints(this.turnHints) ? { turnHints: this.turnHints } : {}),
        };
    }
}
/**
 * T3.1: `normalizeStopReason` was moved to
 * `./agent/run-loop.ts` (only the loop body
 * uses it; the Agent facade doesn't).
 */
//# sourceMappingURL=agent.js.map