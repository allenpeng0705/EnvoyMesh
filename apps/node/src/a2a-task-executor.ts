/**
 * Phase 48D.5 — Production A2A Task Bridge executor.
 *
 * Auth → Bonds gate → mint mandate + propose → daemon task inbound
 * (`guardInboundTaskRuntime` / journal / runtime store) → track for get/cancel.
 *
 * By default leaves tasks in `running` until a real `task.result` appears
 * (or the client cancels). Set `autoCompleteLocal: true` for smoke/demo
 * acceptance artifacts, and/or `waitForResultMs` to poll before returning.
 *
 * Optional `persistPath` atomically stores the a2aTaskId map so
 * `tasks/get` survives process restarts.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  A2AExecutorInput,
  A2AExecutorResult,
  A2AOwnedTaskLookup,
  A2ATaskBridgeExecutor,
  TaskDispatcher,
} from "@envoymesh/api";
import { evaluatePolicy, type BondLevel } from "@envoymesh/bonds";
import {
  createProofOfIntent,
  signMandate,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import type {
  LocalTaskStore,
  LocalTrustStore,
  NodeProfile,
  TaskRuntimeStateStore,
} from "@envoymesh/local-store";
import {
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createTextArtifact,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type AgentCredential,
  type Artifact,
} from "@envoymesh/protocol";
import { handleDaemonTaskInbound } from "./daemon-task-inbound.js";
import type { NodeServiceImpl } from "./node-service-impl.js";

/** Subset of NodeServiceImpl used by daemon inbound after task dispatch. */
export type A2AExecutorNodeService = Pick<
  NodeServiceImpl,
  "recordInboundTaskActivity" | "emitLocalOwnerReport"
>;

export interface ProductionA2ATaskExecutorOptions {
  profile: NodeProfile;
  taskDispatcher: TaskDispatcher;
  taskStore: LocalTaskStore;
  taskRuntimeStore: TaskRuntimeStateStore;
  /** Trust store for Bonds tier lookup. Without it, only the home owner (`self`) is allowed. */
  trustStore?: LocalTrustStore;
  /** Optional node service for inbound activity / owner reports. */
  nodeService?: A2AExecutorNodeService | null;
  agentPeerId: string;
  agentPublicKeyPem: string;
  agentPrivateKeyPem: string;
  agentCredential: AgentCredential;
  /** Poll for an external task.result before returning `running`. Default 0. */
  waitForResultMs?: number;
  /** Poll interval while waiting. Default 50. */
  pollIntervalMs?: number;
  /**
   * When no result appears within the wait window, record a local
   * completed TextArtifact summarizing mandate acceptance.
   * Default **false** (leave `running` for real mesh completion).
   */
  autoCompleteLocal?: boolean;
  /** Mandate TTL. Default 1 hour. */
  mandateTtlMs?: number;
  /**
   * Optional JSON file path for the a2aTaskId → tracked-task map.
   * Loaded on create; rewritten after each mutation (atomic rename).
   */
  persistPath?: string;
  now?: () => Date;
}

interface TrackedTask {
  ownerId: string;
  internalTaskId: string;
  mandateId: string;
  envoyState: A2AExecutorResult["envoyState"];
  summary: string;
  artifacts: Artifact[];
  createdAt: string;
}

function objectiveFromMessage(input: A2AExecutorInput): string {
  const texts: string[] = [];
  for (const part of input.message.parts) {
    if (part.kind === "text" && typeof part.text === "string") {
      texts.push(part.text);
    } else if (part.kind === "file") {
      texts.push(`[file ${part.file.name ?? part.file.uri ?? "attachment"}]`);
    } else if (part.kind === "data") {
      texts.push(`[data ${JSON.stringify(part.data).slice(0, 200)}]`);
    }
  }
  const joined = texts.join("\n").trim();
  return (joined || "A2A task").slice(0, 500);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function loadPersistedTasks(path: string): Promise<Map<string, TrackedTask>> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as {
      tasks?: Record<string, TrackedTask>;
    };
    const map = new Map<string, TrackedTask>();
    if (raw.tasks && typeof raw.tasks === "object") {
      for (const [id, t] of Object.entries(raw.tasks)) {
        if (t && typeof t.ownerId === "string" && typeof t.internalTaskId === "string") {
          map.set(id, t);
        }
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

async function savePersistedTasks(path: string, tasks: Map<string, TrackedTask>): Promise<void> {
  const obj: Record<string, TrackedTask> = {};
  for (const [id, t] of tasks) obj[id] = t;
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: "0.1", tasks: obj }, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

/**
 * Design §5.2: bearer ownerId must be self, direct, or referred.
 * Referred yields `approval_required` from evaluatePolicy for task intents;
 * the A2A bridge treats configured referred tokens as pre-approved for submit.
 */
export function authorizeA2ATaskSubmit(input: {
  ownerId: string;
  bondLevel: BondLevel;
}): { ok: true } | { ok: false; reason: string } {
  if (input.bondLevel === "blocked" || input.bondLevel === "public") {
    return {
      ok: false,
      reason: `bond tier "${input.bondLevel}" cannot submit A2A tasks (need self, direct, or referred)`,
    };
  }
  if (
    input.bondLevel !== "self" &&
    input.bondLevel !== "direct" &&
    input.bondLevel !== "referred"
  ) {
    return { ok: false, reason: `unsupported bond tier "${input.bondLevel}"` };
  }

  const decision = evaluatePolicy({
    peerId: input.ownerId,
    bondLevel: input.bondLevel,
    intent: "task.mandate",
    requestedSensitivity: "friends",
  });

  if (decision.action === "allow") return { ok: true };
  if (decision.action === "approval_required" && input.bondLevel === "referred") {
    return { ok: true };
  }
  if (decision.action === "deny" || decision.action === "approval_required") {
    return { ok: false, reason: decision.reason };
  }
  return { ok: false, reason: `challenge: ${decision.challengeType}` };
}

export function createProductionA2ATaskExecutor(
  options: ProductionA2ATaskExecutorOptions,
): A2ATaskBridgeExecutor {
  const {
    profile,
    taskDispatcher,
    taskStore,
    taskRuntimeStore,
    trustStore,
    nodeService = null,
    agentPeerId,
    agentPublicKeyPem,
    agentPrivateKeyPem,
    agentCredential,
    waitForResultMs = 0,
    pollIntervalMs = 50,
    autoCompleteLocal = false,
    mandateTtlMs = 60 * 60 * 1000,
    persistPath,
    now = () => new Date(),
  } = options;

  const tasks = new Map<string, TrackedTask>();
  let persistReady: Promise<void> = persistPath
    ? loadPersistedTasks(persistPath).then((loaded) => {
        for (const [id, t] of loaded) tasks.set(id, t);
      })
    : Promise.resolve();

  function toResult(t: TrackedTask): A2AExecutorResult {
    return {
      envoyState: t.envoyState,
      summary: t.summary,
      artifacts: t.artifacts,
    };
  }

  async function persist(): Promise<void> {
    if (!persistPath) return;
    try {
      await savePersistedTasks(persistPath, tasks);
    } catch {
      /* best-effort — getTask still works in-memory */
    }
  }

  async function setTask(a2aTaskId: string, tracked: TrackedTask): Promise<void> {
    tasks.set(a2aTaskId, tracked);
    await persist();
  }

  async function resolveBondLevel(ownerId: string): Promise<BondLevel> {
    if (ownerId === profile.owner.ownerId) return "self";
    if (!trustStore) return "public";
    const record = await trustStore.getTrustRecord(ownerId);
    return record?.level ?? "public";
  }

  async function authorizeOwner(ownerId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const bondLevel = await resolveBondLevel(ownerId);
    return authorizeA2ATaskSubmit({ ownerId, bondLevel });
  }

  async function ingestTaskEnvelope(envelope: Parameters<typeof handleDaemonTaskInbound>[0]["envelope"]) {
    return handleDaemonTaskInbound({
      envelope,
      remotePeerId: agentPeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore,
      taskRuntimeStore,
      taskDispatcher,
      nodeService: (nodeService ?? null) as NodeServiceImpl | null,
      senderOwnerId: profile.owner.ownerId,
    });
  }

  async function refreshFromStore(a2aTaskId: string, tracked: TrackedTask): Promise<TrackedTask> {
    const result = await taskStore.getTaskResult(tracked.internalTaskId);
    if (!result) return tracked;
    const artifacts: Artifact[] = Array.isArray(result.artifacts)
      ? (result.artifacts as Artifact[])
      : [];
    const summary =
      typeof result.summary === "string" && result.summary.trim()
        ? result.summary
        : tracked.summary;
    const status = result.status;
    let envoyState: A2AExecutorResult["envoyState"] = tracked.envoyState;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      envoyState = status;
    } else if (status === "running" || status === "partial") {
      envoyState = "running";
    }
    const updated: TrackedTask = {
      ...tracked,
      envoyState,
      summary,
      artifacts: artifacts.length > 0 ? artifacts : tracked.artifacts,
    };
    await setTask(a2aTaskId, updated);
    return updated;
  }

  return {
    async executeMessageSend(input) {
      await persistReady;
      const createdAt = now().toISOString();

      const auth = await authorizeOwner(input.ownerId);
      if (!auth.ok) {
        const denied: TrackedTask = {
          ownerId: input.ownerId,
          internalTaskId: `task-${randomUUID()}`,
          mandateId: `mandate-denied-${randomUUID()}`,
          envoyState: "auth-required",
          summary: `auth-required: ${auth.reason}`,
          artifacts: [],
          createdAt,
        };
        await setTask(input.a2aTaskId, denied);
        return toResult(denied);
      }

      const objective = objectiveFromMessage(input);
      const internalTaskId = `task-${randomUUID()}`;
      const mandateId = `mandate-${randomUUID()}`;
      const correlationId = input.a2aTaskId;

      // Mandate is always minted by the home owner (bridge host), not the A2A client.
      const unsignedMandate = createUnsignedMandate({
        mandateId,
        ownerId: profile.owner.ownerId,
        issuedToDeviceId: profile.device.deviceId,
        issuedToAgentId: agentCredential.agentId,
        taskIntent: "task.execute",
        objective,
        allowedActions: ["discover", "query", "negotiate", "report"],
        disallowedActions: ["raw_contact_exchange"],
        maxSensitivity: "friends",
        maxCost: { amount: 0, currency: "USD" },
        expiresAt: new Date(now().getTime() + mandateTtlMs).toISOString(),
      });
      const mandate = signMandate({ unsignedMandate, owner: profile.owner });

      const mandateEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: agentPeerId,
          senderPublicKey: agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: agentPeerId,
          recipientRole: "agent",
          intent: "task.mandate",
          payload: createTaskMandatePayload(mandate, { taskId: internalTaskId }),
          correlationId,
          agentCredential,
        }),
        agentPrivateKeyPem,
      );

      const mandateInbound = await ingestTaskEnvelope(mandateEnvelope);
      if (
        !mandateInbound.handled ||
        mandateInbound.outcome === "rejected_runtime" ||
        mandateInbound.outcome === "rejected_dispatch"
      ) {
        const summary =
          mandateInbound.handled && mandateInbound.taskDecision?.action === "rejected"
            ? `mandate rejected: ${mandateInbound.taskDecision.reason}`
            : `mandate rejected: ${mandateInbound.handled ? mandateInbound.outcome : "not handled"}`;
        const failed: TrackedTask = {
          ownerId: input.ownerId,
          internalTaskId,
          mandateId,
          envoyState: "failed",
          summary,
          artifacts: [],
          createdAt,
        };
        await setTask(input.a2aTaskId, failed);
        return toResult(failed);
      }

      const resolvedTaskId =
        (mandateInbound.taskDecision?.action === "handled"
          ? mandateInbound.taskDecision.taskId
          : undefined) || internalTaskId;

      const proofOfIntent = createProofOfIntent({
        mandate,
        taskId: resolvedTaskId,
        requestIntent: "task.propose",
        device: profile.device,
      });

      const proposeEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: agentPeerId,
          senderPublicKey: agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: agentPeerId,
          recipientRole: "agent",
          intent: "task.propose",
          payload: createTaskProposePayload({
            taskId: resolvedTaskId,
            mandateId,
            proofOfIntent,
            objective,
            requestedResult: "Concise completion summary",
          }),
          correlationId,
          agentCredential,
        }),
        agentPrivateKeyPem,
      );

      const proposeInbound = await ingestTaskEnvelope(proposeEnvelope);
      if (
        !proposeInbound.handled ||
        proposeInbound.outcome === "rejected_runtime" ||
        proposeInbound.outcome === "rejected_dispatch"
      ) {
        const summary =
          proposeInbound.handled && proposeInbound.taskDecision?.action === "rejected"
            ? `propose rejected: ${proposeInbound.taskDecision.reason}`
            : `propose rejected: ${proposeInbound.handled ? proposeInbound.outcome : "not handled"}`;
        const failed: TrackedTask = {
          ownerId: input.ownerId,
          internalTaskId: resolvedTaskId,
          mandateId,
          envoyState: "failed",
          summary,
          artifacts: [],
          createdAt,
        };
        await setTask(input.a2aTaskId, failed);
        return toResult(failed);
      }

      let tracked: TrackedTask = {
        ownerId: input.ownerId,
        internalTaskId: resolvedTaskId,
        mandateId,
        envoyState: "running",
        summary: `Mandate + propose accepted for: ${objective.slice(0, 120)}`,
        artifacts: [],
        createdAt,
      };
      await setTask(input.a2aTaskId, tracked);

      const deadline = now().getTime() + Math.max(0, waitForResultMs);
      while (now().getTime() < deadline) {
        tracked = await refreshFromStore(input.a2aTaskId, tracked);
        if (
          tracked.envoyState === "completed" ||
          tracked.envoyState === "failed" ||
          tracked.envoyState === "cancelled"
        ) {
          return toResult(tracked);
        }
        await sleep(pollIntervalMs);
      }

      if (autoCompleteLocal) {
        const artifact = createTextArtifact({
          content: `A2A task accepted.\n\nObjective:\n${objective}`,
          mimeType: "text/plain",
        });
        const resultPayload = createTaskResultPayload({
          taskId: tracked.internalTaskId,
          mandateId,
          status: "completed",
          summary: tracked.summary,
          artifacts: [artifact],
        });
        await taskStore.recordTaskResult(resultPayload);
        tracked = {
          ...tracked,
          envoyState: "completed",
          artifacts: [artifact],
        };
        await setTask(input.a2aTaskId, tracked);
        return toResult(tracked);
      }

      return toResult(tracked);
    },

    async getTask(input: A2AOwnedTaskLookup) {
      await persistReady;
      const tracked = tasks.get(input.a2aTaskId);
      if (!tracked) return null;
      if (tracked.ownerId !== input.ownerId) return null;
      const refreshed = await refreshFromStore(input.a2aTaskId, tracked);
      return toResult(refreshed);
    },

    async cancelTask(input: A2AOwnedTaskLookup) {
      await persistReady;
      const tracked = tasks.get(input.a2aTaskId);
      if (!tracked) {
        return {
          envoyState: "failed",
          summary: `task not found: ${input.a2aTaskId}`,
          artifacts: [],
        };
      }
      if (tracked.ownerId !== input.ownerId) {
        return {
          envoyState: "failed",
          summary: "forbidden: task belongs to another owner",
          artifacts: [],
        };
      }
      if (
        tracked.envoyState === "completed" ||
        tracked.envoyState === "failed" ||
        tracked.envoyState === "cancelled" ||
        tracked.envoyState === "auth-required"
      ) {
        return toResult(tracked);
      }

      const cancelEnvelope = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: agentPeerId,
          senderPublicKey: agentPublicKeyPem,
          senderRole: "agent",
          recipientPeerId: agentPeerId,
          recipientRole: "agent",
          intent: "task.cancel",
          payload: createTaskCancelPayload({
            taskId: tracked.internalTaskId,
            mandateId: tracked.mandateId,
            reason: "a2a tasks/cancel",
            cancelledBy: "owner",
          }),
          correlationId: input.a2aTaskId,
          agentCredential,
        }),
        agentPrivateKeyPem,
      );
      await ingestTaskEnvelope(cancelEnvelope);

      const cancelled: TrackedTask = {
        ...tracked,
        envoyState: "cancelled",
        summary: "Cancelled via A2A tasks/cancel",
      };
      await setTask(input.a2aTaskId, cancelled);
      return toResult(cancelled);
    },
  };
}
