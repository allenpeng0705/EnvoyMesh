/**
 * Phase 60D — protocol-aware Team Job restart reconciliation.
 *
 * Design: docs/agent-network-next-generation-design.md §9
 * Checklist: docs/implementation-plan.md §Phase 60D
 *
 * Wire intents:
 * - `task.chain.reconcile.request` — assigner asks a worker for attempt receipts
 * - `task.chain.reconcile.response` — worker reports known attempt state / finals
 */
import { z } from "zod";

import { TaskChainPartialPayloadSchema } from "./agent-network.js";

export const ChainReconcileAttemptStateSchema = z.enum([
  "unknown",
  "accepted",
  "running",
  "final",
  "cancelled",
]);

export type ChainReconcileAttemptState = z.infer<typeof ChainReconcileAttemptStateSchema>;

export const ChainReconcileKnownAttemptSchema = z.object({
  attemptId: z.string().min(1).max(128),
  subtaskId: z.string().min(1).max(128),
  lastKnownState: z.string().min(1).max(64),
  lastPartialSeq: z.number().int().nonnegative().optional(),
});

export type ChainReconcileKnownAttempt = z.infer<typeof ChainReconcileKnownAttemptSchema>;

/** `task.chain.reconcile.request` — assigner → worker after restore. */
export const TaskChainReconcileRequestPayloadSchema = z.object({
  chainId: z.string().min(1).max(128),
  orchestratorEpoch: z.string().min(1).max(128),
  knownAttempts: z.array(ChainReconcileKnownAttemptSchema).max(256),
  requestedAt: z.string().datetime(),
});

export type TaskChainReconcileRequestPayload = z.infer<
  typeof TaskChainReconcileRequestPayloadSchema
>;

export const ChainReconcileAttemptReportSchema = z.object({
  attemptId: z.string().min(1).max(128),
  subtaskId: z.string().min(1).max(128),
  state: ChainReconcileAttemptStateSchema,
  lastPartialSeq: z.number().int().nonnegative().optional(),
  finalPartial: TaskChainPartialPayloadSchema.optional(),
  artifactHashes: z.array(z.string().min(1).max(128)).max(64).optional(),
});

export type ChainReconcileAttemptReport = z.infer<typeof ChainReconcileAttemptReportSchema>;

/** `task.chain.reconcile.response` — worker → assigner. */
export const TaskChainReconcileResponsePayloadSchema = z.object({
  chainId: z.string().min(1).max(128),
  workerEpoch: z.string().min(1).max(128),
  attempts: z.array(ChainReconcileAttemptReportSchema).max(256),
  respondedAt: z.string().datetime(),
});

export type TaskChainReconcileResponsePayload = z.infer<
  typeof TaskChainReconcileResponsePayloadSchema
>;

export function createTaskChainReconcileRequestPayload(
  input: TaskChainReconcileRequestPayload,
): TaskChainReconcileRequestPayload {
  return TaskChainReconcileRequestPayloadSchema.parse(input);
}

export function parseTaskChainReconcileRequestPayload(
  input: unknown,
): TaskChainReconcileRequestPayload {
  return TaskChainReconcileRequestPayloadSchema.parse(input);
}

export function createTaskChainReconcileResponsePayload(
  input: TaskChainReconcileResponsePayload,
): TaskChainReconcileResponsePayload {
  return TaskChainReconcileResponsePayloadSchema.parse(input);
}

export function parseTaskChainReconcileResponsePayload(
  input: unknown,
): TaskChainReconcileResponsePayload {
  return TaskChainReconcileResponsePayloadSchema.parse(input);
}
