/**
 * FH-P2-B — PreToolUse gate for harness `task` (caps + allow-list parse).
 */
import type { HookRegistry } from "@envoymesh/envoy-harness";
import type { HookDecision, HookEvent } from "@envoymesh/envoy-harness";

import {
  releaseEhSubagentSlots,
  tryAcquireEhSubagentSlots,
} from "./eh-subagent-account.js";
import {
  clearActiveEhTaskChildren,
  setActiveEhTaskChildren,
} from "./eh-subagent-child-allow.js";
import { parseEhTaskChildren } from "./eh-subagent-patterns.js";

function payloadToolArgs(
  payload: unknown,
): { tool: string; args: Record<string, unknown> } | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const row = payload as { tool?: unknown; args?: unknown };
  if (typeof row.tool !== "string") return undefined;
  const args =
    typeof row.args === "object" && row.args !== null
      ? (row.args as Record<string, unknown>)
      : {};
  return { tool: row.tool, args };
}

export function installEhSubagentTaskGuard(
  hooks: HookRegistry,
  options: { accountKey: string },
): () => void {
  const accountKey = options.accountKey;

  const onPre = async (event: HookEvent): Promise<HookDecision> => {
    const parsed = payloadToolArgs(event.payload);
    if (parsed === undefined || parsed.tool !== "task") {
      return { kind: "continue" };
    }
    const children = parseEhTaskChildren(parsed.args);
    if (children.length === 0) {
      return {
        kind: "block",
        reason: "task requires objective or a non-empty tasks[]",
      };
    }
    const slot = tryAcquireEhSubagentSlots(accountKey, children.length);
    if (!slot.ok) {
      return { kind: "block", reason: slot.reason };
    }
    setActiveEhTaskChildren(children);
    return { kind: "continue" };
  };

  const onPost = async (event: HookEvent): Promise<HookDecision> => {
    const parsed = payloadToolArgs(event.payload);
    if (parsed === undefined || parsed.tool !== "task") {
      return { kind: "continue" };
    }
    const children = parseEhTaskChildren(parsed.args);
    if (children.length > 0) {
      clearActiveEhTaskChildren();
      releaseEhSubagentSlots(accountKey, children.length);
    }
    return { kind: "continue" };
  };

  hooks.on("PreToolUse", onPre);
  hooks.on("PostToolUse", onPost);
  return () => {
    hooks.unregister("PreToolUse", onPre);
    hooks.unregister("PostToolUse", onPost);
  };
}