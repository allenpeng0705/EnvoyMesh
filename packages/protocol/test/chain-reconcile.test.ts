/**
 * Phase 60D — chain reconcile payload schemas + role policy.
 */
import { describe, expect, it } from "vitest";
import {
  EnvoyIntentSchema,
  TaskChainReconcileRequestPayloadSchema,
  TaskChainReconcileResponsePayloadSchema,
  createTaskChainReconcileRequestPayload,
  createTaskChainReconcileResponsePayload,
  evaluateEnvelopeRolePolicy,
  parseTaskChainReconcileRequestPayload,
  parseTaskChainReconcileResponsePayload,
  type EnvoyActorRole,
  type EnvoyIntent,
} from "../src/index.js";

function probe(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  return evaluateEnvelopeRolePolicy(intent, sender, recipient);
}

const validRequest = {
  chainId: "chain_1",
  orchestratorEpoch: "epoch_assigner_1",
  knownAttempts: [
    {
      attemptId: "attempt_1",
      subtaskId: "step_1",
      lastKnownState: "running",
      lastPartialSeq: 1,
    },
  ],
  requestedAt: "2030-01-01T00:00:00.000Z",
};

const validResponse = {
  chainId: "chain_1",
  workerEpoch: "epoch_worker_1",
  attempts: [
    {
      attemptId: "attempt_1",
      subtaskId: "step_1",
      state: "running" as const,
      lastPartialSeq: 2,
    },
  ],
  respondedAt: "2030-01-01T00:00:01.000Z",
};

describe("chain-reconcile schemas", () => {
  it("registers reconcile intents", () => {
    expect(EnvoyIntentSchema.options).toContain("task.chain.reconcile.request");
    expect(EnvoyIntentSchema.options).toContain("task.chain.reconcile.response");
  });

  it("allows agent↔agent only", () => {
    for (const intent of [
      "task.chain.reconcile.request",
      "task.chain.reconcile.response",
    ] as EnvoyIntent[]) {
      expect(probe(intent, "agent", "agent").ok).toBe(true);
      expect(probe(intent, "human", "agent").ok).toBe(false);
      expect(probe(intent, "agent", "human").ok).toBe(false);
    }
  });

  it("parses request/response round-trip", () => {
    const req = createTaskChainReconcileRequestPayload(validRequest);
    expect(parseTaskChainReconcileRequestPayload(req)).toEqual(req);
    expect(TaskChainReconcileRequestPayloadSchema.safeParse({ ...req, chainId: "" }).success).toBe(
      false,
    );

    const res = createTaskChainReconcileResponsePayload(validResponse);
    expect(parseTaskChainReconcileResponsePayload(res)).toEqual(res);
    expect(
      TaskChainReconcileResponsePayloadSchema.safeParse({
        ...res,
        attempts: [{ ...res.attempts[0], state: "bogus" }],
      }).success,
    ).toBe(false);
  });
});
