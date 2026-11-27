/**
 * Phase 69D0 — build an owner-facing autonomy digest from Activity rows.
 */
import { isAutonomyActivityKind, type AgentActivityRecord } from "@envoymesh/api";
import {
  DigestGenerator,
  getDigestPeriodDates,
  type DigestSummary,
} from "./digest-generator.js";

export function summarizeAutonomyActivity(rows: AgentActivityRecord[]): {
  actionCounts: Record<string, number>;
  actionExamples: Record<string, string[]>;
  friendAutopilotPassCount: number;
  socialProxyTransitionCount: number;
  documentAcqStageCount: number;
  bondedResourceShortlistCount: number;
  headlines: string[];
} {
  const actionCounts: Record<string, number> = {};
  const actionExamples: Record<string, string[]> = {};
  let friendAutopilotPassCount = 0;
  let socialProxyTransitionCount = 0;
  let documentAcqStageCount = 0;
  let bondedResourceShortlistCount = 0;
  const headlines: string[] = [];

  for (const row of rows) {
    const kind = row.kind || "activity";
    actionCounts[kind] = (actionCounts[kind] ?? 0) + 1;
    if (!actionExamples[kind]) actionExamples[kind] = [];
    if (actionExamples[kind].length < 3 && row.summary) {
      actionExamples[kind].push(row.summary);
    }
    if (kind === "friend_autopilot_pass") friendAutopilotPassCount += 1;
    if (kind === "social_proxy_transition") socialProxyTransitionCount += 1;
    if (kind === "document_acq_stage") documentAcqStageCount += 1;
    if (kind === "bonded_resource_shortlist") bondedResourceShortlistCount += 1;
    if (isAutonomyActivityKind(kind) && row.summary && headlines.length < 12) {
      headlines.push(row.summary);
    }
  }

  return {
    actionCounts,
    actionExamples,
    friendAutopilotPassCount,
    socialProxyTransitionCount,
    documentAcqStageCount,
    bondedResourceShortlistCount,
    headlines,
  };
}

export async function buildAutonomyDigest(input: {
  generator: DigestGenerator;
  period: "daily" | "weekly";
  listActivity: (sinceIso: string) => Promise<AgentActivityRecord[]>;
}): Promise<DigestSummary & { headlines: string[]; socialProxyTransitionCount: number }> {
  const { start } = getDigestPeriodDates(input.period);
  const rows = await input.listActivity(start.toISOString());
  const stats = summarizeAutonomyActivity(rows);
  const digest = await input.generator.generateDigest(input.period, {
    actionCounts: stats.actionCounts,
    actionExamples: stats.actionExamples,
    a2aActivityCount: rows.length,
    friendAutopilotPassCount:
      stats.friendAutopilotPassCount + stats.socialProxyTransitionCount,
    meshInsights: stats.headlines.slice(0, 8).map((summary) => ({
      kind: "autonomy",
      summary,
      matchedTopic: "autonomy",
    })),
  });
  return {
    ...digest,
    headlines: stats.headlines,
    socialProxyTransitionCount: stats.socialProxyTransitionCount,
  };
}
