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
