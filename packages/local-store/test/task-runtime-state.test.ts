import { createUnsignedMandate, type Mandate } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskRuntimeStateStore } from "../src/task-runtime-state.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-task-runtime-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("task runtime state store", () => {
  it("records mandate termination metadata and task lifecycle", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-1",
      expiresAt: "2026-12-31T23:59:59.000Z",
      closeOnFirstCompletedResult: true,
    });
    const mandate: Mandate = { ...unsigned, signature: "test-signature" };

    await store.recordMandateTermination(mandate, "task-1");

    await expect(store.getMandateTermination("mandate-1")).resolves.toMatchObject({
      taskId: "task-1",
      expiresAt: "2026-12-31T23:59:59.000Z",
      closeOnFirstCompletedResult: true,
    });

    await store.markTaskCancelled("task-1");
    await expect(store.getTaskLifecycle("task-1")).resolves.toBe("cancelled");

    await store.markTaskSatisfied("task-2");
    await expect(store.getTaskLifecycle("task-2")).resolves.toBe("satisfied");
  });

  it("records collectCompletedResults and increments completed result counts", async () => {
    const store = createTaskRuntimeStateStore(profileDir);
    const unsigned = createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a book.",
      mandateId: "mandate-collect",
      expiresAt: "2026-12-31T23:59:59.000Z",
      collectCompletedResults: 3,
    });
    const mandate: Mandate = { ...unsigned, signature: "test-signature" };

    await store.recordMandateTermination(mandate, "task-collect");

    await expect(store.getMandateTermination("mandate-collect")).resolves.toMatchObject({
      collectCompletedResults: 3,
    });

    await expect(store.incrementCompletedResultCount("task-collect")).resolves.toBe(1);
    await expect(store.incrementCompletedResultCount("task-collect")).resolves.toBe(2);
    await expect(store.incrementCompletedResultCount("task-collect")).resolves.toBe(3);
  });
});
