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
});