import {
  auditEventForDispatcherDecision,
  createAuditEvent,
  type LocalTaskStore,
  type TaskRuntimeStateStore,
} from "@envoymesh/local-store";
import { parseReportCreatePayload, type EnvoyEnvelope } from "@envoymesh/protocol";
import { createTaskDispatcher, isA2ATaskIntent, type TaskDispatcher } from "@envoymesh/api";
import { applyTaskRuntimeAfterHandled, guardInboundTaskRuntime } from "./task-runtime-guard.js";
import type { NodeServiceImpl } from "./node-service-impl.js";
import type { DispatcherDecision } from "./task-dispatcher.js";

export type HandleDaemonTaskInboundResult =
  | { handled: false }
  | {
      handled: true;
      outcome: "rejected_runtime" | "handled" | "rejected_dispatch";
      taskDecision?: DispatcherDecision;
    };

/** Production A2A task inbound path shared by the node daemon and integration tests. */
export async function handleDaemonTaskInbound(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: LocalTaskStore;
  taskRuntimeStore: TaskRuntimeStateStore;
  taskDispatcher?: TaskDispatcher;
  nodeService?: NodeServiceImpl | null;
  senderOwnerId?: string;
}): Promise<HandleDaemonTaskInboundResult> {
  if (!isA2ATaskIntent(input.envelope.intent)) {
    return { handled: false };
  }

  const dispatcher = input.taskDispatcher ?? createTaskDispatcher();

  const runtimeGate = await guardInboundTaskRuntime({
    envelope: input.envelope,
    store: input.taskRuntimeStore,
  });
  if (!runtimeGate.ok) {
    await input.taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.rejected",
        intent: input.envelope.intent,
        messageId: input.envelope.messageId,
        correlationId: input.correlationId,
        remotePeerId: input.remotePeerId,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - input.receivedAt,
        outcome: "deny",
        summary: `Rejected task message: ${runtimeGate.reason}.`,
        createdAt: input.envelope.createdAt,
      }),
    );
    return { handled: true, outcome: "rejected_runtime" };
  }

  const taskDecision = await dispatcher.dispatch(input.envelope);
  if (taskDecision.action === "handled") {
    await input.taskStore.appendTaskJournalEntry(taskDecision.journalEntry);
    await input.taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: input.envelope.messageId,
        correlationId: input.correlationId,
        remotePeerId: input.remotePeerId,
        createdAt: input.envelope.createdAt,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - input.receivedAt,
      }),
    );
    await applyTaskRuntimeAfterHandled({
      decision: taskDecision,
      envelope: input.envelope,
      store: input.taskRuntimeStore,
    });

    if (input.nodeService) {
      await input.nodeService.recordInboundTaskActivity(taskDecision, input.envelope);
      if (taskDecision.intent === "report.create") {
        try {
          const reportPayload = parseReportCreatePayload(input.envelope.payload);
          await input.nodeService.emitLocalOwnerReport(reportPayload.report, {
            contactOwnerId:
              input.senderOwnerId ?? input.envelope.agentCredential?.ownerId,
          });
        } catch {
          // malformed report.create payload
        }
      }
    }

    return { handled: true, outcome: "handled", taskDecision };
  }

  if (taskDecision.action === "rejected") {
    await input.taskStore.appendAuditEvent(
      auditEventForDispatcherDecision(taskDecision, {
        messageId: input.envelope.messageId,
        correlationId: input.correlationId,
        remotePeerId: input.remotePeerId,
        createdAt: input.envelope.createdAt,
        direction: "inbound",
        verificationStatus: "rejected",
        latencyMs: Date.now() - input.receivedAt,
      }),
    );
    return { handled: true, outcome: "rejected_dispatch", taskDecision };
  }

  return { handled: false };
}
