/**
 * Phase 33 — A2A Tool Exposure tests.
 *
 * Verifies the three new tool entries (`mesh.task.cancel`, `mesh.task.await_result`,
 * `mesh.task.propose` description / sensitivity) and the auto-fetcher unit behaviour.
 * Round-trip integration tests live in a2a-task-roundtrip.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentCardStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  createAgentCredential,
  generateAgentIdentity,
  generateOwnerIdentity,
  type AgentCredential,
} from "@envoymesh/identity";
import {
  createAgentCard,
  createTaskCancelPayload,
  createTaskResultPayload,
  createTextArtifact,
} from "@envoymesh/protocol";
import { ToolRegistry, executeTool, type ToolDefinition } from "../src/tool-registry.js";
import { createAgentCardAutoFetcher } from "../src/agent-card-auto-fetcher.js";
import { createOutboundMeshMock } from "./helpers/outbound-mesh-mock.js";

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), "a2a-tool-exposure-"));
  const taskStore = createLocalTaskStore(dir);
  const trustStore = createLocalTrustStore(dir);
  const agentCardStore = createAgentCardStore(dir);
  return {
    dir,
    taskStore,
    trustStore,
    agentCardStore,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function makeBridgeIdentity() {
  const owner = generateOwnerIdentity();
  const agent = generateAgentIdentity(owner.ownerId);
  const agentCredential: AgentCredential = createAgentCredential({
    owner,
    agent,
    scope: ["chat.message"],
  });
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: owner.ownerId,
    agentCredential,
  };
}

describe("A2A tool entries (registry metadata)", () => {
  it("registers mesh.task.cancel with requiresApproval: true and friends sensitivity", () => {
    const t = new ToolRegistry().get("mesh.task.cancel") as ToolDefinition | undefined;
    expect(t).toBeDefined();
    expect(t?.requiresApproval).toBe(true);
    expect(t?.sensitivityCeiling).toBe("friends");
  });

  it("registers mesh.task.await_result with requiresApproval: false and public sensitivity", () => {
    const t = new ToolRegistry().get("mesh.task.await_result") as ToolDefinition | undefined;
    expect(t).toBeDefined();
    expect(t?.requiresApproval).toBe(false);
    expect(t?.sensitivityCeiling).toBe("public");
  });

  it("mesh.task.propose description mentions typed Artifacts", () => {
    const t = new ToolRegistry().get("mesh.task.propose") as ToolDefinition | undefined;
    expect(t).toBeDefined();
    expect(t?.description).toMatch(/Artifact/i);
    expect(t?.description).toMatch(/typed/i);
  });

  it("mesh.task.cancel paramSchema requires targetOwnerId + taskId", () => {
    const t = new ToolRegistry().get("mesh.task.cancel") as ToolDefinition | undefined;
    expect(t?.paramSchema.required).toEqual(expect.arrayContaining(["targetOwnerId", "taskId"]));
  });

  it("mesh.task.await_result paramSchema requires taskId", () => {
    const t = new ToolRegistry().get("mesh.task.await_result") as ToolDefinition | undefined;
    expect(t?.paramSchema.required).toContain("taskId");
  });
});

describe("executeTool — mesh.task.cancel dispatch", () => {
  it("blocks cancel without approvalGranted", async () => {
    const store = await tempStore();
    try {
      const sendTaskCancel = vi.fn();
      const result = await executeTool(
        "mesh.task.cancel",
        { targetOwnerId: "x", taskId: "t" },
        { sendTaskCancel, taskStore: store.taskStore },
      );
      expect(result.ok).toBe(false);
      expect(result.approvalRequired).toBe(true);
      expect(result.error).toMatch(/requires owner approval/);
      expect(sendTaskCancel).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });

  it("returns ok:false when context lacks sendTaskCancel", async () => {
    const store = await tempStore();
    try {
      const result = await executeTool(
        "mesh.task.cancel",
        { targetOwnerId: "x", taskId: "t" },
        { taskStore: store.taskStore, approvalGranted: true },
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/sendTaskCancel/);
    } finally {
      await store.cleanup();
    }
  });

  it("returns ok:false when targetOwnerId or taskId missing", async () => {
    const store = await tempStore();
    try {
      const sendTaskCancel = vi.fn();
      const r1 = await executeTool(
        "mesh.task.cancel",
        { taskId: "t" },
        { sendTaskCancel, taskStore: store.taskStore, approvalGranted: true },
      );
      expect(r1.ok).toBe(false);
      expect(sendTaskCancel).not.toHaveBeenCalled();
      const r2 = await executeTool(
        "mesh.task.cancel",
        { targetOwnerId: "x" },
        { sendTaskCancel, taskStore: store.taskStore, approvalGranted: true },
      );
      expect(r2.ok).toBe(false);
    } finally {
      await store.cleanup();
    }
  });

  it("forwards targetOwnerId + taskId + reason to sendTaskCancel", async () => {
    const store = await tempStore();
    try {
      const sendTaskCancel = vi.fn().mockResolvedValue({ ok: true });
      const r = await executeTool(
        "mesh.task.cancel",
        { targetOwnerId: "peer-1", taskId: "task-1", reason: "owner requested" },
        { sendTaskCancel, taskStore: store.taskStore, approvalGranted: true },
      );
      expect(r.ok).toBe(true);
      expect(sendTaskCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          targetOwnerId: "peer-1",
          taskId: "task-1",
          reason: "owner requested",
        }),
      );
    } finally {
      await store.cleanup();
    }
  });

  it("propagates sendTaskCancel error to ok:false", async () => {
    const store = await tempStore();
    try {
      const sendTaskCancel = vi.fn().mockResolvedValue({ ok: false, error: "transport down" });
      const r = await executeTool(
        "mesh.task.cancel",
        { targetOwnerId: "p", taskId: "t" },
        { sendTaskCancel, taskStore: store.taskStore, approvalGranted: true },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe("transport down");
    } finally {
      await store.cleanup();
    }
  });
});

describe("executeTool — mesh.task.await_result dispatch", () => {
  it("returns ok:false when context lacks awaitTaskResult", async () => {
    const store = await tempStore();
    try {
      const r = await executeTool(
        "mesh.task.await_result",
        { taskId: "t" },
        { taskStore: store.taskStore },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/awaitTaskResult/);
    } finally {
      await store.cleanup();
    }
  });

  it("returns ok:false when taskId missing", async () => {
    const store = await tempStore();
    try {
      const awaitTaskResult = vi.fn();
      const r = await executeTool(
        "mesh.task.await_result",
        {},
        { awaitTaskResult, taskStore: store.taskStore },
      );
      expect(r.ok).toBe(false);
      expect(awaitTaskResult).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });

  it("applies default wait-window (30s) and poll cadence (1s) when params are omitted", async () => {
    const store = await tempStore();
    try {
      const awaitTaskResult = vi.fn().mockResolvedValue({ ok: true, result: { fake: true } });
      const r = await executeTool(
        "mesh.task.await_result",
        { taskId: "t" },
        { awaitTaskResult, taskStore: store.taskStore },
      );
      expect(r.ok).toBe(true);
      expect(awaitTaskResult).toHaveBeenCalledWith({
        taskId: "t",
        timeoutMs: 30_000,
        pollIntervalMs: 1_000,
      });
    } finally {
      await store.cleanup();
    }
  });

  it("respects custom wait-window / poll-cadence values", async () => {
    const store = await tempStore();
    try {
      const awaitTaskResult = vi.fn().mockResolvedValue({ ok: true, result: { ok: 1 } });
      await executeTool(
        "mesh.task.await_result",
        { taskId: "t", timeoutMs: 5_000, pollIntervalMs: 250 },
        { awaitTaskResult, taskStore: store.taskStore },
      );
      expect(awaitTaskResult).toHaveBeenCalledWith({
        taskId: "t",
        timeoutMs: 5_000,
        pollIntervalMs: 250,
      });
    } finally {
      await store.cleanup();
    }
  });

  it("ignores non-positive wait-window values and falls back to defaults", async () => {
    const store = await tempStore();
    try {
      const awaitTaskResult = vi.fn().mockResolvedValue({ ok: true, result: { ok: 1 } });
      await executeTool(
        "mesh.task.await_result",
        { taskId: "t", timeoutMs: 0, pollIntervalMs: -5 },
        { awaitTaskResult, taskStore: store.taskStore },
      );
      expect(awaitTaskResult).toHaveBeenCalledWith({
        taskId: "t",
        timeoutMs: 30_000,
        pollIntervalMs: 1_000,
      });
    } finally {
      await store.cleanup();
    }
  });

  it("propagates a 'timed out' reason as the error field", async () => {
    const store = await tempStore();
    try {
      const awaitTaskResult = vi.fn().mockResolvedValue({ ok: false, reason: "timed out" });
      const r = await executeTool(
        "mesh.task.await_result",
        { taskId: "t", timeoutMs: 100 },
        { awaitTaskResult, taskStore: store.taskStore },
      );
      expect(r.ok).toBe(false);
      expect(r.error).toBe("timed out");
    } finally {
      await store.cleanup();
    }
  });
});

describe("createTaskCancelPayload sanity", () => {
  it("produces a parseable cancel payload", () => {
    const payload = createTaskCancelPayload({
      taskId: "task-1",
      mandateId: "mandate-1",
      reason: "owner requested",
      cancelledBy: "owner",
    });
    expect(payload.taskId).toBe("task-1");
    expect(payload.mandateId).toBe("mandate-1");
    expect(payload.reason).toBe("owner requested");
  });
});

describe("createTaskResultPayload — typed artifacts", () => {
  it("createTaskResultPayload with mixed Artifact[]", () => {
    const payload = createTaskResultPayload({
      taskId: "t-1",
      status: "completed",
      summary: "ok",
      artifacts: [
        createTextArtifact({ content: "hi" }),
        createTextArtifact({ content: "world" }),
      ],
    });
    expect(payload.artifacts).toHaveLength(2);
    expect(payload.artifacts[0]?.kind).toBe("text");
  });
});

describe("AgentCardAutoFetcher — fresh-cache skip + public skip", () => {
  it("skips when no trust record exists (defaults to public)", async () => {
    const store = await tempStore();
    try {
      const sendExpectReply = vi.fn();
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({ sendExpectReply }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "rp",
        }),
        fetchTimeoutMs: 50,
      });
      const r = await fetcher.onBondEstablished({ peerOwnerId: "stranger", remotePeerId: "rp" });
      expect(r.outcome).toBe("skipped-public");
      expect(sendExpectReply).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });

  it("skips when trust level is blocked", async () => {
    const store = await tempStore();
    try {
      await store.trustStore.setTrustRecord({ peerOwnerId: "bad", level: "blocked" });
      const sendExpectReply = vi.fn();
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({ sendExpectReply }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "rp",
        }),
      });
      const r = await fetcher.onBondEstablished({ peerOwnerId: "bad", remotePeerId: "rp" });
      expect(r.outcome).toBe("skipped-public");
      expect(sendExpectReply).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });

  it("skips when a fresh card is cached", async () => {
    const store = await tempStore();
    try {
      await store.trustStore.setTrustRecord({ peerOwnerId: "friend", level: "direct" });
      await store.agentCardStore.upsert({
        ownerId: "friend",
        card: createAgentCard({
          ownerId: "friend",
          displayName: "Friend",
          nodeProfile: "full",
          membership: ["chat.message"],
          publicTopics: [],
        }),
        cachedAt: new Date().toISOString(),
      });
      const sendExpectReply = vi.fn();
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({ sendExpectReply }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "rp",
        }),
      });
      const r = await fetcher.onBondEstablished({ peerOwnerId: "friend", remotePeerId: "rp" });
      expect(r.outcome).toBe("skipped-fresh");
      expect(sendExpectReply).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });

  it("issues a fetch when no cache entry exists and trust is direct", async () => {
    const store = await tempStore();
    try {
      const peerOwner = generateOwnerIdentity();
      const peerAgent = generateAgentIdentity(peerOwner.ownerId);
      await store.trustStore.setTrustRecord({ peerOwnerId: peerOwner.ownerId, level: "direct" });
      const { createAgentCardResponsePayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
      const { signUnsignedEnvelope } = await import("@envoymesh/identity");
      const reply = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: peerAgent.agentPeerId,
          senderPublicKey: peerAgent.publicKeyPem,
          senderRole: "agent",
          recipientRole: "agent",
          intent: "agent.card.response",
          payload: createAgentCardResponsePayload(
            createAgentCard({
              ownerId: peerOwner.ownerId,
              displayName: "Friend",
              nodeProfile: "full",
              membership: ["chat.message"],
              publicTopics: [],
            }),
          ),
          agentCredential: createAgentCredential({
            owner: peerOwner,
            agent: peerAgent,
            scope: ["agent.card.response"],
          }),
        }),
        peerAgent.privateKeyPem,
      );
      const sendExpectReply = vi.fn().mockResolvedValue(reply);
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply,
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["tp"],
        }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "rp",
        }),
        fetchTimeoutMs: 200,
      });
      const r = await fetcher.onBondEstablished({ peerOwnerId: peerOwner.ownerId, remotePeerId: "tp" });
      expect(r.outcome).toBe("sent");
      expect(sendExpectReply).toHaveBeenCalledTimes(1);
      const envelope = sendExpectReply.mock.calls[0]?.[1];
      expect(envelope.intent).toBe("agent.card.request");
      expect(envelope.senderRole).toBe("agent");
      expect(envelope.recipientRole).toBe("agent");
      expect(await store.agentCardStore.get(peerOwner.ownerId)).toBeDefined();
    } finally {
      await store.cleanup();
    }
  });

  it("returns 'failed' (and audits) when the expect-reply errors", async () => {
    const store = await tempStore();
    try {
      await store.trustStore.setTrustRecord({ peerOwnerId: "friend", level: "direct" });
      const sendExpectReply = vi.fn().mockRejectedValue(new Error("agent-card-auto-fetch-timeout"));
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({
          sendExpectReply,
          getPeerConnectionInfo: () => ({ connected: true, direct: true }),
          getConnectedPeerIds: () => ["tp"],
        }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: "tp",
          recipientEnvelopePeerId: "rp",
        }),
        fetchTimeoutMs: 50,
      });
      const r = await fetcher.onBondEstablished({ peerOwnerId: "friend", remotePeerId: "tp" });
      expect(r.outcome).toBe("failed");
      const events = await store.taskStore.readAuditEvents();
      const failure = events.find((e) => e.type === "agent.card.auto_fetch_failed");
      expect(failure).toBeDefined();
    } finally {
      await store.cleanup();
    }
  });

  it("returns 'skipped-no-transport' when peer transport is unresolvable", async () => {
    const store = await tempStore();
    try {
      await store.trustStore.setTrustRecord({ peerOwnerId: "friend", level: "direct" });
      const sendExpectReply = vi.fn();
      const fetcher = createAgentCardAutoFetcher({
        mesh: createOutboundMeshMock({ sendExpectReply }),
        bridgeIdentity: makeBridgeIdentity(),
        agentCardStore: store.agentCardStore,
        trustStore: store.trustStore,
        taskStore: store.taskStore,
        resolvePeerTransport: async () => ({
          transportPeerId: undefined,
          recipientEnvelopePeerId: undefined,
        }),
      });
      // Use an envoy_ envelope id so the fetcher falls back to
      // resolvePeerTransport (which returns undefined here).
      const r = await fetcher.onBondEstablished({
        peerOwnerId: "friend",
        remotePeerId: "envoy_notlibp2p",
      });
      expect(r.outcome).toBe("skipped-no-transport");
      expect(sendExpectReply).not.toHaveBeenCalled();
    } finally {
      await store.cleanup();
    }
  });
});
