/**
 * Phase 60B — signed worker lease payload schemas + role policy.
 */
import { describe, expect, it } from "vitest";
import {
  AgentWorkerLeasePayloadSchema,
  AgentWorkerLeaseRequestPayloadSchema,
  AgentWorkerLeaseRevokePayloadSchema,
  EnvoyIntentSchema,
  createAgentWorkerLeasePayload,
  evaluateEnvelopeRolePolicy,
  parseAgentWorkerLeasePayload,
  parseAgentWorkerLeaseRequestPayload,
  parseAgentWorkerLeaseRevokePayload,
  type EnvoyActorRole,
  type EnvoyIntent,
} from "../src/index.js";

function probe(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  return evaluateEnvelopeRolePolicy(intent, sender, recipient);
}

function expectAllowed(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  expect(probe(intent, sender, recipient).ok, intent).toBe(true);
}

function expectDenied(intent: EnvoyIntent, sender: EnvoyActorRole, recipient: EnvoyActorRole) {
  expect(probe(intent, sender, recipient).ok, intent).toBe(false);
}

const validLease = {
  leaseId: "lease_1",
  workerPeerId: "envoy_worker_abc",
  ownerId: "envoy:owner:abc",
  issuedAt: "2030-01-01T00:00:00.000Z",
  notBefore: "2030-01-01T00:00:00.000Z",
  expiresAt: "2030-01-01T00:00:30.000Z",
  sequence: 1,
  runtimes: [
    {
      runtime: "envoy-harness" as const,
      ready: true,
      capacity: { maxConcurrent: 2, availableSlots: 1, queueDepth: 0 },
      skillIds: ["research"],
    },
  ],
  connectivity: { direct: true, relay: false },
  nonce: "0123456789abcdef",
};

describe("agent.worker.lease role policy", () => {
  const leaseIntents = [
    "agent.worker.lease",
    "agent.worker.lease.revoke",
    "agent.worker.lease.request",
  ] as const;

  it("registers all three lease intents in EnvoyIntentSchema", () => {
    for (const intent of leaseIntents) {
      expect(EnvoyIntentSchema.options).toContain(intent);
    }
  });

  it("allows agent↔agent only", () => {
    for (const intent of leaseIntents) {
      expectAllowed(intent, "agent", "agent");
      expectDenied(intent, "human", "human");
      expectDenied(intent, "human", "agent");
      expectDenied(intent, "agent", "human");
      expectDenied(intent, "system", "agent");
    }
  });
});

describe("AgentWorkerLeasePayloadSchema", () => {
  it("parses a valid lease", () => {
    const lease = createAgentWorkerLeasePayload(validLease);
    expect(lease.leaseId).toBe("lease_1");
    expect(lease.runtimes[0]?.runtime).toBe("envoy-harness");
  });

  it("rejects a short nonce (replay/entropy floor)", () => {
    const result = AgentWorkerLeasePayloadSchema.safeParse({
      ...validLease,
      nonce: "tooshort",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty runtimes list", () => {
    const result = AgentWorkerLeasePayloadSchema.safeParse({
      ...validLease,
      runtimes: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects capacity above hard caps", () => {
    const result = AgentWorkerLeasePayloadSchema.safeParse({
      ...validLease,
      runtimes: [
        {
          ...validLease.runtimes[0],
          capacity: { maxConcurrent: 99, availableSlots: 99, queueDepth: 0 },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid skill ids", () => {
    expect(() =>
      parseAgentWorkerLeasePayload({
        ...validLease,
        runtimes: [
          {
            ...validLease.runtimes[0],
            skillIds: ["Bad Skill"],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("AgentWorkerLeaseRevokePayloadSchema", () => {
  it("parses a valid revoke", () => {
    const revoke = parseAgentWorkerLeaseRevokePayload({
      leaseId: "lease_1",
      workerPeerId: "envoy_worker_abc",
      sequence: 2,
      revokedAt: "2030-01-01T00:00:10.000Z",
      reason: "engine_down",
    });
    expect(revoke.sequence).toBe(2);
  });

  it("rejects a missing sequence", () => {
    expect(
      AgentWorkerLeaseRevokePayloadSchema.safeParse({
        leaseId: "lease_1",
        workerPeerId: "envoy_worker_abc",
        revokedAt: "2030-01-01T00:00:10.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("AgentWorkerLeaseRequestPayloadSchema", () => {
  it("parses a request with optional runtime filter", () => {
    const req = parseAgentWorkerLeaseRequestPayload({
      requestId: "req_1",
      runtime: "openclaw",
      requestedAt: "2030-01-01T00:00:00.000Z",
    });
    expect(req.runtime).toBe("openclaw");
  });

  it("rejects unknown runtime filters", () => {
    expect(
      AgentWorkerLeaseRequestPayloadSchema.safeParse({
        requestId: "req_1",
        runtime: "not-a-runtime",
        requestedAt: "2030-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
