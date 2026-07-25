/**
 * @vitest-environment node
 * Phase 48D.5 — production A2A task executor.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTaskDispatcher } from "@envoymesh/api";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  generateDeviceIdentity,
} from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  createTaskRuntimeStateStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  authorizeA2ATaskSubmit,
  createProductionA2ATaskExecutor,
} from "../src/a2a-task-executor.js";

describe("authorizeA2ATaskSubmit", () => {
  it("allows self and direct; allows referred despite approval_required", () => {
    expect(authorizeA2ATaskSubmit({ ownerId: "o1", bondLevel: "self" }).ok).toBe(true);
    expect(authorizeA2ATaskSubmit({ ownerId: "o1", bondLevel: "direct" }).ok).toBe(true);
    expect(authorizeA2ATaskSubmit({ ownerId: "o1", bondLevel: "referred" }).ok).toBe(true);
  });

  it("denies public and blocked", () => {
    expect(authorizeA2ATaskSubmit({ ownerId: "o1", bondLevel: "public" }).ok).toBe(false);
    expect(authorizeA2ATaskSubmit({ ownerId: "o1", bondLevel: "blocked" }).ok).toBe(false);
  });
});

describe("createProductionA2ATaskExecutor", () => {
  let dir: string;
  let profile: NodeProfile;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "a2a-exec-"));
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity(owner.ownerId);
    profile = {
      owner,
      device,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as NodeProfile;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeExecutor(overrides: Record<string, unknown> = {}) {
    const agent = generateAgentIdentity(profile.owner.ownerId);
    const credential = createAgentCredential({
      owner: profile.owner,
      agent,
      scope: ["task.mandate", "task.propose", "task.cancel"],
    });
    const taskStore = createLocalTaskStore(dir);
    const taskRuntimeStore = createTaskRuntimeStateStore(dir);
    const trustStore = createLocalTrustStore(dir);
    const executor = createProductionA2ATaskExecutor({
      profile,
      taskDispatcher: createTaskDispatcher(),
      taskStore,
      taskRuntimeStore,
      trustStore,
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      agentCredential: credential,
      ...overrides,
    });
    return { executor, taskStore, taskRuntimeStore, trustStore, agent, credential };
  }

  it("message/send mints mandate+propose via daemon path and auto-completes", async () => {
    const { executor, taskStore } = makeExecutor({ autoCompleteLocal: true });

    const result = await executor.executeMessageSend({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_test_1",
      message: {
        role: "user",
        parts: [{ kind: "text", text: "Summarize the vault index" }],
      },
    });

    expect(result.envoyState).toBe("completed");
    expect(result.artifacts.length).toBe(1);
    expect(result.artifacts[0]).toMatchObject({ kind: "text" });
    expect(result.summary).toContain("Mandate + propose");

    const journal = await taskStore.readTaskJournalEntries();
    const eventTypes = journal.map((e) => e.eventType);
    expect(eventTypes).toContain("mandate_attached");
    expect(eventTypes).toContain("proposed");

    const got = await executor.getTask({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_test_1",
    });
    expect(got?.envoyState).toBe("completed");

    const denied = await executor.getTask({
      ownerId: "envoy:owner:other",
      a2aTaskId: "a2a_test_1",
    });
    expect(denied).toBeNull();
  });

  it("denies unknown/public bearer ownerId with auth-required", async () => {
    const { executor } = makeExecutor({ autoCompleteLocal: false });

    const result = await executor.executeMessageSend({
      ownerId: "envoy:owner:stranger",
      a2aTaskId: "a2a_deny_1",
      message: { role: "user", parts: [{ kind: "text", text: "nope" }] },
    });
    expect(result.envoyState).toBe("auth-required");
    expect(result.summary).toMatch(/auth-required/);
  });

  it("allows referred trust-tier bearer to submit", async () => {
    const { executor, trustStore } = makeExecutor({ autoCompleteLocal: true });
    const other = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: other.ownerId,
      level: "referred",
    });

    const result = await executor.executeMessageSend({
      ownerId: other.ownerId,
      a2aTaskId: "a2a_referred_1",
      message: { role: "user", parts: [{ kind: "text", text: "referred job" }] },
    });
    expect(result.envoyState).toBe("completed");
  });

  it("denies blocked bearer", async () => {
    const { executor, trustStore } = makeExecutor();
    const other = generateOwnerIdentity();
    await trustStore.setTrustRecord({
      peerOwnerId: other.ownerId,
      level: "blocked",
    });

    const result = await executor.executeMessageSend({
      ownerId: other.ownerId,
      a2aTaskId: "a2a_blocked_1",
      message: { role: "user", parts: [{ kind: "text", text: "blocked" }] },
    });
    expect(result.envoyState).toBe("auth-required");
  });

  it("tasks/cancel marks running task cancelled via daemon path", async () => {
    const { executor, taskRuntimeStore, taskStore } = makeExecutor({
      autoCompleteLocal: false,
      waitForResultMs: 0,
    });

    const started = await executor.executeMessageSend({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_cancel_1",
      message: { role: "user", parts: [{ kind: "text", text: "long job" }] },
    });
    expect(started.envoyState).toBe("running");

    const cancelled = await executor.cancelTask({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_cancel_1",
    });
    expect(cancelled.envoyState).toBe("cancelled");

    const journal = await taskStore.readTaskJournalEntries();
    expect(journal.some((e) => e.eventType === "cancelled")).toBe(true);

    const got = await executor.getTask({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_cancel_1",
    });
    expect(got?.envoyState).toBe("cancelled");

    const cancelEntry = journal.find((e) => e.eventType === "cancelled");
    expect(cancelEntry).toBeDefined();
    const lifecycle = await taskRuntimeStore.getTaskLifecycle(cancelEntry!.taskId);
    expect(lifecycle).toBe("cancelled");
  });

  it("defaults to running (no autoComplete) and persists across reload", async () => {
    const agent = generateAgentIdentity(profile.owner.ownerId);
    const credential = createAgentCredential({
      owner: profile.owner,
      agent,
      scope: ["task.mandate", "task.propose", "task.cancel"],
    });
    const taskStore = createLocalTaskStore(dir);
    const taskRuntimeStore = createTaskRuntimeStateStore(dir);
    const persistPath = join(dir, "a2a-bridge-tasks.json");
    const common = {
      profile,
      taskDispatcher: createTaskDispatcher(),
      taskStore,
      taskRuntimeStore,
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      agentCredential: credential,
      persistPath,
    };

    const first = createProductionA2ATaskExecutor(common);
    const started = await first.executeMessageSend({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_persist_1",
      message: { role: "user", parts: [{ kind: "text", text: "persist me" }] },
    });
    expect(started.envoyState).toBe("running");

    const second = createProductionA2ATaskExecutor(common);
    const got = await second.getTask({
      ownerId: profile.owner.ownerId,
      a2aTaskId: "a2a_persist_1",
    });
    expect(got?.envoyState).toBe("running");
    expect(got?.summary).toContain("persist me");
  });
});
