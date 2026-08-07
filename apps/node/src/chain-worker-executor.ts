/**
 * Phase 43A — Production worker execution after task.chain.accept.
 */

import {
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
  type ChainSubtask,
  type TaskChainPartialPayload,
} from "@envoymesh/protocol";

import { executeTool, type MeshToolContext } from "./tool-registry.js";
import { deliverChainPartial, type ChainWorkerHandlerDeps } from "./chain-worker.js";

export interface ChainWorkerExecutorDeps {
  getToolContext: () => Promise<MeshToolContext | null>;
}

export interface CachedWorkerSubtask {
  subtask: ChainSubtask;
  orchestratorPeerId: string;
}

/** Map capability tags to tool names for simple local execution. */
function toolForCapability(capability: string): string | null {
  const c = capability.toLowerCase();
  if (c.includes("research") || c.includes("web")) return "web_search";
  if (c.includes("summarize") || c.includes("execute")) return "assistant_summarize";
  return "assistant_summarize";
}

export async function executeAcceptedSubtask(
  workerDeps: ChainWorkerHandlerDeps,
  executorDeps: ChainWorkerExecutorDeps,
  orchestratorPeerId: string,
  subtask: ChainSubtask,
): Promise<{ ok: boolean; reason?: string }> {
  let seq = 0;
  const emit = async (note: string, isFinal: boolean, confidence?: number) => {
    seq += 1;
    const partial = TaskChainPartialPayloadSchema.parse({
      partial: ChainSubtaskPartialSchema.parse({
        version: "0.1",
        subtaskId: subtask.subtaskId,
        chainId: subtask.chainId,
        workerPeerId: workerDeps.workerPeerId,
        seq,
        isFinal,
        note,
        confidence,
        createdAt: (workerDeps.now ?? (() => new Date()))().toISOString(),
      }),
    });
    await deliverChainPartial(workerDeps, orchestratorPeerId, partial, subtask.chainId);
  };

  if (workerDeps.executeSubtask) {
    await workerDeps.executeSubtask(subtask, async (payload) => {
      await deliverChainPartial(workerDeps, orchestratorPeerId, payload, subtask.chainId);
    });
    return { ok: true };
  }

  await emit(`Working on: ${subtask.objective}`, false, 0.3);

  const toolName = toolForCapability(subtask.requiredSkill);
  const context = await executorDeps.getToolContext();
  if (!context || !toolName) {
    const fallback = `[${subtask.requiredSkill}] ${subtask.objective}`;
    await emit(fallback, true, 0.5);
    return { ok: true };
  }

  const result = await executeTool(
    toolName,
    { query: subtask.objective, objective: subtask.objective },
    { ...context, approvalGranted: true },
  );
  if (!result.ok) {
    await emit(`Failed: ${result.error ?? "execution error"}`, true, 0.1);
    return { ok: false, reason: result.error };
  }

  const text =
    typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result ?? {}).slice(0, 4000);
  await emit(text.slice(0, 8000), true, 0.75);
  return { ok: true };
}
