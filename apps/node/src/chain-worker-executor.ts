/**
 * Phase 43A — Production worker execution after task.chain.accept.
 *
 * Default Agent Network engine = Built-in OpenClaw (see docs/agent-network-engine.md).
 * Ext Agent is a node-owner-only option (`agentNetworkWorkerEngine`).
 *
 * Phase 53 — consumes propose `inputArtifacts` and emits named `result` artifacts.
 */

import {
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
  clipChainSubtaskPartialNote,
  type ChainSubtask,
  type NamedArtifact,
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
  inputArtifacts?: NamedArtifact[];
}

/** Map capability tags to tool names for simple local execution (legacy fallback). */
function toolForCapability(capability: string): string | null {
  const c = capability.toLowerCase();
  if (c.includes("research") || c.includes("web")) return "web_search";
  if (c.includes("summarize") || c.includes("execute")) return "assistant_summarize";
  return "assistant_summarize";
}

const TEXT_ARTIFACT_MAX = 64_000;

/** Format parent input artifacts for the OpenClaw worker prompt (Phase 53). */
export function formatInputArtifactsForPrompt(
  inputArtifacts: readonly NamedArtifact[] | undefined,
): string {
  if (!inputArtifacts || inputArtifacts.length === 0) return "";
  const sections: string[] = ["## Parent inputs (typed handoff)"];
  for (const item of inputArtifacts) {
    const art = item.artifact as {
      kind?: string;
      content?: string;
      data?: unknown;
      schemaRef?: string;
      vaultPath?: string;
      contentHash?: string;
      displayName?: string;
      mimeType?: string;
    };
    sections.push(`## Input: ${item.key}`);
    if (art.kind === "text" && typeof art.content === "string") {
      sections.push(art.content);
    } else if (art.kind === "structured") {
      sections.push(
        `schemaRef: ${art.schemaRef ?? "unknown"}\n${JSON.stringify(art.data ?? {}, null, 2)}`,
      );
    } else if (art.kind === "file") {
      sections.push(
        [
          `File ref (contents not inlined — resolve via vault if available):`,
          `- path: ${art.vaultPath ?? "unknown"}`,
          `- contentHash: ${art.contentHash ?? "unknown"}`,
          art.displayName ? `- displayName: ${art.displayName}` : "",
          art.mimeType ? `- mimeType: ${art.mimeType}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } else {
      sections.push(JSON.stringify(item.artifact));
    }
  }
  return sections.join("\n\n");
}

export function buildOpenClawSubtaskPrompt(
  subtask: ChainSubtask,
  inputArtifacts?: readonly NamedArtifact[],
): string {
  const constraints = (subtask.constraints ?? []).filter(Boolean);
  const parts = [
    "You are a Team job worker on the EnvoyMesh Agent Network.",
    `Required skill hint: ${subtask.requiredSkill}`,
    subtask.requiredRole ? `Required role: ${subtask.requiredRole}` : "",
    subtask.threadId ? `Thread: ${subtask.threadId}` : "",
    `Objective:\n${subtask.objective}`,
  ].filter(Boolean);
  const inputs = formatInputArtifactsForPrompt(inputArtifacts);
  if (inputs) parts.push(inputs);
  if (constraints.length > 0) {
    parts.push(`Constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}`);
  }
  parts.push("Produce a clear, useful result for the orchestrator. Be concise and factual.");
  return parts.join("\n\n");
}

function textResultArtifacts(text: string): {
  artifactFragment: { kind: "text"; content: string };
  namedArtifacts: NamedArtifact[];
} {
  const content = text.slice(0, TEXT_ARTIFACT_MAX);
  const artifact = { kind: "text" as const, content };
  return {
    artifactFragment: artifact,
    namedArtifacts: [{ key: "result", artifact }],
  };
}

/**
 * Built-in OpenClaw executor for accepted Team-job subtasks (AN engine default).
 * Emits honest Failed partials when OpenClaw is down or errors — no stub success.
 */
export function createOpenClawChainSubtaskExecutor(input: {
  workerPeerId: string;
  now?: () => Date;
  isOpenClawReady: () => boolean;
  askOpenClaw: (prompt: string) => Promise<string>;
}): NonNullable<ChainWorkerHandlerDeps["executeSubtask"]> {
  return createEngineChainSubtaskExecutor({
    workerPeerId: input.workerPeerId,
    now: input.now,
    engineLabel: "Built-in OpenClaw",
    logTag: "OpenClaw",
    unavailableCode: "openclaw_unavailable",
    emptyCode: "openclaw_empty",
    isReady: input.isOpenClawReady,
    ask: input.askOpenClaw,
  });
}

/**
 * Ext Agent executor for accepted Team-job subtasks (AN engine Step 2).
 * Uses the node owner's active Ext Agent (bridge). Sync reply required —
 * async `/bridge/send` replies are treated as failure for Team jobs.
 */
export function createExtAgentChainSubtaskExecutor(input: {
  workerPeerId: string;
  now?: () => Date;
  isExtAgentReady: () => boolean;
  askExtAgent: (prompt: string) => Promise<string>;
}): NonNullable<ChainWorkerHandlerDeps["executeSubtask"]> {
  return createEngineChainSubtaskExecutor({
    workerPeerId: input.workerPeerId,
    now: input.now,
    engineLabel: "Ext Agent",
    logTag: "ExtAgent",
    unavailableCode: "ext_agent_unavailable",
    emptyCode: "ext_agent_empty",
    isReady: input.isExtAgentReady,
    ask: input.askExtAgent,
  });
}

function createEngineChainSubtaskExecutor(input: {
  workerPeerId: string;
  now?: () => Date;
  engineLabel: string;
  logTag: string;
  unavailableCode: string;
  emptyCode: string;
  isReady: () => boolean;
  ask: (prompt: string) => Promise<string>;
}): NonNullable<ChainWorkerHandlerDeps["executeSubtask"]> {
  return async (subtask, onPartial, opts) => {
    let seq = 0;
    const emit = async (
      note: string,
      isFinal: boolean,
      confidence?: number,
      artifacts?: ReturnType<typeof textResultArtifacts>,
    ) => {
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
            ...(isFinal && artifacts
              ? {
                  artifactFragment: artifacts.artifactFragment,
                  namedArtifacts: artifacts.namedArtifacts,
                }
              : {}),
            createdAt: (input.now ?? (() => new Date()))().toISOString(),
          }),
        }),
      );
    };

    chainLog("exec", `${input.logTag} subtask start`, {
      chainId: subtask.chainId,
      subtaskId: subtask.subtaskId,
      skill: subtask.requiredSkill,
      worker: shortPeerId(input.workerPeerId),
      ready: input.isReady(),
      inputArtifacts: opts?.inputArtifacts?.length ?? 0,
    });

    if (!input.isReady()) {
      await emit(
        `AN_ENGINE_FAIL: ${input.engineLabel} is not ready on this node`,
        true,
        0.1,
      );
      chainWarn("exec", `${input.logTag} unavailable`, { subtaskId: subtask.subtaskId });
      return { ok: false, finalNote: input.unavailableCode };
    }

    await emit(`Working on: ${subtask.objective}`, false, 0.3);

    try {
      const text = (
        await input.ask(buildOpenClawSubtaskPrompt(subtask, opts?.inputArtifacts))
      ).trim();
      if (!text) {
        await emit(
          `AN_ENGINE_FAIL: ${input.engineLabel} returned an empty response`,
          true,
          0.1,
        );
        chainWarn("exec", `${input.logTag} empty`, { subtaskId: subtask.subtaskId });
        return { ok: false, finalNote: input.emptyCode };
      }
      const clipped = clipChainSubtaskPartialNote(text) ?? text;
      await emit(clipped, true, 0.85, textResultArtifacts(text));
      chainLog("exec", `${input.logTag} subtask done`, {
        subtaskId: subtask.subtaskId,
        chars: clipped.length,
        artifactChars: Math.min(text.length, TEXT_ARTIFACT_MAX),
      });
      return { ok: true, finalNote: clipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit(`AN_ENGINE_FAIL: ${msg}`, true, 0.1);
      chainWarn("exec", `${input.logTag} error`, { subtaskId: subtask.subtaskId, error: msg });
      return { ok: false, finalNote: msg };
    }
  };
}

export async function executeAcceptedSubtask(
  workerDeps: ChainWorkerHandlerDeps,
  executorDeps: ChainWorkerExecutorDeps,
  orchestratorPeerId: string,
  subtask: ChainSubtask,
  opts?: { inputArtifacts?: NamedArtifact[] },
): Promise<{ ok: boolean; reason?: string }> {
  let seq = 0;
  const emit = async (note: string, isFinal: boolean, confidence?: number) => {
    seq += 1;
    const artifacts = isFinal && note && !note.startsWith("AN_ENGINE_FAIL")
      ? textResultArtifacts(note)
      : undefined;
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
        ...(artifacts
          ? {
              artifactFragment: artifacts.artifactFragment,
              namedArtifacts: artifacts.namedArtifacts,
            }
          : {}),
        createdAt: (workerDeps.now ?? (() => new Date()))().toISOString(),
      }),
    });
    await deliverChainPartial(workerDeps, orchestratorPeerId, partial, subtask.chainId);
  };

  if (workerDeps.executeSubtask) {
    const result = await workerDeps.executeSubtask(
      subtask,
      async (payload) => {
        await deliverChainPartial(workerDeps, orchestratorPeerId, payload, subtask.chainId);
      },
      opts,
    );
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
      : JSON.stringify(result.result ?? {});
  await emit(text, true, 0.8);
  return { ok: true };
}
