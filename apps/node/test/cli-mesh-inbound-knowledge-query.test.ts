/**
 * Tests for the knowledge.query arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import {
  handleKnowledgeQueryViaRuntime,
} from "../src/cli-mesh-inbound-knowledge-query.js";

function makeMockCtx(overrides: Partial<{
  ok: boolean;
  reason: string;
  message: string;
}> = {}) {
  const kq = {
    ok: overrides.ok ?? true,
    reason: overrides.reason ?? "denied",
    responsePayload: { matches: [] },
    senderOwnerId: "sender-1",
    queryPreview: "preview",
    syndicatedSensitivity: "public",
  };
  return {
    getContactSyndicationMaxSensitivity: vi.fn(async () => "public"),
    getTaskStore: vi.fn(() => ({} as any)),
    getTrustStore: vi.fn(() => ({} as any)),
    getPeerDirectoryStore: vi.fn(() => ({} as any)),
    getVaultIndex: vi.fn(async () => ({ documents: [] })),
    getModelProviders: vi.fn(() => ({ mode: "disabled" })),
    getChatLogStore: vi.fn(() => ({} as any)),
    getHumanProfileStore: vi.fn(() => ({} as any)),
    getAgentIdentityStore: vi.fn(() => ({} as any)),
    getKnowledgeBase: vi.fn(() => undefined),
    getRagService: vi.fn(() => ({} as any)),
    getKnowledgeSyndicationMaxSensitivity: vi.fn(() => undefined),
    getNodeService: vi.fn(() => null),
    handleInboundKnowledgeQuery: vi.fn(async () => kq),
    appendAuditEvent: vi.fn(async () => {}),
    getProfile: vi.fn(() => ({
      device: { publicKeyPem: "PK", privateKeyPem: "PRIV" },
    })),
    derivePeerId: vi.fn(() => "local-peer"),
    createUnsignedEnvelope: vi.fn(() => ({})),
    createKnowledgeResponsePayload: vi.fn(() => ({})),
    signUnsignedEnvelope: vi.fn(() => ({ messageId: "M1", intent: "knowledge.response", correlationId: "C1", createdAt: "T1" })),
    getMesh: vi.fn(() => ({})),
    deliverOutboundEnvelope: vi.fn(async () => {}),
    logWarn: vi.fn(),
    recordInboundKnowledgeAnswered: vi.fn(),
    getProtocol: vi.fn(() => "envoy-msg/0.1"),
  };
}

describe("cli-mesh-inbound-knowledge-query", () => {
  it("returns silently when the handler rejects", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.handleInboundKnowledgeQuery).toHaveBeenCalledTimes(1);
  });

  it("sends a knowledge.response envelope when the handler accepts", async () => {
    const ctx = makeMockCtx({ ok: true });
    ctx.getNodeService = vi.fn(() => ({} as any));
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.recordInboundKnowledgeAnswered).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1); // outbound audit
  });

  it("REGRESSION: passes all 13 closure deps to handleInboundKnowledgeQuery", async () => {
    // The original arm passes 13 fields to handleInboundKnowledgeQuery.
    // An earlier version of the runtime only passed 5, which would have
    // caused the production handler to receive `undefined` for
    // taskStore, trustStore, etc. This test guards against that.
    const ctx = makeMockCtx({ ok: true });
    const params = {
      envelope: {
        messageId: "m1",
        intent: "knowledge.query",
        createdAt: "T",
        senderPeerId: "sp",
        payload: {},
      },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    };
    await handleKnowledgeQueryViaRuntime(ctx, params);
    const call = ctx.handleInboundKnowledgeQuery.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const requiredFields = [
      "envelope", "remotePeerId", "receivedAt", "correlationId",
      "taskStore", "trustStore", "peerDirectoryStore", "profile",
      "vaultIndex", "modelProviders", "chatLogStore", "humanProfileStore",
      "agentIdentityStore", "knowledgeBase", "ragService",
      "knowledgeSyndicationMaxSensitivity", "contactSyndicationMaxSensitivity",
    ];
    for (const field of requiredFields) {
      expect(call, `handler call missing field: ${field}`).toHaveProperty(field);
    }
  });
});