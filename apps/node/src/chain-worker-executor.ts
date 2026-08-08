/**
 * Phase 43A — Production worker execution after task.chain.accept.
 *
 * Default Agent Network engine = Built-in OpenClaw (see docs/agent-network-engine.md).
 * Ext Agent for AN is a later, node-owner-only option.
 */

import {
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
  clipChainSubtaskPartialNote,
  type ChainSubtask,
} from "@envoymesh/protocol";

import { executeTool, type MeshToolContext } from "./tool-registry.js";
import { deliverChainPartial, type ChainWorkerHandlerDeps } from "./chain-worker.js";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";

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
            note: clipChainSubtaskPartialNote(note),
            confidence,
            createdAt: (input.now ?? (() => new Date()))().toISOString(),
          }),
        }),
      );
    };

    chainLog("exec", "OpenClaw subtask start", {
      chainId: subtask.chainId,
      subtaskId: subtask.subtaskId,
      skill: subtask.requiredSkill,
      worker: shortPeerId(input.workerPeerId),
      openclawReady: input.isOpenClawReady(),
    });

    if (!input.isOpenClawReady()) {
      await emit("AN_ENGINE_FAIL: Built-in OpenClaw is not running on this node", true, 0.1);
      chainWarn("exec", "OpenClaw unavailable", { subtaskId: subtask.subtaskId });
      return { ok: false, finalNote: "openclaw_unavailable" };
    }

    await emit(`Working on: ${subtask.objective}`, false, 0.3);

    try {
      const text = (await input.askOpenClaw(buildOpenClawSubtaskPrompt(subtask))).trim();
      if (!text) {
        await emit("AN_ENGINE_FAIL: OpenClaw returned an empty response", true, 0.1);
        chainWarn("exec", "OpenClaw empty", { subtaskId: subtask.subtaskId });
        return { ok: false, finalNote: "openclaw_empty" };
      }
      const clipped = clipChainSubtaskPartialNote(text) ?? text;
      await emit(clipped, true, 0.85);
      chainLog("exec", "OpenClaw subtask done", {
        subtaskId: subtask.subtaskId,
        chars: clipped.length,
      });
      return { ok: true, finalNote: clipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit(`AN_ENGINE_FAIL: ${msg}`, true, 0.1);
      chainWarn("exec", "OpenClaw error", { subtaskId: subtask.subtaskId, error: msg });
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
        note: clipChainSubtaskPartialNote(note),
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
    await emit(
      `AN_ENGINE_FAIL: no Agent Network executor available for ${subtask.requiredSkill}`,
      true,
      0.1,
    );
    return { ok: false, reason: "no_executor" };
  }

  const result = await executeTool(
    toolName,
    { query: subtask.objective, objective: subtask.objective },
    { ...context, approvalGranted: true },
  );
  if (!result.ok) {
    await emit(`AN_ENGINE_FAIL: ${result.error ?? "execution error"}`, true, 0.1);
    return { ok: false, reason: result.error };
  }

  const text =
    typeof result.result === "string"
      ? result.result
      : JSON.stringify(result.result ?? {}).slice(0, 4000);
  await emit(clipChainSubtaskPartialNote(text) ?? text, true, 0.75);
  return { ok: true };
}
