/**
 * FH-P2-B — enforce EnvoyHome child `allowTools` on EH sub-agents (host side).
 */
import {
  Agent,
  BUILTIN_TOOLS,
  HookRegistry,
  InMemorySession,
  ToolRegistry,
  newSessionId,
  type HookDecision,
  type HookEvent,
  type SubagentInput,
} from "@envoymesh/envoy-harness";

import {
  type EhTaskChildSpec,
  filterEhChildAllowTools,
} from "./eh-subagent-patterns.js";

let activeTaskChildren: EhTaskChildSpec[] = [];

export function __resetEhSubagentChildAllowForTests(): void {
  activeTaskChildren = [];
}

export function setActiveEhTaskChildren(children: readonly EhTaskChildSpec[]): void {
  activeTaskChildren = [...children];
}

export function clearActiveEhTaskChildren(): void {
  activeTaskChildren = [];
}

/** Match sub-agent objective to parsed parent `task` child spec. */
export function resolveEhChildAllowToolsForObjective(
  objective: string,
): readonly string[] | undefined {
  if (activeTaskChildren.length === 0) return undefined;
  const trimmed = objective.trim();
  const exact = activeTaskChildren.find((c) => c.objective === trimmed);
  if (exact !== undefined) return exact.allowTools;
  const prefix = activeTaskChildren.find(
    (c) => trimmed.startsWith(c.objective) || c.objective.startsWith(trimmed),
  );
  return prefix?.allowTools;
}

function payloadToolName(event: HookEvent): string | undefined {
  const payload = event.payload;
  if (typeof payload !== "object" || payload === null) return undefined;
  const tool = (payload as { tool?: unknown }).tool;
  return typeof tool === "string" ? tool : undefined;
}

export function installEhSubagentChildAllowGuard(
  hooks: HookRegistry,
  allowTools: readonly string[],
): () => void {
  const allowed = new Set(allowTools);
  const onPre = async (event: HookEvent): Promise<HookDecision> => {
    const tool = payloadToolName(event);
    if (tool === undefined) return { kind: "continue" };
    if (tool === "task") {
      return {
        kind: "block",
        reason: "nested task refused for EH sub-agent (depth limit)",
      };
    }
    if (!allowed.has(tool)) {
      return {
        kind: "block",
        reason: `tool \`${tool}\` is not allowed for this sub-agent`,
      };
    }
    return { kind: "continue" };
  };
  hooks.on("PreToolUse", onPre);
  return () => hooks.unregister("PreToolUse", onPre);
}

export type EhSubagentBuildFactoryOptions = {
  model: import("@envoymesh/envoy-harness").ModelAdapter;
  cwd: string;
  permissionMode?: import("@envoymesh/envoy-harness").PermissionMode;
  getPermissionMode?: () => import("@envoymesh/envoy-harness").PermissionMode;
  meshSubmitter?: import("@envoymesh/envoy-harness").MeshSubmitter;
  parentSessionId?: string;
};

/**
 * Sub-agent factory with host allow-list enforcement (not harness defaults only).
 */
export function buildEhSubagentFactory(
  options: EhSubagentBuildFactoryOptions,
): (input: SubagentInput) => Agent {
  const cwd = options.cwd;
  return (input: SubagentInput) => {
    const permissionMode =
      options.getPermissionMode?.() ?? options.permissionMode ?? "read-only";
    const allowFromTask = resolveEhChildAllowToolsForObjective(input.objective);
    const allowTools = allowFromTask ?? [...filterEhChildAllowTools(undefined)];
    const allowed = new Set(allowTools);

    const session = new InMemorySession(newSessionId(), {
      cwd,
      permissionMode,
      startedAt: new Date().toISOString(),
    });
    const tools = new ToolRegistry();
    for (const t of BUILTIN_TOOLS) {
      if (allowed.has(t.name)) tools.register(t);
    }
    const hooks = new HookRegistry();
    installEhSubagentChildAllowGuard(hooks, allowTools);
    const systemPrompt = [
      `You are a sub-agent invoked by the parent's \`task\` tool.`,
      `Capability tag: ${input.capabilityTag}`,
      `Objective: ${input.objective}`,
      `Allowed tools: ${allowTools.join(", ")}`,
      `Stay within your cost ceiling ($${input.costCeilingUsd.toFixed(2)}) and deadline (${input.deadlineMs}ms).`,
    ].join("\n");
    return new Agent({
      model: options.model,
      tools,
      session,
      hooks,
      cwd,
      maxCostUsd: input.costCeilingUsd,
      systemPrompt,
      ...(options.parentSessionId ? { subagentOf: options.parentSessionId } : {}),
      // No meshSubmitter — children cannot nest `task`.
    });
  };
}