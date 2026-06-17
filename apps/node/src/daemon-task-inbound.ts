import {
  auditEventForDispatcherDecision,
  createAuditEvent,
  type LocalTaskStore,
  type TaskRuntimeStateStore,
} from "@envoymesh/local-store";
import { parseReportCreatePayload, parseTaskResultPayload, type EnvoyEnvelope } from "@envoymesh/protocol";
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

    // Phase 33: emit an extra audit event summarising the typed Artifacts of a task.result
    // envelope so observers can read artifact shape without re-parsing the wire payload.
    if (taskDecision.intent === "task.result") {
      try {
        const resultPayload = parseTaskResultPayload(input.envelope.payload);
        const artifactKinds = resultPayload.artifacts.map((a) => a.kind);
        await input.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "task.handled",
            intent: input.envelope.intent,
            taskId: taskDecision.taskId,
            mandateId: taskDecision.mandateId,
            messageId: input.envelope.messageId,
            correlationId: input.correlationId ?? taskDecision.taskId,
            remotePeerId: input.remotePeerId,
            direction: "inbound",
            verificationStatus: "verified",
            latencyMs: Date.now() - input.receivedAt,
            outcome: "record",
            summary: `task.result artifacts=${resultPayload.artifacts.length} kinds=[${artifactKinds.join(",")}]`,
            createdAt: input.envelope.createdAt,
          }),
        );
        // Phase 34: cache the full payload so the Activity drill-down can render the
        // typed Artifacts via getTaskResult(taskId). Best-effort: a parse failure or
        // write failure here must not abort the inbound — the audit event above is
        // the source of truth, and the journal entry already succeeded.
        await input.taskStore.recordTaskResult(resultPayload);
      } catch {
        // artifact audit / recordTaskResult is best-effort; the primary journal entry already succeeded
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
