/**
 * Phase 60B — signed short-lived worker leases (availability source of truth).
 *
 * Design: docs/agent-network-next-generation-design.md §4
 * Checklist: docs/implementation-plan.md §Phase 60B
 *
 * Wire intents:
 * - `agent.worker.lease` — advertise / refresh a lease
 * - `agent.worker.lease.revoke` — invalidate the current lease
 * - `agent.worker.lease.request` — ask a peer to publish a fresh lease
 */
import { z } from "zod";

import { AgentRuntimeSchema, SkillIdSchema } from "./agent-adapter.js";

export const AgentWorkerLeaseRuntimeSchema = z.object({
  runtime: AgentRuntimeSchema,
  runtimeVersion: z.string().min(1).max(64).optional(),
  modelFamily: z.string().min(1).max(64).optional(),
  /** Salted hash of the exact model id — never the raw provider model string. */
  modelIdHash: z.string().min(1).max(128).optional(),
  ready: z.boolean(),
  capacity: z.object({
    maxConcurrent: z.number().int().min(0).max(32),
    availableSlots: z.number().int().min(0).max(32),
    queueDepth: z.number().int().min(0).max(10_000),
  }),
  skillIds: z.array(SkillIdSchema).max(128),
});

export type AgentWorkerLeaseRuntime = z.infer<typeof AgentWorkerLeaseRuntimeSchema>;

/** `agent.worker.lease` — fresh availability claim from a worker agent. */
export const AgentWorkerLeasePayloadSchema = z.object({
  leaseId: z.string().min(1).max(128),
  workerPeerId: z.string().min(1).max(256),
  ownerId: z.string().min(1).max(256),
  issuedAt: z.string().datetime(),
  notBefore: z.string().datetime(),
  expiresAt: z.string().datetime(),
  sequence: z.number().int().nonnegative(),
  runtimes: z.array(AgentWorkerLeaseRuntimeSchema).min(1).max(16),
  connectivity: z.object({
    direct: z.boolean(),
    relay: z.boolean(),
  }),
  nonce: z.string().min(16).max(128),
});

export type AgentWorkerLeasePayload = z.infer<typeof AgentWorkerLeasePayloadSchema>;

/** `agent.worker.lease.revoke` — immediately invalidate a lease sequence. */
export const AgentWorkerLeaseRevokePayloadSchema = z.object({
  leaseId: z.string().min(1).max(128),
  workerPeerId: z.string().min(1).max(256),
  sequence: z.number().int().nonnegative(),
  revokedAt: z.string().datetime(),
  reason: z.string().min(1).max(256).optional(),
});

export type AgentWorkerLeaseRevokePayload = z.infer<
  typeof AgentWorkerLeaseRevokePayloadSchema
>;

/** `agent.worker.lease.request` — ask a peer to publish/refresh a lease. */
export const AgentWorkerLeaseRequestPayloadSchema = z.object({
  requestId: z.string().min(1).max(128),
  /** Optional runtime filter; omit to request all advertised runtimes. */
  runtime: AgentRuntimeSchema.optional(),
  requestedAt: z.string().datetime(),
});

export type AgentWorkerLeaseRequestPayload = z.infer<
  typeof AgentWorkerLeaseRequestPayloadSchema
>;

export function createAgentWorkerLeasePayload(
  input: AgentWorkerLeasePayload,
): AgentWorkerLeasePayload {
  return AgentWorkerLeasePayloadSchema.parse(input);
}

export function parseAgentWorkerLeasePayload(input: unknown): AgentWorkerLeasePayload {
  return AgentWorkerLeasePayloadSchema.parse(input);
}

export function createAgentWorkerLeaseRevokePayload(
  input: AgentWorkerLeaseRevokePayload,
): AgentWorkerLeaseRevokePayload {
  return AgentWorkerLeaseRevokePayloadSchema.parse(input);
}

export function parseAgentWorkerLeaseRevokePayload(
  input: unknown,
): AgentWorkerLeaseRevokePayload {
  return AgentWorkerLeaseRevokePayloadSchema.parse(input);
}

export function createAgentWorkerLeaseRequestPayload(
  input: AgentWorkerLeaseRequestPayload,
): AgentWorkerLeaseRequestPayload {
  return AgentWorkerLeaseRequestPayloadSchema.parse(input);
}

export function parseAgentWorkerLeaseRequestPayload(
  input: unknown,
): AgentWorkerLeaseRequestPayload {
  return AgentWorkerLeaseRequestPayloadSchema.parse(input);
}
