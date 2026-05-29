import type { EnvoyIntent } from "@envoymesh/protocol";
import type { AgentRouteStep } from "./capability-intent-routing.js";

/** Record of one executed (or deferred) route step — agent Activity / job audit only. */
export interface RouteStepExecutionRecord {
  phase: string;
  toolName?: string;
  ok: boolean;
  deferred?: boolean;
  summary: string;
}

export interface RouteExecutionProgress {
  routeStepIndex: number;
  stepResults: RouteStepExecutionRecord[];
  agentRoutePhase?: string;
}

/** Map external-agent tool aliases to in-process registry tool names. */
export const MESH_TOOL_REGISTRY_ALIASES: Record<string, string> = {
  mesh_requestKnowledge: "knowledge.query",
  mesh_sendChat: "chat.send",
  mesh_findCapability: "mesh.match_capability_route",
};

/** Preferred registry tool for an EMP intent when no meshTools hint exists. */
export const INTENT_TO_MESH_TOOL: Partial<Record<EnvoyIntent, string>> = {
  "discovery.request": "discovery.search",
  "knowledge.query": "knowledge.query",
  "agent.card.request": "mesh.agent_card.request",
  "agent.card.response": "mesh.get_agent_card",
  "chat.message": "chat.send",
  "task.propose": "mesh.task.propose",
};

const HUMAN_ONLY_INTENTS: ReadonlySet<EnvoyIntent> = new Set(["bond.accept"]);

const TASK_INTENTS: ReadonlySet<EnvoyIntent> = new Set([
  "task.mandate",
  "task.propose",
  "task.negotiate",
  "task.accept",
  "task.reject",
  "task.heartbeat",
  "task.result",
  "task.cancel",
]);

export function resolveRegistryToolName(meshOrRegistryName: string): string {
  return MESH_TOOL_REGISTRY_ALIASES[meshOrRegistryName] ?? meshOrRegistryName;
}

export function pickMeshToolForStep(step: AgentRouteStep): string | undefined {
  const hinted = step.meshTools?.[0];
  if (hinted) return resolveRegistryToolName(hinted);
  for (const intent of step.intents) {
    const mapped = INTENT_TO_MESH_TOOL[intent];
    if (mapped) return mapped;
  }
  return undefined;
}

export type ResolvedRouteStep =
  | { kind: "execute"; toolName: string; params: Record<string, unknown> }
  | { kind: "defer"; reason: string }
  | { kind: "skip"; reason: string };

export function resolveRouteStepExecution(input: {
  step: AgentRouteStep;
  goal: string;
  targetOwnerId?: string;
  capabilityIds?: string[];
  correlationId: string;
}): ResolvedRouteStep {
  const { step, goal, targetOwnerId, capabilityIds, correlationId } = input;

  if (step.intents.some((intent) => HUMAN_ONLY_INTENTS.has(intent))) {
    return { kind: "defer", reason: "human-only intent; agent cannot execute" };
  }

  const toolName = pickMeshToolForStep(step);

  if (
    !toolName &&
    step.intents.includes("task.propose") &&
    targetOwnerId
  ) {
    return {
      kind: "execute",
      toolName: "mesh.task.propose",
      params: {
        targetOwnerId,
        objective: goal,
        correlationId,
      },
    };
  }

  if (!toolName && step.intents.some((intent) => TASK_INTENTS.has(intent))) {
    return {
      kind: "defer",
      reason: "task step not executable without target or supported tool",
    };
  }

  if (!toolName) {
    return { kind: "skip", reason: "no executable mesh tool for step" };
  }

  switch (toolName) {
    case "mesh.library_discover":
      return {
        kind: "execute",
        toolName,
        params: {
          fileTitleQuery: goal.slice(0, 120),
          correlationId,
        },
      };
    case "mesh.library_request_share":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for library share request" };
      }
      return {
        kind: "execute",
        toolName,
        params: {
          targetOwnerHint: targetOwnerId,
          fileTitleQuery: goal.slice(0, 120),
        },
      };
    case "knowledge.query":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for knowledge.query" };
      }
      return {
        kind: "execute",
        toolName,
        params: {
          targetOwnerId,
          query: `Document acquisition (metadata only — no file bytes): "${goal}". Which published library item matches? Reply with relativePath on the first line if match, else "no match".`,
          requestedSensitivity: "friends",
          correlationId,
        },
      };
    case "discovery.search":
      if (targetOwnerId) {
        return { kind: "skip", reason: "target owner already resolved" };
      }
      return {
        kind: "execute",
        toolName: "mesh.library_discover",
        params: { fileTitleQuery: goal.slice(0, 120), correlationId },
      };
    case "mesh.agent_card.request":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for agent card request" };
      }
      return { kind: "execute", toolName, params: { targetOwnerId } };
    case "mesh.get_agent_card":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for agent card read" };
      }
      return { kind: "execute", toolName, params: { ownerId: targetOwnerId } };
    case "mesh.match_capability_route":
      return {
        kind: "execute",
        toolName,
        params: { goal, capabilityIds },
      };
    case "mesh.task.propose":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for task.propose" };
      }
      return {
        kind: "execute",
        toolName,
        params: { targetOwnerId, objective: goal, correlationId },
      };
    case "chat.send":
      if (!targetOwnerId) {
        return { kind: "defer", reason: "targetOwnerId required for chat.send" };
      }
      return {
        kind: "defer",
        reason: "chat.send may require owner approval",
      };
    case "mesh.intro.broadcast_search":
      return {
        kind: "defer",
        reason: "intro broadcast requires trust mode policy check",
      };
    default:
      return { kind: "skip", reason: `unsupported tool: ${toolName}` };
  }
}

export function appendRouteStepResult(
  progress: RouteExecutionProgress,
  record: RouteStepExecutionRecord,
): RouteExecutionProgress {
  return {
    routeStepIndex: progress.routeStepIndex + 1,
    stepResults: [...progress.stepResults, record],
    agentRoutePhase: record.phase,
  };
}

export function isRouteExecutionComplete(progress: RouteExecutionProgress, totalSteps: number): boolean {
  return progress.routeStepIndex >= totalSteps;
}

export function initialRouteExecutionProgress(): RouteExecutionProgress {
  return { routeStepIndex: 0, stepResults: [] };
}
