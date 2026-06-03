/**
 * Task Negotiation Loop (Phase 24A complete)
 *
 * Orchestrates the full A2A lifecycle:
 *   task.propose → task.accept → task.execute → task.result → task.feedback
 *
 * Wires together agent-negotiation-worker, tool-registry execution,
 * and the existing daemon-task-inbound handler.
 */

import type { AgentNegotiationDeps, NegotiationResult } from "./agent-negotiation-worker.js";
import { runAgentNegotiation } from "./agent-negotiation-worker.js";

/**
 * What the agent does after a peer accepts the task.
 */
export interface TaskExecutionDeps {
  /** Execute a tool by name and params. Returns ok + result or error. */
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
  }>;
  /** Send task.result to the accepting peer. */
  sendTaskResult: (
    peerId: string,
    ownerId: string,
    taskId: string,
    result: unknown,
    correlationId: string,
  ) => Promise<boolean>;
  /** Send task.feedback to the accepting peer. */
  sendTaskFeedback: (
    peerId: string,
    ownerId: string,
    taskId: string,
    score: number,
    comment?: string,
    correlationId?: string,
  ) => Promise<boolean>;
}

export interface TaskNegotiationLoopResult {
  ok: boolean;
  negotiation: NegotiationResult;
  taskId?: string;
  executionResult?: unknown;
  feedbackSent: boolean;
  error?: string;
}

/**
 * Run the full A2A task negotiation lifecycle:
 * 1. Discover providers and send proposals
 * 2. (Acceptance is handled by daemon-task-inbound.ts via task.accept)
 * 3. Execute the task
 * 4. Send task.result to accepting peer
 * 5. Send task.feedback
 */
export async function runTaskNegotiationLoop(
  negotiationDeps: AgentNegotiationDeps,
  executionDeps: TaskExecutionDeps,
  objective: string,
  capabilityTags: string[],
  opts?: {
    maxProviders?: number;
    minReputationScore?: number;
    allowUnbonded?: boolean;
  },
): Promise<TaskNegotiationLoopResult> {
  // Step 1: Negotiate — discover providers and send proposals
  const negotiation = await runAgentNegotiation(
    negotiationDeps,
    objective,
    capabilityTags,
    opts,
  );

  if (!negotiation.ok || !negotiation.acceptedBy) {
    return {
      ok: false,
      negotiation,
      feedbackSent: false,
      error: negotiation.error ?? "No provider accepted the task",
    };
  }

  // Step 2: Execute the task
  const taskId = negotiation.correlationId;
  const execution = await executionDeps.executeTool("generic.task_execute", {
    objective,
    capabilityTags,
    taskId,
  });

  if (!execution.ok) {
    return {
      ok: false,
      negotiation,
      taskId,
      feedbackSent: false,
      error: execution.error ?? "Task execution failed",
    };
  }

  // Step 3: Send task.result
  const peerId = negotiation.acceptedByPeerId ?? negotiation.acceptedBy ?? "";
  const ownerId = negotiation.acceptedBy ?? "";
  const resultSent = await executionDeps.sendTaskResult(
    peerId,
    ownerId,
    taskId,
    execution.result,
    negotiation.correlationId,
  );

  if (!resultSent) {
    return {
      ok: false,
      negotiation,
      taskId,
      executionResult: execution.result,
      feedbackSent: false,
      error: "Failed to send task.result",
    };
  }

  // Step 4: Send task.feedback (auto-rate as positive since execution succeeded)
  const feedbackSent = await executionDeps.sendTaskFeedback(
    peerId,
    ownerId,
    taskId,
    0.8, // Default positive feedback score
    "Task completed successfully",
    negotiation.correlationId,
  );

  return {
    ok: true,
    negotiation,
    taskId,
    executionResult: execution.result,
    feedbackSent,
  };
}
