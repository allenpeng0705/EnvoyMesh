/**
 * ToolExecutor — the per-tool-call execution seam
 * extracted from `agent.ts` in T2.3.
 *
 * **What it does (per design §3.4 step 5):**
 * 1. Fire `PreToolUse` hook; abort on `block`.
 * 2. If the hook returned `ask`, call the host's
 *    `askHandler`; on `deny` abort; on `modify`
 *    replace the args.
 * 3. Validate args against the tool's zod schema.
 * 4. Execute the tool. Catch errors → `isError: true`.
 * 5. Emit `tool_call` + `tool_result` trace events.
 * 6. Fire `PostToolUse` hook; honor `modify`.
 * 7. Append the `tool_result` to the session.
 *
 * **Why a separate class (T2.3 + T3.1 plan):** the
 * agent loop's `executeToolCall` is ~220 lines and
 * the only seam in the loop that needs to be
 * reachable from a mesh-side hook surface (the
 * F10.3+ RemoteMeshSubmitter runs the same flow
 * for sub-agents, but today the code is inlined
 * inside Agent). Extracting the class makes:
 * - the unit test surface smaller (a ToolExecutor
 *   can be tested in isolation with a fake context;
 *   today the test goes through Agent)
 * - the seam explicit (the host / mesh can replace
 *   or wrap the executor without forking Agent)
 * - T3.1's full `agent.ts` split (ToolExecutor +
 *   RunState + facade) easier — the executor
 *   already lives in its own file
 *
 * **Pure refactor:** no behavior change. The Agent
 * keeps the same public API; the private methods
 * are now on ToolExecutor and called via the
 * instance.
 */
import type { HookDecision } from "../hooks/index.js";
import type { Session } from "../session.js";
import type { ContentBlock, ToolRegistry } from "../tools/index.js";
import type { AskForApproval, AskHandler, SandboxPolicy } from "../types.js";
import type { SandboxExecutor } from "../sandbox/types.js";
import type { TraceEvent } from "../trace/index.js";
import type { MeshSubmitter } from "../subagent/index.js";
/**
 * The dependencies ToolExecutor reads from the
 * owning Agent. Held by reference (readonly); the
 * Agent mutates them in place (e.g. counters).
 *
 * **Why a context interface, not the Agent itself:**
 * passing `Agent` would create a circular import
 * and would let the executor reach into agent
 * internals it shouldn't (cost tracking, the
 * result builder, etc.). The context is the
 * narrowest possible seam.
 *
 * **Why some fields are getter functions, not values:**
 * `sandboxPolicy`, `approval`, and `askHandler` can
 * change at runtime (the REPL's `/sandbox`,
 * `/approval`, and a future `/askHandler` slash
 * command). The context holds getter functions
 * so the executor always reads the LIVE value,
 * not a stale snapshot from construction time.
 * The other fields are set once and don't change
 * during the agent's lifetime.
 */
export interface ToolExecutorContext {
    /** The hook registry. Pre/PostToolUse fire here. */
    readonly hooks: {
        fire(event: "PreToolUse", payload: unknown): Promise<HookDecision>;
        fire(event: "PostToolUse", payload: unknown): Promise<HookDecision>;
    };
    /** The tool registry. The executor looks up tools by name. */
    readonly tools: ToolRegistry;
    /** The session. The executor appends `tool_result` messages. */
    readonly session: Session;
    /** The cwd. Passed to the tool's `ToolContext`. */
    readonly cwd: string;
    /**
     * The live sandbox policy. Read at call time so
     * `/sandbox workspace-write` takes effect on the
     * next tool call (not "next agent construction").
     * The bash tool reads this.
     */
    readonly getSandboxPolicy: () => SandboxPolicy;
    /**
     * Phase F: live OS sandbox executor. Read at call
     * time so a host can swap backends without
     * reconstructing the agent. Bash uses this after
     * the 6 validators.
     */
    readonly getSandboxExecutor: () => SandboxExecutor | undefined;
    /**
     * The live ask handler. Read at call time so a
     * future host swap takes effect on the next ask.
     * For F9.1 per-call approval.
     */
    readonly getAskHandler: () => AskHandler | undefined;
    /**
     * The live approval mode. Read at call time so
     * `/approval never` takes effect on the next
     * tool call. `"never"` fails closed.
     */
    readonly getApproval: () => AskForApproval;
    /**
     * Env map for bash/job spawns (after shell_environment_policy).
     * When omitted, tools fall back to process.env.
     */
    readonly getShellEnv?: () => Record<string, string>;
    /** Abort signal. The executor breaks out of the loop when aborted. */
    readonly abortSignal: AbortSignal;
    /** F10.2: cap on parallel sub-agent calls per turn. */
    readonly maxSubagents: number;
    /** F10.1: the mesh submitter. Drives the parallel-fan-out detection. */
    readonly meshSubmitter: MeshSubmitter | undefined;
    /**
     * T3.3: the MCP client registry. When a tool call's
     * name starts with `mcp__`, the executor routes it
     * to the matching client (parsed via
     * `parseMcpToolName`). When undefined, `mcp__*`
     * calls fail with "unknown tool" (the same as a
     * missing built-in tool).
     */
    readonly mcpClients: import("../mcp/index.js").McpClientRegistry | undefined;
    /**
     * Emit a trace event. The Agent's `emit` wraps the
     * tracer with the `subagentOf` tag; the executor
     * just calls back into the owner.
     */
    emit(event: TraceEvent): void;
    /**
     * Increment the per-`run` tool-call counter on the
     * owning Agent. Called once per `execute()`. The
     * counter is read by `Agent.makeResult` to populate
     * `AgentResult.toolCalls`.
     */
    noteToolCall(): void;
    /**
     * Forward live tool stdout to the protocol host (bash streaming).
     */
    emitToolOutput?: (info: {
        toolName: string;
        callId: string;
        stdout: string;
    }) => void;
    /** Record write/edit changes for `/undo`. */
    recordUndo?: (entry: {
        path: string;
        previousContent: string | null;
    }) => void;
}
export declare class ToolExecutor {
    private readonly ctx;
    constructor(ctx: ToolExecutorContext);
    /**
     * Run a batch of tool calls. When ALL calls are
     * `task` (sub-agents) and a `meshSubmitter` is
     * configured, runs them in parallel; otherwise
     * runs them serially (so a `bash` call that
     * depends on a prior `task` result still works).
     *
     * **Cap:** when parallel + count > `maxSubagents`,
     * refuses ALL (every call gets an `isError: true`
     * result explaining the cap).
     *
     * **Abort:** the serial path checks `abortSignal`
     * between calls (Promise.all cannot interrupt).
     */
    executeMany(calls: ReadonlyArray<Extract<ContentBlock, {
        type: "tool_call";
    }>>, iteration: number): Promise<void>;
    /**
     * Run a single tool call. The 5-step flow is
     * documented at the top of this file.
     *
     * **Why this is a public method:** the parallel
     * fan-out path in `executeMany` calls it directly
     * (one per call). Tests in T3.1 may exercise it
     * in isolation.
     */
    execute(call: Extract<ContentBlock, {
        type: "tool_call";
    }>, iteration: number): Promise<void>;
    private appendToolResult;
    private firePreToolUse;
    private firePostToolUse;
    /**
     * T3.3: route a single `mcp__*` tool call to the
     * matching client. Mirrors the regular `execute`
     * flow (PreToolUse already fired; PostToolUse +
     * tool_result append happen here; trace events
     * emitted). The MCP client owns the actual JSON-
     * RPC call.
     *
     * **Why in ToolExecutor, not in the ToolRegistry:**
     * MCP tools don't fit the `Tool` interface (no
     * `parameters` zod schema, no `costUsd`, the
     * execute call is async JSON-RPC over a child
     * process). A dedicated branch in the executor
     * is simpler than a fake `Tool` shim.
     */
    private executeMcpCall;
}
/**
 * Recover a missing tool name by matching the args against the
 * registered tools' zod schemas. Returns the tool name only when EXACTLY
 * ONE tool validates — ambiguous matches stay unresolved (the caller
 * refuses the call) so we never guess wrong.
 */
export declare function inferToolNameFromArgs(tools: ToolRegistry, args: unknown): string | undefined;
//# sourceMappingURL=tool-executor.d.ts.map