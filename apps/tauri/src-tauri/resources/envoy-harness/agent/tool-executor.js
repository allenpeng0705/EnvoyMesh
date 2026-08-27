// T3.12: import the constant rather than hardcoding
// the `"mcp__"` prefix literal in the routing check
// (the audit-pass #2 finding). If MCP_TOOL_PREFIX
// ever changes, the routing check stays in sync
// with the name-construction in run-loop.ts:115.
import { MCP_TOOL_PREFIX } from "../mcp/types.js";
export class ToolExecutor {
    ctx;
    constructor(ctx) {
        this.ctx = ctx;
    }
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
    async executeMany(calls, iteration) {
        if (calls.length === 0)
            return;
        // Sub-agent fan-out: parallel when ALL calls are
        // `task`. Other tools (bash, lsp_*, etc.) may
        // have order dependencies; they stay serial.
        const allTask = this.ctx.meshSubmitter !== undefined &&
            calls.every((c) => c.name === "task");
        if (allTask) {
            // Cap check: refuse ALL when exceeded.
            if (calls.length > this.ctx.maxSubagents) {
                for (const call of calls) {
                    this.appendToolResult(call.id, `maxSubagents reached: ${calls.length} task calls in one turn (cap is ${this.ctx.maxSubagents}). Refused.`, true);
                }
                return;
            }
            // Parallel run. Each sub-agent runs in its
            // own session; abort propagation is wired
            // via the submitter (F10.1.2).
            await Promise.all(calls.map((call) => this.execute(call, iteration)));
            return;
        }
        // Serial run (existing path). Used when:
        // - No meshSubmitter (no `task` tool at all)
        // - Mixed iteration (some `task` + some other
        //   tool that may have order dependencies)
        for (const call of calls) {
            if (this.ctx.abortSignal.aborted)
                break;
            await this.execute(call, iteration);
        }
    }
    /**
     * Run a single tool call. The 5-step flow is
     * documented at the top of this file.
     *
     * **Why this is a public method:** the parallel
     * fan-out path in `executeMany` calls it directly
     * (one per call). Tests in T3.1 may exercise it
     * in isolation.
     */
    async execute(call, iteration) {
        this.ctx.noteToolCall();
        const isMcpCall = call.name.startsWith(MCP_TOOL_PREFIX);
        // Malformed model call (empty tool name): some OpenAI-compatible
        // providers (MiniMax, local llama-server) omit the tool name in the
        // response while still sending the args. Recover by inferring the
        // name from the args when EXACTLY ONE registered tool validates
        // them. Otherwise refuse WITHOUT the permission hook — a host must
        // never see "Allow tool ``?" for a call that cannot execute.
        if (call.name.trim().length === 0) {
            const inferred = inferToolNameFromArgs(this.ctx.tools, call.args);
            if (inferred !== undefined) {
                call = { ...call, name: inferred };
            }
            else {
                this.ctx.emit({
                    kind: "tool_call",
                    ts: new Date().toISOString(),
                    iteration,
                    call,
                });
                // Diagnostic: include the args + registered tool names so the
                // model (and the user) can see exactly what failed and what the
                // executor compared against. This also lets the model correct
                // its next call instead of looping blindly.
                const message = `tool call missing a tool name (args: ${JSON.stringify(call.args)}; registered: ${this.ctx.tools
                    .list()
                    .map((t) => t.name)
                    .join(", ")})`;
                this.appendToolResult(call.id, message, true);
                this.ctx.emit({
                    kind: "tool_result",
                    ts: new Date().toISOString(),
                    iteration,
                    callId: call.id,
                    toolName: call.name,
                    result: { content: message, isError: true },
                    durationMs: 0,
                });
                return;
            }
        }
        const tool = this.ctx.tools.get(call.name);
        // Unknown tool (not an MCP-routed call): surface the error directly
        // instead of pausing on a permission prompt for a tool that cannot
        // execute. The trace still records the attempt + error.
        if (!tool && !isMcpCall) {
            this.ctx.emit({
                kind: "tool_call",
                ts: new Date().toISOString(),
                iteration,
                call,
            });
            this.appendToolResult(call.id, `unknown tool: ${call.name}`, true);
            this.ctx.emit({
                kind: "tool_result",
                ts: new Date().toISOString(),
                iteration,
                callId: call.id,
                toolName: call.name,
                result: { content: `unknown tool: ${call.name}`, isError: true },
                durationMs: 0,
            });
            return;
        }
        // PreToolUse hook (audit log, rate limit, block, ask).
        const preDecision = await this.firePreToolUse(call);
        if (preDecision.kind === "block") {
            this.ctx.emit({
                kind: "tool_call",
                ts: new Date().toISOString(),
                iteration,
                call,
            });
            this.appendToolResult(call.id, `blocked by PreToolUse: ${preDecision.reason}`, true);
            this.ctx.emit({
                kind: "tool_result",
                ts: new Date().toISOString(),
                iteration,
                callId: call.id,
                toolName: call.name,
                result: {
                    content: `blocked by PreToolUse: ${preDecision.reason}`,
                    isError: true,
                },
                durationMs: 0,
            });
            return;
        }
        // F9.1: per-call approval. The hook wants the host
        // to approve. We call the host's handler (if any)
        // and act on the decision. No handler → safe deny.
        if (preDecision.kind === "ask") {
            // Approval mode `never` fails closed regardless of any
            // host-installed askHandler.
            if (this.ctx.getApproval() === "never") {
                this.ctx.emit({
                    kind: "tool_call",
                    ts: new Date().toISOString(),
                    iteration,
                    call,
                });
                const denial = `denied: approval mode is 'never' (${preDecision.question})`;
                this.appendToolResult(call.id, denial, true);
                this.ctx.emit({
                    kind: "tool_result",
                    ts: new Date().toISOString(),
                    iteration,
                    callId: call.id,
                    toolName: call.name,
                    result: { content: denial, isError: true },
                    durationMs: 0,
                });
                return;
            }
            const askReq = {
                tool: call.name,
                args: call.args,
                question: preDecision.question,
                ...(preDecision.options ? { options: preDecision.options } : {}),
                signal: this.ctx.abortSignal,
            };
            const askHandler = this.ctx.getAskHandler();
            const decision = askHandler
                ? await askHandler(askReq)
                : { kind: "deny", reason: "no ask handler configured" };
            // Host may have cancelled while the permission dialog was open.
            if (this.ctx.abortSignal.aborted) {
                this.ctx.emit({
                    kind: "tool_call",
                    ts: new Date().toISOString(),
                    iteration,
                    call,
                });
                const denial = "denied: cancelled while awaiting approval";
                this.appendToolResult(call.id, denial, true);
                this.ctx.emit({
                    kind: "tool_result",
                    ts: new Date().toISOString(),
                    iteration,
                    callId: call.id,
                    toolName: call.name,
                    result: { content: denial, isError: true },
                    durationMs: 0,
                });
                return;
            }
            if (decision.kind === "deny") {
                this.ctx.emit({
                    kind: "tool_call",
                    ts: new Date().toISOString(),
                    iteration,
                    call,
                });
                const denial = `denied by user: ${decision.reason}`;
                this.appendToolResult(call.id, denial, true);
                this.ctx.emit({
                    kind: "tool_result",
                    ts: new Date().toISOString(),
                    iteration,
                    callId: call.id,
                    toolName: call.name,
                    result: { content: denial, isError: true },
                    durationMs: 0,
                });
                return;
            }
            if (decision.kind === "modify") {
                // Replace the args. We'll re-validate below
                // against the tool's zod schema.
                call = { ...call, args: decision.args };
            }
            // decision.kind === "allow" → fall through to
            // the tool runner.
        }
        // PreToolUse modify: the hook changed the tool call's args.
        // We re-validate against the tool's zod schema below.
        if (preDecision.kind === "modify") {
            call = { ...call, args: preDecision.modified };
        }
        // T3.3 + T3.12: MCP routing. When the call name
        // starts with MCP_TOOL_PREFIX AND the tool is not
        // registered in the ToolRegistry (the
        // `registerMcpTools` bridge), route to the matching
        // client directly. A registry-registered MCP tool
        // flows through the normal path so envoy's hooks,
        // arg validation, and permissions govern it.
        if (isMcpCall && tool === undefined) {
            await this.executeMcpCall(call, iteration);
            return;
        }
        // Both the unknown-tool and MCP branches returned above, so `tool`
        // is guaranteed defined here. TS cannot narrow the compound
        // conditions, so capture it once.
        const registeredTool = tool;
        // F9.4: emit tool_call (after the PreToolUse hook
        // passes but BEFORE arg validation). The model can
        // see the call in the next iteration; the trace
        // gets it now. Even if arg validation fails, the
        // trace records the attempt.
        this.ctx.emit({
            kind: "tool_call",
            ts: new Date().toISOString(),
            iteration,
            call,
        });
        // Arg validation. Re-runs for the `modify` case
        // (the host may have given us a different shape).
        const parsed = registeredTool.parameters.safeParse(call.args);
        if (!parsed.success) {
            this.appendToolResult(call.id, `invalid arguments: ${parsed.error.message}`, true);
            this.ctx.emit({
                kind: "tool_result",
                ts: new Date().toISOString(),
                iteration,
                callId: call.id,
                toolName: call.name,
                result: {
                    content: `invalid arguments: ${parsed.error.message}`,
                    isError: true,
                },
                durationMs: 0,
            });
            return;
        }
        // Execute. Errors are caught — the model needs to see them.
        let resultContent;
        let isError = false;
        // F9.4: track tool execution duration for the
        // tool_result event. The timer starts AFTER arg
        // validation (we don't want to count time spent
        // in the hook / validation; the trace is for
        // tool execution time).
        const toolStart = Date.now();
        try {
            const sandboxExecutor = this.ctx.getSandboxExecutor();
            const result = await registeredTool.execute(parsed.data, {
                cwd: this.ctx.cwd,
                session: this.ctx.session,
                abortSignal: this.ctx.abortSignal,
                // Pass the live policy so the bash tool enforces the
                // current mode, not the session-start mode.
                sandboxPolicy: this.ctx.getSandboxPolicy(),
                ...(this.ctx.getShellEnv !== undefined
                    ? { shellEnv: this.ctx.getShellEnv() }
                    : {}),
                ...(sandboxExecutor !== undefined ? { sandboxExecutor } : {}),
                ...(this.ctx.emitToolOutput !== undefined
                    ? {
                        onToolOutput: (stdout) => this.ctx.emitToolOutput({
                            toolName: call.name,
                            callId: call.id,
                            stdout,
                        }),
                    }
                    : {}),
                ...(this.ctx.recordUndo !== undefined
                    ? { recordUndo: this.ctx.recordUndo }
                    : {}),
            });
            resultContent = result.content;
            isError = result.isError ?? false;
        }
        catch (err) {
            resultContent = `tool execution error: ${err.message}`;
            isError = true;
        }
        // F9.4: emit tool_result (after execution, before
        // post-hook / transcript append). The duration
        // is the time spent in the tool's `execute`.
        const toolDurationMs = Date.now() - toolStart;
        this.ctx.emit({
            kind: "tool_result",
            ts: new Date().toISOString(),
            iteration,
            callId: call.id,
            toolName: call.name,
            result: { content: resultContent, ...(isError ? { isError } : {}) },
            durationMs: toolDurationMs,
        });
        // PostToolUse hook (modify the result, add context).
        const postDecision = await this.firePostToolUse(call, {
            content: resultContent,
            isError,
        });
        if (postDecision.kind === "modify") {
            // The hook returned a new result. We treat it as opaque
            // (the hook is the source of truth for the new shape).
            const m = postDecision.modified;
            if (m && typeof m === "object") {
                resultContent = m.content ?? resultContent;
                isError = m.isError ?? isError;
            }
            else {
                resultContent = postDecision.modified;
            }
        }
        this.appendToolResult(call.id, resultContent, isError);
    }
    appendToolResult(toolCallId, content, isError) {
        this.ctx.session.appendMessage("tool", [
            { type: "tool_result", toolCallId, content, isError },
        ]);
    }
    async firePreToolUse(call) {
        return this.ctx.hooks.fire("PreToolUse", {
            tool: call.name,
            args: call.args,
        });
    }
    async firePostToolUse(call, result) {
        return this.ctx.hooks.fire("PostToolUse", {
            tool: call.name,
            args: call.args,
            result,
        });
    }
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
    async executeMcpCall(call, iteration) {
        const { parseMcpToolName } = await import("../mcp/types.js");
        const parsed = parseMcpToolName(call.name);
        if (parsed === null) {
            this.appendToolResult(call.id, `invalid MCP tool name: ${call.name}`, true);
            return;
        }
        const registry = this.ctx.mcpClients;
        if (registry === undefined) {
            this.appendToolResult(call.id, `MCP server not registered: ${parsed.serverName} (no McpClientRegistry configured)`, true);
            return;
        }
        const client = registry.get(parsed.serverName);
        if (client === undefined) {
            this.appendToolResult(call.id, `MCP server not registered: ${parsed.serverName}`, true);
            return;
        }
        // F9.4: emit tool_call (the model sees the call
        // in its next turn; the trace records it).
        this.ctx.emit({
            kind: "tool_call",
            ts: new Date().toISOString(),
            iteration,
            call,
        });
        const toolStart = Date.now();
        let resultContent;
        let isError = false;
        try {
            const mcpResult = await client.callTool(parsed.toolName, call.args, this.ctx.emitToolOutput !== undefined
                ? {
                    onProgress: (text) => this.ctx.emitToolOutput({
                        toolName: call.name,
                        callId: call.id,
                        stdout: text,
                    }),
                }
                : undefined);
            resultContent = mcpResult.content;
            isError = mcpResult.isError ?? false;
        }
        catch (err) {
            resultContent = `MCP tool error: ${err.message}`;
            isError = true;
        }
        const toolDurationMs = Date.now() - toolStart;
        this.ctx.emit({
            kind: "tool_result",
            ts: new Date().toISOString(),
            iteration,
            callId: call.id,
            toolName: call.name,
            result: { content: resultContent, ...(isError ? { isError } : {}) },
            durationMs: toolDurationMs,
        });
        // PostToolUse hook (same as regular tools).
        const postDecision = await this.firePostToolUse(call, {
            content: resultContent,
            isError,
        });
        if (postDecision.kind === "modify") {
            const m = postDecision.modified;
            if (m && typeof m === "object") {
                resultContent = m.content ?? resultContent;
                isError = m.isError ?? isError;
            }
            else {
                resultContent = postDecision.modified;
            }
        }
        this.appendToolResult(call.id, resultContent, isError);
    }
}
/**
 * Recover a missing tool name by matching the args against the
 * registered tools' zod schemas. Returns the tool name only when EXACTLY
 * ONE tool validates — ambiguous matches stay unresolved (the caller
 * refuses the call) so we never guess wrong.
 */
export function inferToolNameFromArgs(tools, args) {
    // Key-based fallback: an args object carrying a tool-specific key is
    // unambiguous even if a future tool's schema also accepts it. This is
    // the pragmatic recovery for providers that drop the tool name.
    if (args !== null && typeof args === "object") {
        const record = args;
        if (typeof record.command === "string" && tools.has("bash")) {
            return "bash";
        }
        if (typeof record.path === "string" && tools.has("read_file")) {
            return "read_file";
        }
    }
    let match;
    let count = 0;
    for (const t of tools.list()) {
        const parsed = t.parameters.safeParse(args);
        // Require the schema to actually consume at least one argument key:
        // an all-optional schema (e.g. `suggest_follow_ups`) matches ANY
        // object after zod strips unknown keys, which would make inference
        // ambiguous for every call.
        const data = parsed.data;
        const consumedKeys = parsed.success &&
            data !== undefined &&
            typeof data === "object" &&
            Object.keys(data).length > 0;
        if (consumedKeys) {
            match = t.name;
            count += 1;
            if (count > 1)
                return undefined;
        }
    }
    return count === 1 ? match : undefined;
}
//# sourceMappingURL=tool-executor.js.map