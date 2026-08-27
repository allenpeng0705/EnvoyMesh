import { MCP_TOOL_PREFIX } from "../mcp/types.js";
import { injectEphemeralUserContext } from "../context/ephemeral-user-context.js";
import { assembleTurnContext } from "../context/turn-context.js";
import { stripThinking } from "../util/strip-thinking.js";
/**
 * Run the agent's turn loop. Reads from the
 * agent's public state (model, tools, session,
 * hooks, executor, etc.) and calls back into
 * `agent.emit` and `agent.makeResult` for the
 * trace + result builder.
 *
 * **Why take `agent` as an argument, not a
 * snapshot:** the loop reads live state on every
 * iteration (the REPL can swap the model via
 * `/model`; `/sandbox` mutates the policy; the
 * hooks registry can be replaced). A snapshot
 * would freeze the loop on construction.
 *
 * @param agent the owning Agent (public surface
 *             only; the loop calls `agent.emit`,
 *             `agent.makeResult`, `agent.executor`,
 *             etc.)
 * @param prompt the user's prompt for this turn (text or content blocks)
 */
export async function runAgentLoop(agent, prompt) {
    // System prompt goes first (idempotent: skip if a system
    // message is already present).
    if (agent.systemPrompt !== undefined &&
        !agent.session.messages.some((m) => m.role === "system")) {
        agent.session.appendMessage("system", [
            { type: "text", text: agent.systemPrompt },
        ]);
    }
    // DeepSeek/Codex: inject skill catalog + memory index + plan
    // as a user-role fragment before the actual user prompt.
    const plan = typeof agent.session.getPlan === "function"
        ? agent.session.getPlan()
        : undefined;
    const turnCtx = await assembleTurnContext({
        cwd: agent.cwd,
        signal: agent.abortSignal,
        ...(agent.memoryStore !== undefined
            ? { memoryStore: agent.memoryStore }
            : {}),
        ...(agent.skills !== undefined ? { skills: agent.skills } : {}),
        ...(agent.skillCatalogDigest !== undefined
            ? { skillCatalogDigest: agent.skillCatalogDigest }
            : {}),
        ...(plan !== undefined ? { plan } : {}),
    });
    agent.skillCatalogDigest = turnCtx.skillCatalogDigest;
    // Do not persist turn context (skills / memory index / plan) — it is
    // model-only and would show up as a phantom user bubble above the real
    // human message in EH chat UIs.
    if (typeof prompt === "string") {
        agent.session.appendMessage("user", [{ type: "text", text: prompt }]);
    }
    else {
        agent.session.appendMessage("user", [...prompt]);
    }
    agent.clearTurnHints();
    // F9.4: emit agent_start. The model name is the best
    // guess we have (the agent doesn't know which model
    // the adapter will use until the first call returns
    // `usage.model`; for v0 we read it from the cost
    // tracker after each response — the start event uses
    // a placeholder "unknown" if unset).
    agent.emit({
        kind: "agent_start",
        ts: new Date().toISOString(),
        sessionId: agent.session.id,
        model: agent.costTracker.currentModel,
        cwd: agent.cwd,
        tools: agent.tools.list().map((t) => t.name),
    });
    // T3.3: collect MCP tools (if any) for the model.
    // Each MCP tool appears in the model's tool list
    // as `mcp__<server>__<tool>`. The ToolExecutor
    // routes calls to these names back to the right
    // client. The `execute` here is a stub that
    // should never be called (the executor's
    // `executeMcpCall` branch fires first for any
    // name starting with `mcp__`); it exists only
    // to satisfy the `Tool` interface contract.
    const mcpTools = agent.mcpClients
        ? await agent.mcpClients.collectTools()
        : [];
    // Dedup: a tool registered in the ToolRegistry via the
    // `registerMcpTools` bridge is already in the model's tool list
    // (and governed by hooks/permissions); don't expose it twice.
    const registryToolNames = new Set(agent.tools.list().map((t) => t.name));
    const mcpToolDefinitions = mcpTools.map((t) => ({
        name: `${MCP_TOOL_PREFIX}${t.serverName}__${t.name}`,
        description: t.description,
        parameters: t.inputSchema,
        execute: async () => {
            throw new Error(`MCP tool ${t.serverName}/${t.name}: execute() was called directly; the ToolExecutor should have routed this call.`);
        },
    })).filter((def) => !registryToolNames.has(def.name));
    let iterations = 0;
    // Self-healing: track how many consecutive times the model attempted
    // the SAME failing tool call, so the loop can inject a corrective
    // message and break an error spiral (weak providers often repeat a
    // nameless/malformed call instead of adapting).
    const toolFailureCounts = new Map();
    let emptyResponseHinted = false;
    let turnContextInjected = false;
    while (iterations < agent.maxIterations) {
        if (agent.abortController.signal.aborted) {
            return agent.makeResult([], "aborted", iterations);
        }
        iterations++;
        // 1. Call the model.
        let response;
        try {
            const messagesForModel = !turnContextInjected && turnCtx.text.length > 0
                ? injectEphemeralUserContext(agent.session.messages, turnCtx.text)
                : agent.session.messages;
            if (!turnContextInjected)
                turnContextInjected = true;
            response = await agent.model.complete({
                messages: messagesForModel,
                tools: [...agent.tools.list(), ...mcpToolDefinitions],
                signal: agent.abortController.signal,
                ...(agent.assistantStreamSink !== undefined
                    ? { onTextDelta: agent.assistantStreamSink }
                    : {}),
            });
        }
        catch (err) {
            if (agent.abortController.signal.aborted) {
                return agent.makeResult([], "aborted", iterations);
            }
            // Model errors are surfaced as a synthetic assistant
            // message so the user sees the error in the transcript
            // and the loop exits cleanly. (No retry here: a retry
            // doubles the hang on bad configs / dead endpoints —
            // the tool-loop + empty-response heals below cover the
            // recoverable cases.)
            const message = err.message ?? String(err);
            agent.emit({
                kind: "error",
                ts: new Date().toISOString(),
                iteration: iterations,
                message: `model error: ${message}`,
            });
            agent.session.appendMessage("assistant", [
                { type: "text", text: `[model error] ${message}` },
            ]);
            return agent.makeResult([{ type: "text", text: `[model error] ${message}` }], "aborted", iterations);
        }
        // Self-healing: an empty response (no text, no tools) is almost
        // always a provider hiccup. Hint the model once and continue
        // instead of ending the turn with nothing.
        if (response.content.length === 0 && !emptyResponseHinted) {
            emptyResponseHinted = true;
            const hint = "[system] Your previous response was empty. Please answer the user's request now — either reply directly or call a tool.";
            agent.session.appendMessage("user", [{ type: "text", text: hint }]);
            agent.emit({
                kind: "error",
                ts: new Date().toISOString(),
                iteration: iterations,
                message: "empty model response — retrying with a hint",
            });
            continue;
        }
        // 1b. F7.1: cost attribution. The model reports usage; the
        // Agent attributes it to the right model (each model has
        // its own price). Unknown model + missing usage = 0 cost
        // (graceful default for FakeModel / local).
        if (agent.abortController.signal.aborted) {
            return agent.makeResult(response.content, "aborted", iterations);
        }
        if (response.usage) {
            agent.costTracker.addUsage({
                inputTokens: response.usage.inputTokens,
                outputTokens: response.usage.outputTokens,
            }, response.model);
        }
        // 1c. F7.5: cost cap. After every usage attribution, check
        // against the cap. The cap is checked DURING the run, not
        // at the end — that's the whole point of a cap. Abort
        // cleanly; the result still has the cost up to this point.
        if (agent.maxCostUsd !== undefined) {
            const total = agent.costTracker.total();
            if (total.costUsd > agent.maxCostUsd) {
                const reason = `max-cost-usd exceeded: $${total.costUsd.toFixed(4)} > $${agent.maxCostUsd}`;
                agent.abortController.abort(reason);
                // Surface the abort reason in the transcript AND the
                // result content so the model/user sees why the run
                // stopped (v0 omitted this — the user saw a silent
                // "aborted" stop reason with the last response text).
                const note = {
                    type: "text",
                    text: `\n\n[aborted] ${reason}`,
                };
                agent.session.appendMessage("assistant", [note]);
                return agent.makeResult([...response.content, note], "aborted", iterations);
            }
        }
        // F9.4: emit model_response (after cost attribution
        // so the event matches what the agent saw).
        agent.emit({
            kind: "model_response",
            ts: new Date().toISOString(),
            iteration: iterations,
            stopReason: response.stopReason,
            content: response.content,
            ...(response.usage ? { usage: response.usage } : {}),
        });
        // 2. Append the assistant message. Tool-call ids are normalized to
        //    non-empty unique values BEFORE storage: some providers (MiniMax,
        //    weaker local models) emit `id: ""` or reuse ids across turns,
        //    which the API rejects (`400 duplicate tool_call id` / invalid
        //    params) and which breaks tool_result attribution. Normalizing
        //    here keeps the session + wire formats consistent.
        const normalizedContent = normalizeToolCallIds(response.content);
        agent.session.appendMessage("assistant", normalizedContent);
        // 3. Extract tool calls.
        const toolCalls = normalizedContent.filter((b) => b.type === "tool_call");
        // 4. No tool calls → done — unless the reply is thinking-only
        //    (models often end_turn inside `<think>` without writing the
        //    user-facing answer). Treat that like an empty response and
        //    ask once for a real reply. If it still won't produce visible
        //    text, return an explicit fallback so hosts don't show a blank
        //    bubble (and don't treat the turn as "success with no content").
        if (toolCalls.length === 0) {
            const visible = visibleTextFromContent(normalizedContent);
            if (visible.length === 0 && !emptyResponseHinted) {
                emptyResponseHinted = true;
                const hint = "[system] Your previous response had no user-visible answer (only private reasoning, or it was empty). Please answer the user's request now in plain text — do not put the answer only inside thinking tags.";
                agent.session.appendMessage("user", [{ type: "text", text: hint }]);
                agent.emit({
                    kind: "error",
                    ts: new Date().toISOString(),
                    iteration: iterations,
                    message: "thinking-only model response — retrying with a hint",
                });
                continue;
            }
            if (visible.length === 0) {
                const fallback = [
                    {
                        type: "text",
                        text: "(No visible reply was produced after retrying. Please try again or rephrase.)",
                    },
                ];
                agent.session.appendMessage("assistant", fallback);
                return agent.makeResult(fallback, normalizeStopReason(response.stopReason), iterations);
            }
            return agent.makeResult(response.content, normalizeStopReason(response.stopReason), iterations);
        }
        // 5. Execute the tool calls. F10.2: when
        // ALL the calls are `task` (sub-agents),
        // run them in parallel — each sub-agent
        // gets its own session with no shared
        // state, so there's nothing to order by.
        // Mixed iterations (some `task` + some
        // `bash`) stay serial (bash is
        // order-dependent). The model's pattern
        // is the driver; the host doesn't opt in.
        await agent.executor.executeMany(toolCalls, iterations);
        // 5b. Self-healing: detect repeated identical tool failures and
        // inject a corrective message so the model changes approach instead
        // of looping on the same error (e.g. a nameless bash call).
        for (const call of toolCalls) {
            const result = findToolResult(agent.session.messages, call.id);
            const signature = `${call.name}\u0000${JSON.stringify(call.args)}`;
            if (result === undefined || result.isError !== true) {
                // A success (or an absent result) resets the failure streak.
                toolFailureCounts.delete(signature);
                continue;
            }
            const errorText = typeof result.content === "string"
                ? result.content
                : JSON.stringify(result.content);
            const prev = toolFailureCounts.get(signature);
            const count = (prev?.count ?? 0) + 1;
            toolFailureCounts.set(signature, { count, lastError: errorText });
            if (count % 2 === 0) {
                const corrective = `[system] You attempted tool \`${call.name}\` with the same arguments ${count} times and it failed each time with: ${errorText}. ` +
                    `Do NOT repeat that exact call — change your approach (different arguments, a different tool, or answer directly).`;
                agent.session.appendMessage("user", [{ type: "text", text: corrective }]);
                agent.emit({
                    kind: "error",
                    ts: new Date().toISOString(),
                    iteration: iterations,
                    message: `tool call loop detected (${call.name}) — corrective hint injected`,
                });
            }
        }
        // If model said "max_tokens" and we have tool calls, treat
        // as end-of-turn; the agent shouldn't loop on a truncated
        // response. The transcript still has the tool results, so
        // a follow-up `run()` would see them.
        if (response.stopReason === "max_tokens") {
            return agent.makeResult(response.content, "max_tokens", iterations);
        }
    }
    throw new Error(`agent loop exceeded max iterations (${agent.maxIterations})`);
}
/** Find the `tool_result` message for a tool call id (most recent first). */
function findToolResult(messages, callId) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const m = messages[i];
        if (m === undefined || m.role !== "tool")
            continue;
        for (const b of m.content) {
            if (b.type === "tool_result" &&
                b.toolCallId === callId) {
                return { content: b.content, isError: b.isError };
            }
        }
    }
    return undefined;
}
/**
 * Normalize the model's `stopReason` into our
 * `AgentResult` union. `tool_use` from the model
 * means "I want to call a tool"; we keep that
 * semantic so callers can distinguish "I just
 * want to call one tool" from "I'm done talking".
 *
 * v0 is a no-op (the model's stopReason is already
 * a valid `AgentResult["stopReason"]`). The
 * indirection is here so a future normalization
 * (e.g. mapping `stop_sequence` to a richer set)
 * has a single chokepoint.
 */
function normalizeStopReason(modelReason) {
    return modelReason;
}
/** Join text blocks and strip thinking wrappers → user-visible reply. */
function visibleTextFromContent(content) {
    const raw = content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    return stripThinking(raw);
}
/**
 * Rewrite tool-call ids to be non-empty and unique within one assistant
 * message: empty ids become `call_N`, repeated ids become a fresh
 * `call_N`. Non-empty unique ids are preserved.
 */
function normalizeToolCallIds(content) {
    const seen = new Set();
    let generated = 0;
    return content.map((block) => {
        if (block.type !== "tool_call")
            return block;
        const rawId = typeof block.id === "string" ? block.id.trim() : "";
        if (rawId.length > 0 && !seen.has(rawId)) {
            seen.add(rawId);
            return block;
        }
        generated += 1;
        let candidate = `call_${generated}`;
        while (seen.has(candidate)) {
            generated += 1;
            candidate = `call_${generated}`;
        }
        seen.add(candidate);
        return { ...block, id: candidate };
    });
}
//# sourceMappingURL=run-loop.js.map