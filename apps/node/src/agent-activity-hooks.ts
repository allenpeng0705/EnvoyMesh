import { randomUUID } from "node:crypto";
import type { Report } from "@envoymesh/protocol";
import {
  mapOwnerReportToActivity,
  mapTaskJournalToActivity,
  resolveReportContactOwnerId,
} from "@envoymesh/api";
import type { AgentActivityKind, AgentActivityRecord, LocalAgentActivityStore } from "@envoymesh/local-store";
import type { DispatcherDecision } from "./task-dispatcher.js";

export { mapOwnerReportToActivity as ownerReportActivity, mapTaskJournalToActivity as activityFromTaskJournal };

export async function recordTaskJournalActivity(
  store: LocalAgentActivityStore,
  decision: Extract<DispatcherDecision, { action: "handled" }>,
  envelope: {
    messageId: string;
    correlationId?: string;
    senderPeerId: string;
    senderRole: string;
  },
  emit?: (record: AgentActivityRecord) => void,
): Promise<AgentActivityRecord> {
  const record = mapTaskJournalToActivity(decision.journalEntry, envelope, randomUUID());
  const saved = await store.append(record);
  emit?.(saved);
  return saved;
}

/**
 * Phase 23B — Record a connection suggestion Activity event.
 */
export async function recordConnectionSuggestion(
  store: LocalAgentActivityStore,
  input: {
    remoteOwnerId: string;
    remoteDisplayName?: string;
    reason: string;
    relevanceScore: number;
  },
  localOwnerId: string,
  emit?: (record: AgentActivityRecord) => void,
): Promise<AgentActivityRecord> {
  const record: AgentActivityRecord = {
    activityId: randomUUID(),
    domain: "social",
    kind: "report_received",
    summary: `Suggested connection to ${input.remoteDisplayName ?? input.remoteOwnerId}: ${input.reason} (score: ${input.relevanceScore.toFixed(2)})`,
    remoteOwnerId: input.remoteOwnerId,
    createdAt: new Date().toISOString(),
  };
  const saved = await store.append(record);
  emit?.(saved);
  return saved;
}

/**
 * Phase 24A — Record task negotiation lifecycle Activity events.
 */
export async function recordTaskNegotiationActivity(
  store: LocalAgentActivityStore,
  input: {
    kind: "task_negotiation_started" | "task_negotiation_completed" | "task_negotiation_failed";
    correlationId: string;
    taskObjective: string;
    remoteOwnerId?: string;
    providerCount?: number;
    acceptedBy?: string;
    error?: string;
  },
  localOwnerId: string,
  emit?: (record: AgentActivityRecord) => void,
): Promise<AgentActivityRecord> {
  const activityKind: AgentActivityKind =
    input.kind === "task_negotiation_started" ? "task_started" :
    input.kind === "task_negotiation_completed" ? "task_completed" : "task_failed";
  const summary =
    input.kind === "task_negotiation_started"
      ? `Task negotiation started: "${input.taskObjective}" → ${input.providerCount ?? 0} providers`
    : input.kind === "task_negotiation_completed"
      ? `Task negotiation completed: "${input.taskObjective}" accepted by ${input.acceptedBy ?? "unknown"}`
      : `Task negotiation failed: "${input.taskObjective}" — ${input.error ?? "no providers accepted"}`;

  const record: AgentActivityRecord = {
    activityId: randomUUID(),
    domain: "home",
    kind: activityKind,
    summary,
    correlationId: input.correlationId,
    remoteOwnerId: input.remoteOwnerId,
    createdAt: new Date().toISOString(),
  };
  const saved = await store.append(record);
  emit?.(saved);
  return saved;
}

/**
 * Phase 25A — Record a mesh awareness insight Activity event.
 */
export async function recordMeshAwarenessInsight(
  store: LocalAgentActivityStore,
  input: {
    kind: string;
    summary: string;
    matchedTopic: string;
    peerCount: number;
  },
  localOwnerId: string,
  emit?: (record: AgentActivityRecord) => void,
): Promise<AgentActivityRecord> {
  const record: AgentActivityRecord = {
    activityId: randomUUID(),
    domain: "research",
    kind: "report_received",
    summary: input.summary,
    createdAt: new Date().toISOString(),
  };
  const saved = await store.append(record);
  emit?.(saved);
  return saved;
}

export async function emitOwnerReport(
  store: LocalAgentActivityStore,
  report: Report,
  localOwnerId: string,
  emit?: (record: AgentActivityRecord) => void,
): Promise<AgentActivityRecord> {
  const record = mapOwnerReportToActivity(report, randomUUID(), localOwnerId);
  const saved = await store.append(record);
  emit?.(saved);
  return saved;
}
