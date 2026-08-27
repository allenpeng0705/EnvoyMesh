/**
 * Phase 60B — inbound lease handler binding + schema checks.
 */
import { describe, expect, it } from "vitest";
import { createAgentWorkerLeasePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { handleInboundWorkerLease } from "../src/agent-worker-lease-inbound.js";
import { WorkerLeaseStore } from "../src/worker-lease-store.js";

function leaseEnvelope(
  workerPeerId: string,
  overrides: Partial<ReturnType<typeof createAgentWorkerLeasePayload>> = {},
) {
  const now = Date.parse("2030-01-01T00:00:00.000Z");
  const lease = createAgentWorkerLeasePayload({
    leaseId: "lease_1",
    workerPeerId,
    ownerId: "envoy:owner:a",
    issuedAt: new Date(now).toISOString(),
    notBefore: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    sequence: 1,
    runtimes: [
      {
        runtime: "openclaw",
        ready: true,
        capacity: { maxConcurrent: 1, availableSlots: 1, queueDepth: 0 },
        skillIds: ["research"],
      },
    ],
    connectivity: { direct: true, relay: false },
    nonce: "0123456789abcdef",
    ...overrides,
  });
  return {
    ...createUnsignedEnvelope({
      senderPeerId: workerPeerId,
      senderPublicKey: "pk",
      senderRole: "agent",
      recipientRole: "agent",
      intent: "agent.worker.lease",
      payload: lease,
    }),
    signature: "stub",
  };
}

describe("handleInboundWorkerLease", () => {
  it("stores a lease when sender matches workerPeerId", async () => {
    const store = new WorkerLeaseStore();
    const result = await handleInboundWorkerLease({
      envelope: leaseEnvelope("envoy_worker_a"),
      store,
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      isBondedOwner: () => true,
    });
    expect(result).toMatchObject({ handled: true, kind: "lease" });
    expect(store.getAvailability("envoy_worker_a", new Date("2030-01-01T00:00:05.000Z")).state).toBe(
      "ready",
    );
  });

  it("rejects workerPeerId spoofing", async () => {
    const store = new WorkerLeaseStore();
    const envelope = leaseEnvelope("envoy_worker_a");
    envelope.payload = createAgentWorkerLeasePayload({
      ...(envelope.payload as ReturnType<typeof createAgentWorkerLeasePayload>),
      workerPeerId: "envoy_worker_other",
      nonce: "aaaaaaaaaaaaaaaa",
    });
    const result = await handleInboundWorkerLease({
      envelope,
      store,
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      isBondedOwner: () => true,
    });
    expect(result).toMatchObject({ handled: false, reason: "worker_peer_mismatch" });
    expect(store.size()).toBe(0);
  });

  it("rejects owner credential mismatch", async () => {
    const store = new WorkerLeaseStore();
    const envelope = leaseEnvelope("envoy_worker_a");
    (envelope as { agentCredential?: { ownerId: string } }).agentCredential = {
      ownerId: "envoy:owner:other",
    };
    const result = await handleInboundWorkerLease({
      envelope,
      store,
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      isBondedOwner: () => true,
    });
    expect(result).toMatchObject({ handled: false, reason: "owner_credential_mismatch" });
  });

  it("rejects unbonded owners", async () => {
    const store = new WorkerLeaseStore();
    const result = await handleInboundWorkerLease({
      envelope: leaseEnvelope("envoy_worker_a"),
      store,
      now: () => new Date("2030-01-01T00:00:05.000Z"),
      isBondedOwner: () => false,
    });
    expect(result).toMatchObject({ handled: false, reason: "owner_not_bonded" });
  });

  it("invokes onLeaseRequest for agent.worker.lease.request", async () => {
    const store = new WorkerLeaseStore();
    let seen: string | undefined;
    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "envoy_assigner",
        senderPublicKey: "pk",
        senderRole: "agent",
        recipientRole: "agent",
        intent: "agent.worker.lease.request",
        payload: {
          requestId: "req_1",
          requestedAt: "2030-01-01T00:00:00.000Z",
        },
      }),
      signature: "stub",
    };
    const result = await handleInboundWorkerLease({
      envelope,
      store,
      onLeaseRequest: ({ requestId }) => {
        seen = requestId;
      },
    });
    expect(result).toMatchObject({ handled: true, kind: "request" });
    expect(seen).toBe("req_1");
  });
});
