import { createTaskRuntimeStateStore } from "@envoymesh/local-store";
import {
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskProposePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type Mandate,
  type ProofOfIntent,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTaskRuntimeAfterHandled, guardInboundTaskRuntime } from "../src/task-runtime-guard.js";

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

// ============================================================================
// PHASE 9: TTL ENFORCEMENT TESTS
// ============================================================================

describe("TTL enforcement (Phase 9)", () => {
  it("accepts task.mandate when TTL is valid (ttl=1)", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-ttl-valid",
      expiresAt: "2027-01-01T00:00:00.000Z",
      ttl: 1,
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    const envelope = signedTaskEnvelope("task.mandate", createTaskMandatePayload(mandate, { taskId: "task-ttl-valid" }));

    const gate = await guardInboundTaskRuntime({ envelope, store });

    expect(gate.ok).toBe(true);
  });

  it("accepts task.mandate when TTL uses default (3)", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-ttl-default",
      expiresAt: "2027-01-01T00:00:00.000Z",
      // ttl not specified - defaults to 3
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    const envelope = signedTaskEnvelope("task.mandate", createTaskMandatePayload(mandate, { taskId: "task-ttl-default" }));

    const gate = await guardInboundTaskRuntime({ envelope, store });

    expect(gate.ok).toBe(true);
  });

  it("non-mandate intents are not rejected for TTL (only task.mandate checks TTL)", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // task.propose should pass even without mandate attached (guard catches exceptions)
    const envelope = signedTaskEnvelope(
      "task.propose",
      createTaskProposePayload({
        taskId: "task-propose-no-mandate",
        mandateId: "nonexistent-mandate",
        proofOfIntent: testProofOfIntent("task.propose"),
        objective: "Find a book.",
        requestedResult: "One title.",
      }),
    );

    const gate = await guardInboundTaskRuntime({ envelope, store });

    // The guard returns ok:true because parsing fails and is caught
    expect(gate.ok).toBe(true);
  });
});

// ============================================================================
// PHASE 9: COLLECT-N AND CLOSE-ON-FIRST COMPLETED RESULT TESTS
// ============================================================================

describe("applyTaskRuntimeAfterHandled (Phase 9)", () => {
  it("marks task as cancelled when handling task.cancel", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // First record a mandate to create the task
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-cancel-test",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-cancel");

    const { createTaskCancelPayload } = await import("@envoymesh/protocol");
    const decision = {
      action: "handled" as const,
      intent: "task.cancel" as const,
      taskId: "task-cancel",
      mandateId: "mandate-cancel-test",
    };

    const envelope = signedTaskEnvelope(
      "task.cancel",
      createTaskCancelPayload({
        taskId: "task-cancel",
        mandateId: "mandate-cancel-test",
        reason: "Owner stopped the task.",
        cancelledBy: "owner",
        createdAt: new Date().toISOString(),
      }),
    );

    await applyTaskRuntimeAfterHandled({ decision, envelope, store });

    const lifecycle = await store.getTaskLifecycle("task-cancel");
    expect(lifecycle).toBe("cancelled");
  });

  it("closes task on first completed result when closeOnFirstCompletedResult=true", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // Create mandate with closeOnFirstCompletedResult
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-close-first",
      expiresAt: "2027-01-01T00:00:00.000Z",
      closeOnFirstCompletedResult: true,
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-close-first");

    const decision = {
      action: "handled" as const,
      intent: "task.result" as const,
      taskId: "task-close-first",
      mandateId: "mandate-close-first",
    };

    const envelope = signedTaskEnvelope(
      "task.result",
      createTaskResultPayload({
        taskId: "task-close-first",
        mandateId: "mandate-close-first",
        status: "completed",
        summary: "Found the book!",
      }),
    );

    await applyTaskRuntimeAfterHandled({ decision, envelope, store });

    const lifecycle = await store.getTaskLifecycle("task-close-first");
    expect(lifecycle).toBe("satisfied");
  });

  it("keeps task open until collectN results when collectCompletedResults is set", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // Create mandate with collectCompletedResults: 3
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-collect-3",
      expiresAt: "2027-01-01T00:00:00.000Z",
      collectCompletedResults: 3,
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-collect-3");

    const makeResultEnvelope = (resultNum: number) => ({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "public-key",
        intent: "task.result" as const,
        payload: createTaskResultPayload({
          taskId: "task-collect-3",
          mandateId: "mandate-collect-3",
          status: "completed" as const,
          summary: `Result ${resultNum}`,
        }),
        createdAt: new Date().toISOString(),
        messageId: `message-result-${resultNum}`,
      }),
      signature: "signature",
    });

    // First result - should NOT satisfy yet
    await applyTaskRuntimeAfterHandled({
      decision: { action: "handled", intent: "task.result", taskId: "task-collect-3", mandateId: "mandate-collect-3" },
      envelope: makeResultEnvelope(1),
      store,
    });
    expect(await store.getTaskLifecycle("task-collect-3")).not.toBe("satisfied");

    // Second result - should NOT satisfy yet
    await applyTaskRuntimeAfterHandled({
      decision: { action: "handled", intent: "task.result", taskId: "task-collect-3", mandateId: "mandate-collect-3" },
      envelope: makeResultEnvelope(2),
      store,
    });
    expect(await store.getTaskLifecycle("task-collect-3")).not.toBe("satisfied");

    // Third result - SHOULD satisfy
    await applyTaskRuntimeAfterHandled({
      decision: { action: "handled", intent: "task.result", taskId: "task-collect-3", mandateId: "mandate-collect-3" },
      envelope: makeResultEnvelope(3),
      store,
    });
    expect(await store.getTaskLifecycle("task-collect-3")).toBe("satisfied");
  });

  it("does not affect task when result status is not completed", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-incomplete",
      expiresAt: "2027-01-01T00:00:00.000Z",
      closeOnFirstCompletedResult: true,
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };
    await store.recordMandateTermination(mandate, "task-incomplete");

    const decision = {
      action: "handled" as const,
      intent: "task.result" as const,
      taskId: "task-incomplete",
      mandateId: "mandate-incomplete",
    };

    const envelope = signedTaskEnvelope(
      "task.result",
      createTaskResultPayload({
        taskId: "task-incomplete",
        mandateId: "mandate-incomplete",
        status: "partial", // Not completed
        summary: "Partial result",
      }),
    );

    await applyTaskRuntimeAfterHandled({ decision, envelope, store });

    const lifecycle = await store.getTaskLifecycle("task-incomplete");
    expect(lifecycle).not.toBe("satisfied");
  });

  it("ignores when decision action is not handled", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // This should not throw and should not modify any state
    await applyTaskRuntimeAfterHandled({
      decision: { action: "ignored", intent: "task.mandate", taskId: "task-x", mandateId: "mandate-x" },
      envelope: signedTaskEnvelope("task.mandate", createTaskMandatePayload({ mandateId: "x", signature: "x" } as Mandate, { taskId: "task-x" })),
      store,
    });

    // No termination should be recorded
    const termination = await store.getMandateTermination("mandate-x");
    expect(termination).toBeUndefined();
  });

  it("ignores when intent is not an A2A task intent", async () => {
    const store = createTaskRuntimeStateStore(profileDir);

    // This should not throw
    await applyTaskRuntimeAfterHandled({
      decision: { action: "handled", intent: "task.mandate", taskId: "task-x", mandateId: "mandate-x" },
      envelope: {
        ...createUnsignedEnvelope({
          senderPeerId: "peer-a",
          senderPublicKey: "public-key",
          intent: "chat.message" as any,
          payload: { text: "hello" },
          createdAt: new Date().toISOString(),
          messageId: "msg-x",
        }),
        signature: "signature",
      } as any,
      store,
    });

    // No error thrown means test passes
  });
});
