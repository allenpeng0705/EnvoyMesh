/**
 * The agent's main turn loop, extracted from
 * `agent.ts` in T3.1.
 *
 * **What it does (per design §3.4):**
 * 1. Append the user's prompt to the session
 *    (with the system prompt, if any, as the
 *    first message).
 * 2. Emit `agent_start`.
 * 3. Loop (bounded by `maxIterations`):
 *    a. Call the model.
 *    b. Attribute cost (F7.1).
 *    c. Check the cost cap (F7.5).
 *    d. Emit `model_response`.
 *    e. Append the assistant message.
 *    f. Extract tool calls; if none → return.
 *    g. Run the tool calls through `ToolExecutor`.
 *    h. If the model said `max_tokens` → return.
 * 4. Throw on `maxIterations` exhaustion.
 *
 * **Why a top-level function, not a method:** the
 * loop body is ~180 lines and the only method
 * that needs to be reachable from a "run" handle
 * (a future `ReplAgentHandle`, a CLI subcommand,
 * the test harness). Extracting it makes the
 * Agent class a thin facade (its public API
 * stays the same; `run()` is now a 1-liner
 * delegating to `runAgentLoop`).
 *
 * **Why not a `RunState` class:** the per-`run`
 * state is just `iterations` + the in-flight
 * response + the in-flight content. A class
 * with those 3 fields and a single `run()`
 * method would be 200 lines of boilerplate
 * for no testability win — the loop reads
 * them from the loop-local `let`s and
 * passes them to `agent.makeResult` at the
 * exit. A free function is the right shape
 * ("testability wins on tie").
 *
 * **Pure refactor:** the loop body is moved
 * verbatim. The behavior is identical;
 * `Agent.run(prompt)` still returns the same
 * `AgentResult`.
 */
import type { ContentBlock } from "../tools/index.js";
import type { Agent, AgentResult } from "../agent.js";
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
export declare function runAgentLoop(agent: Agent, prompt: string | ReadonlyArray<ContentBlock>): Promise<AgentResult>;
//# sourceMappingURL=run-loop.d.ts.map