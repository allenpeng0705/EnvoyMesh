import { createTaskRuntimeStateStore } from "@envoymesh/local-store";
import {
  createTaskMandatePayload,
  createTaskResultPayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type Mandate,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTaskRuntimeAfterHandled } from "../src/task-runtime-guard.js";
import type { DispatcherDecision } from "../src/task-dispatcher.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-task-runtime-apply-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("applyTaskRuntimeAfterHandled collect-N", () => {
  it("marks satisfied only after enough completed results", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-c",
      expiresAt: "2027-12-31T23:59:59.000Z",
      collectCompletedResults: 2,
    });
    const mandate: Mandate = { ...unsigned, signature: "sig" };

    const mandateEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk",
        intent: "task.mandate",
        payload: createTaskMandatePayload(mandate, { taskId: "task-c" }),
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "mandate-msg",
      }),
      signature: "sig",
    };

    const mandateDecision: DispatcherDecision = {
      action: "handled",
      intent: "task.mandate",
      taskId: "task-c",
      mandateId: "mandate-c",
      state: "created",
      journalEntry: {
        version: "0.1",
        eventId: "e-m",
        taskId: "task-c",
        mandateId: "mandate-c",
        eventType: "mandate_attached",
        state: "created",
        summary: "mandate",
        createdAt: "2026-04-27T10:00:00.000Z",
      },
    };

    await applyTaskRuntimeAfterHandled({
      decision: mandateDecision,
      envelope: mandateEnvelope,
      store,
    });

    const resultPayload = createTaskResultPayload({
      taskId: "task-c",
      mandateId: "mandate-c",
      status: "completed",
      summary: "first",
    });

    const resultEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-b",
        senderPublicKey: "pk2",
        intent: "task.result",
        payload: resultPayload,
        createdAt: "2026-04-27T10:01:00.000Z",
        messageId: "result-1",
      }),
      signature: "sig2",
    };

    const resultDecision: DispatcherDecision = {
      action: "handled",
      intent: "task.result",
      taskId: "task-c",
      mandateId: "mandate-c",
      state: "completed",
      journalEntry: {
        version: "0.1",
        eventId: "e-r1",
        taskId: "task-c",
        mandateId: "mandate-c",
        eventType: "result_received",
        state: "completed",
        summary: "first",
        createdAt: "2026-04-27T10:01:00.000Z",
      },
    };

    await applyTaskRuntimeAfterHandled({
      decision: resultDecision,
      envelope: resultEnvelope,
      store,
    });
    await expect(store.getTaskLifecycle("task-c")).resolves.toBeUndefined();

    const resultPayload2 = createTaskResultPayload({
      taskId: "task-c",
      mandateId: "mandate-c",
      status: "completed",
      summary: "second",
    });

    const resultEnvelope2 = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-b",
        senderPublicKey: "pk2",
        intent: "task.result",
        payload: resultPayload2,
        createdAt: "2026-04-27T10:02:00.000Z",
        messageId: "result-2",
      }),
      signature: "sig3",
    };

    const resultDecision2: DispatcherDecision = {
      action: "handled",
      intent: "task.result",
      taskId: "task-c",
      mandateId: "mandate-c",
      state: "completed",
      journalEntry: {
        version: "0.1",
        eventId: "e-r2",
        taskId: "task-c",
        mandateId: "mandate-c",
        eventType: "result_received",
        state: "completed",
        summary: "second",
        createdAt: "2026-04-27T10:02:00.000Z",
      },
    };

    await applyTaskRuntimeAfterHandled({
      decision: resultDecision2,
      envelope: resultEnvelope2,
      store,
    });
    await expect(store.getTaskLifecycle("task-c")).resolves.toBe("satisfied");
  });
});
