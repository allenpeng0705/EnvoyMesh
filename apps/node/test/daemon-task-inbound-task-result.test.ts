/**
 * Phase 34: verify that handleDaemonTaskInbound caches the typed `task.result`
 * payload via the new task-results store, and that a parse failure does NOT
 * abort the inbound (the audit event must still be appended).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalTaskStore, createTaskRuntimeStateStore } from "@envoymesh/local-store";
import { createTaskDispatcher } from "@envoymesh/api";
import {
  createTaskResultPayload,
  createTextArtifact,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { generateOwnerIdentity } from "@envoymesh/identity";
import { handleDaemonTaskInbound } from "../src/daemon-task-inbound.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let taskRuntimeStore: ReturnType<typeof createTaskRuntimeStateStore>;
let dispatcher: ReturnType<typeof createTaskDispatcher>;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-inbound-"));
  taskStore = createLocalTaskStore(profileDir);
  taskRuntimeStore = createTaskRuntimeStateStore(profileDir);
  dispatcher = createTaskDispatcher();
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

async function buildTaskResultEnvelope(taskId: string, summary: string): Promise<EnvoyEnvelope> {
  // The dispatcher does not verify signatures; build an unsigned envelope.
  const sender = await generateOwnerIdentity();
  const payload = createTaskResultPayload({
    taskId,
    status: "completed",
    summary,
    senderOwnerId: sender.ownerId,
    senderAgentPeerId: "envoy_agent:sender",
    recipientOwnerId: sender.ownerId,
    recipientAgentPeerId: "envoy_agent:recipient",
    artifacts: [createTextArtifact({ content: "hello world", mimeType: "text/plain" })],
  });
  return createUnsignedEnvelope({
    version: "0.1",
    messageId: `msg-${taskId}`,
    createdAt: new Date().toISOString(),
    senderPeerId: "envoy_peer:sender",
    senderPublicKey: sender.publicKeyPem,
    senderRole: "agent",
    recipientPeerId: "envoy_peer:recipient",
    recipientRole: "agent",
    intent: "task.result",
    payload,
  });
}

describe("handleDaemonTaskInbound — task.result caching (Phase 34)", () => {
  it("caches a well-formed task.result into the task-results store", async () => {
    const envelope = await buildTaskResultEnvelope("task-A", "first result");
    const result = await handleDaemonTaskInbound({
      envelope,
      remotePeerId: "envoy_peer:sender",
      receivedAt: Date.now(),
      correlationId: "corr-A",
      taskStore,
      taskRuntimeStore,
      taskDispatcher: dispatcher,
    });
    expect(result.handled).toBe(true);

    const cached = await taskStore.getTaskResult("task-A");
    expect(cached).toBeDefined();
    expect(cached?.summary).toBe("first result");
    expect(cached?.artifacts).toHaveLength(1);
    expect(cached?.artifacts[0]?.kind).toBe("text");
  });

  it("appends the audit event when the cache write throws", async () => {
    // Replace the store method to simulate a write failure.
    const recordSpy = vi
      .fn<Parameters<typeof taskStore.recordTaskResult>, Promise<void>>()
      .mockRejectedValue(new Error("simulated cache failure"));
    taskStore.recordTaskResult = recordSpy;

    const envelope = await buildTaskResultEnvelope("task-B", "second");
    // The call must NOT reject — the inbound's try/catch around parse + record
    // must absorb the simulated failure.
    await expect(
      handleDaemonTaskInbound({
        envelope,
        remotePeerId: "envoy_peer:sender",
        receivedAt: Date.now(),
        correlationId: "corr-B",
        taskStore,
        taskRuntimeStore,
        taskDispatcher: dispatcher,
      }),
    ).resolves.toBeDefined();

    // Audit events should still be present: at least one task.handled row.
    const audits = await taskStore.readAuditEvents();
    const types = audits.map((a) => a.type);
    expect(types).toContain("task.handled");
  });

  it("preserves the latest payload when a taskId arrives twice", async () => {
    const envelope1 = await buildTaskResultEnvelope("task-Dup", "v1");
    const envelope2 = await buildTaskResultEnvelope("task-Dup", "v2");
    await handleDaemonTaskInbound({
      envelope: envelope1,
      remotePeerId: "envoy_peer:sender",
      receivedAt: Date.now(),
      correlationId: "corr-dup-1",
      taskStore,
      taskRuntimeStore,
      taskDispatcher: dispatcher,
    });
    await handleDaemonTaskInbound({
      envelope: envelope2,
      remotePeerId: "envoy_peer:sender",
      receivedAt: Date.now(),
      correlationId: "corr-dup-2",
      taskStore,
      taskRuntimeStore,
      taskDispatcher: dispatcher,
    });
    const cached = await taskStore.getTaskResult("task-Dup");
    expect(cached?.summary).toBe("v2");
  });
});
