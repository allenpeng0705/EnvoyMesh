/**
 * FH-P2-B — enforce EnvoyHome child `allowTools` on EH sub-agents (host side).
 *
 * Children specs are stacked per account (chat/session) so concurrent Coding
 * sessions and parallel parent `task` calls do not clobber each other.
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

/** Newest batch last — parallel `task` calls push/pop independently. */
const batchesByAccount = new Map<string, EhTaskChildSpec[][]>();

export function __resetEhSubagentChildAllowForTests(): void {
  batchesByAccount.clear();
}

export function pushActiveEhTaskChildren(
  accountKey: string,
  children: readonly EhTaskChildSpec[],
): void {
  const key = accountKey.trim();
  if (!key) return;
  const stack = batchesByAccount.get(key) ?? [];
  stack.push([...children]);
  batchesByAccount.set(key, stack);
}

/**
 * Pop one batch for the account. Prefers an exact objective-set match
 * (parallel PostToolUse), else the newest batch.
 */
export function popActiveEhTaskChildren(
  accountKey: string,
  children?: readonly EhTaskChildSpec[],
): EhTaskChildSpec[] | undefined {
  const key = accountKey.trim();
  if (!key) return undefined;
  const stack = batchesByAccount.get(key);
  if (!stack || stack.length === 0) return undefined;

  let idx = stack.length - 1;
  if (children && children.length > 0) {
    const wanted = new Set(children.map((c) => c.objective));
    const found = stack.findIndex((batch) => {
      if (batch.length !== children.length) return false;
      return batch.every((c) => wanted.has(c.objective));
    });
    if (found >= 0) idx = found;
  }

  const [removed] = stack.splice(idx, 1);
  if (stack.length === 0) batchesByAccount.delete(key);
  else batchesByAccount.set(key, stack);
  return removed;
}

/** Clear every batch for an account (host teardown). */
export function clearActiveEhTaskChildren(accountKey: string): number {
  const key = accountKey.trim();
  if (!key) return 0;
  const stack = batchesByAccount.get(key);
  if (!stack) return 0;
  let count = 0;
  for (const batch of stack) count += batch.length;
  batchesByAccount.delete(key);
  return count;
}

export function getActiveEhTaskChildren(
  accountKey: string,
): readonly EhTaskChildSpec[] | undefined {
  const key = accountKey.trim();
  if (!key) return undefined;
  const stack = batchesByAccount.get(key);
  if (!stack || stack.length === 0) return undefined;
  return stack.flat();
}

function matchAllowTools(
  children: readonly EhTaskChildSpec[] | undefined,
  objective: string,
): readonly string[] | undefined {
  if (!children || children.length === 0) return undefined;
  const trimmed = objective.trim();
  const exact = children.find((c) => c.objective === trimmed);
  if (exact !== undefined) return exact.allowTools;
  const prefix = children.find(
    (c) => trimmed.startsWith(c.objective) || c.objective.startsWith(trimmed),
  );
  return prefix?.allowTools;
}

/** Match sub-agent objective to parsed parent `task` child spec. */
export function resolveEhChildAllowToolsForObjective(
  objective: string,
  accountKey?: string,
): readonly string[] | undefined {
  if (accountKey?.trim()) {
    const stack = batchesByAccount.get(accountKey.trim());
    if (!stack) return undefined;
    // Newest batch first so the most recent parent task wins on ties.
    for (let i = stack.length - 1; i >= 0; i--) {
      const hit = matchAllowTools(stack[i], objective);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  for (const stack of batchesByAccount.values()) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const hit = matchAllowTools(stack[i], objective);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
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
  /** Scopes allow-list lookup when multiple EH chats run concurrently. */
  accountKey?: string;
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
  const accountKey = options.accountKey?.trim();
  return (input: SubagentInput) => {
    const permissionMode =
      options.getPermissionMode?.() ?? options.permissionMode ?? "read-only";
    const allowFromTask = resolveEhChildAllowToolsForObjective(
      input.objective,
      accountKey,
    );
    const allowTools = allowFromTask ?? [...filterEhChildAllowTools(undefined)];

    const session = new InMemorySession(newSessionId(), {
      cwd,
      permissionMode,
      startedAt: new Date().toISOString(),
    });
    const tools = new ToolRegistry();
    for (const t of BUILTIN_TOOLS) {
      if (allowTools.includes(t.name)) tools.register(t);
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
