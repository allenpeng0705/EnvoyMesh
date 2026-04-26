import { createTaskRuntimeStateStore } from "@envoymesh/local-store";
import {
  createTaskMandatePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type Mandate,
  type ProofOfIntent,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardInboundTaskRuntime } from "../src/task-runtime-guard.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-task-runtime-guard-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("task runtime inbound guard", () => {
  it("rejects task.propose when stored mandate window has expired", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-1",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-1");

    const envelope = signedTaskEnvelope(
      "task.propose",
      createTaskProposePayload({
        taskId: "task-1",
        mandateId: "mandate-1",
        proofOfIntent: testProofOfIntent("task.propose"),
        objective: "Find a book.",
        requestedResult: "One title.",
      }),
    );

    const gate = await guardInboundTaskRuntime({
      envelope,
      store,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });

    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain("expired");
    }
  });

  it("rejects when task lifecycle is cancelled", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-1",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-1");
    await store.markTaskCancelled("task-1");

    const envelope = signedTaskEnvelope(
      "task.propose",
      createTaskProposePayload({
        taskId: "task-1",
        mandateId: "mandate-1",
        proofOfIntent: testProofOfIntent("task.propose"),
        objective: "Find a book.",
        requestedResult: "One title.",
      }),
    );

    const gate = await guardInboundTaskRuntime({ envelope, store });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain("cancelled");
    }
  });

  it("rejects task.mandate when mandate wall clock is already past", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-expired",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    const envelope = signedTaskEnvelope("task.mandate", createTaskMandatePayload(mandate, { taskId: "task-x" }));

    const gate = await guardInboundTaskRuntime({
      envelope,
      store,
      now: new Date("2026-06-01T12:00:00.000Z"),
    });
    expect(gate.ok).toBe(false);
  });
});

function signedTaskEnvelope(intent: "task.mandate" | "task.propose", payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      intent,
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: `message-${intent}`,
    }),
    signature: "signature",
  };
}

function testProofOfIntent(requestIntent: "task.propose"): ProofOfIntent {
  return {
    version: "0.1",
    mandateId: "mandate-1",
    mandateHash: "hash-1",
    taskId: "task-1",
    requestIntent,
    nonce: "nonce-1",
    deviceId: "envoy:device:desktop",
    proof: "signature",
  };
}
