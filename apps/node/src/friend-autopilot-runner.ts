import { randomUUID } from "node:crypto";
import type { AgentActivityRecord } from "@envoymesh/api";
import { executeTool, type MeshToolContext } from "./tool-registry.js";

export interface FriendAutopilotPassResult {
  ok: boolean;
  error?: string;
  broadcastOk?: boolean;
}

export async function runFriendAutopilotPass(input: {
  getContext: () => Promise<MeshToolContext | null>;
  vaultSearchFn?: (query: string, limit?: number) => Promise<unknown>;
  maxResponses?: number;
}): Promise<FriendAutopilotPassResult> {
  const context = await input.getContext();
  if (!context) {
    return { ok: false, error: "Tool context unavailable" };
  }
  if (!context.trustIntro?.trustModeEnabled) {
    return { ok: false, error: "Trust mode disabled" };
  }
  if (!context.trustIntro.friendAutopilotEnabled) {
    return { ok: false, error: "Friend autopilot disabled" };
  }

  const maxResponses =
    typeof input.maxResponses === "number" && input.maxResponses > 0
      ? Math.min(input.maxResponses, 25)
      : 10;

  const broadcast = await executeTool(
    "mesh.intro.broadcast_search",
    {
      requestedSensitivity: "public",
      maxResponses,
      ttl: 1,
    },
    context,
    input.vaultSearchFn,
  );

  return {
    ok: broadcast.ok,
    error: broadcast.ok ? undefined : broadcast.error,
    broadcastOk: broadcast.ok,
  };
}

export function buildFriendAutopilotActivityRecord(input: {
  correlationId: string;
  ok: boolean;
  trigger: "scheduled" | "manual";
  error?: string;
}): AgentActivityRecord {
  const label = input.trigger === "scheduled" ? "Scheduled" : "Manual";
  const summary = input.ok
    ? `${label} friend autopilot pass completed (broadcast search)`
    : `${label} friend autopilot pass failed${input.error ? `: ${input.error}` : ""}`;
  return {
    activityId: randomUUID(),
    correlationId: input.correlationId,
    domain: "social",
    kind: "friend_autopilot_pass",
    summary,
    createdAt: new Date().toISOString(),
  };
}
