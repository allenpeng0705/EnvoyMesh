import { randomUUID } from "node:crypto";
import type { Report } from "@envoymesh/protocol";
import {
  mapOwnerReportToActivity,
  mapTaskJournalToActivity,
  resolveReportContactOwnerId,
} from "@envoymesh/api";
import type { AgentActivityRecord, LocalAgentActivityStore } from "@envoymesh/local-store";
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
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "agent",
    ownerId: localOwnerId,
    type: "connection_suggested",
    summary: `Suggested connection to ${input.remoteDisplayName ?? input.remoteOwnerId}: ${input.reason} (score: ${input.relevanceScore.toFixed(2)})`,
    remoteOwnerId: input.remoteOwnerId,
    connectionSuggestionReason: input.reason,
    connectionSuggestionScore: input.relevanceScore,
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
  let summary: string;
  switch (input.kind) {
    case "task_negotiation_started":
      summary = `Task negotiation started: "${input.taskObjective}" → ${input.providerCount ?? 0} providers`;
      break;
    case "task_negotiation_completed":
      summary = `Task negotiation completed: "${input.taskObjective}" accepted by ${input.acceptedBy ?? "unknown"}`;
      break;
    case "task_negotiation_failed":
      summary = `Task negotiation failed: "${input.taskObjective}" — ${input.error ?? "no providers accepted"}`;
      break;
  }

  const record: AgentActivityRecord = {
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "agent",
    ownerId: localOwnerId,
    type: input.kind,
    summary,
    correlationId: input.correlationId,
    remoteOwnerId: input.remoteOwnerId,
    taskNegotiationObjective: input.taskObjective,
    taskNegotiationProviderCount: input.providerCount,
    taskNegotiationAcceptedBy: input.acceptedBy,
    taskNegotiationError: input.error,
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
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "agent",
    ownerId: localOwnerId,
    type: "mesh_awareness_insight",
    summary: input.summary,
    meshInsightKind: input.kind,
    meshInsightTopic: input.matchedTopic,
    meshInsightPeerCount: input.peerCount,
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
