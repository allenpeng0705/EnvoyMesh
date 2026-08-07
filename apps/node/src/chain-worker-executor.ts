/**
 * Phase 43A — Production worker execution after task.chain.accept.
 *
 * Default Agent Network engine = Built-in OpenClaw (see docs/agent-network-engine.md).
 * Ext Agent for AN is a later, node-owner-only option.
 */

import {
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
  type ChainSubtask,
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

/** Map capability tags to tool names for simple local execution (legacy fallback). */
function toolForCapability(capability: string): string | null {
  const c = capability.toLowerCase();
  if (c.includes("research") || c.includes("web")) return "web_search";
  if (c.includes("summarize") || c.includes("execute")) return "assistant_summarize";
  return "assistant_summarize";
}

function buildOpenClawSubtaskPrompt(subtask: ChainSubtask): string {
  const constraints = (subtask.constraints ?? []).filter(Boolean);
  const parts = [
    "You are a Team job worker on the EnvoyMesh Agent Network.",
    `Required skill hint: ${subtask.requiredSkill}`,
    `Objective:\n${subtask.objective}`,
  ];
  if (constraints.length > 0) {
    parts.push(`Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`);
  }
  parts.push("Produce a clear, useful result for the orchestrator. Be concise and factual.");
  return parts.join("\n\n");
}

/**
 * Built-in OpenClaw executor for accepted Team-job subtasks (AN engine step 1).
 * Emits honest Failed partials when OpenClaw is down or errors — no stub success.
 */
export function createOpenClawChainSubtaskExecutor(input: {
  workerPeerId: string;
  now?: () => Date;
  isOpenClawReady: () => boolean;
  askOpenClaw: (prompt: string) => Promise<string>;
}): NonNullable<ChainWorkerHandlerDeps["executeSubtask"]> {
  return async (subtask, onPartial) => {
    let seq = 0;
    const emit = async (note: string, isFinal: boolean, confidence?: number) => {
      seq += 1;
      await onPartial(
        TaskChainPartialPayloadSchema.parse({
          partial: ChainSubtaskPartialSchema.parse({
            version: "0.1",
            subtaskId: subtask.subtaskId,
            chainId: subtask.chainId,
            workerPeerId: input.workerPeerId,
            seq,
            isFinal,
            note,
            confidence,
            createdAt: (input.now ?? (() => new Date()))().toISOString(),
          }),
        }),
      );
    };

    if (!input.isOpenClawReady()) {
      await emit("Failed: Built-in OpenClaw is not running on this node", true, 0.1);
      return { ok: false, finalNote: "openclaw_unavailable" };
    }

    await emit(`Working on: ${subtask.objective}`, false, 0.3);

    try {
      const text = (await input.askOpenClaw(buildOpenClawSubtaskPrompt(subtask))).trim();
      if (!text) {
        await emit("Failed: OpenClaw returned an empty response", true, 0.1);
        return { ok: false, finalNote: "openclaw_empty" };
      }
      const clipped = text.slice(0, 8000);
      await emit(clipped, true, 0.85);
      return { ok: true, finalNote: clipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit(`Failed: ${msg}`, true, 0.1);
      return { ok: false, finalNote: msg };
    }
  };
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
    const result = await workerDeps.executeSubtask(subtask, async (payload) => {
      await deliverChainPartial(workerDeps, orchestratorPeerId, payload, subtask.chainId);
    });
    return {
      ok: result.ok,
      reason: result.ok ? undefined : (result.finalNote ?? "execution_failed"),
    };
  }

  // Legacy fallback when no AN engine executor is wired (tests / older hosts).
  await emit(`Working on: ${subtask.objective}`, false, 0.3);

  const toolName = toolForCapability(subtask.requiredSkill);
  const context = await executorDeps.getToolContext();
  if (!context || !toolName) {
    await emit(`Failed: no Agent Network executor available for ${subtask.requiredSkill}`, true, 0.1);
    return { ok: false, reason: "no_executor" };
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
