/**
 * Tests for the share.request arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleShareRequestViaRuntime } from "../src/cli-mesh-inbound-share-request.js";

function makeMockCtx(
  overrides: Partial<{
    ok: boolean;
    reason: string;
    recordAfterPreview: boolean;
    recordPushOffer: boolean;
    autoAcceptChat: boolean;
  }> = {},
) {
  return {
    loadCapabilityManifest: vi.fn(async () => ({})),
    handleInboundShareRequest: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
      responsePayload: {
        previewText: "preview-text",
        sensitivity: "public",
        requiresApproval: false,
      },
    })),
    appendAuditEvent: vi.fn(async () => {}),
    getProfile: vi.fn(() => ({
      device: { publicKeyPem: "PK", privateKeyPem: "PRIV" },
    })),
    derivePeerId: vi.fn(() => "local-peer"),
    createUnsignedEnvelope: vi.fn(() => ({})),
    createSharePreviewPayload: vi.fn(() => ({})),
    signUnsignedEnvelope: vi.fn(() => ({
      messageId: "M1",
      intent: "share.preview",
      correlationId: "C1",
      createdAt: "T1",
    })),
    dialHintsForTransportPeer: vi.fn(async () => []),
    deliverOutboundEnvelope: vi.fn(async () => {}),
    parseShareRequestPayload: vi.fn(() => ({
      requestType: "file",
      relativePath: "docs/x.md",
      fileOrigin: "sender",
      deliveryChannel: "inbox",
    })),
    resolveSenderOwnerId: vi.fn(async () => "owner-1"),
    logWarn: vi.fn(),
    getProtocol: vi.fn(() => "envoy-msg/0.1"),
    getNodeService: vi.fn(() => null),
    getMesh: vi.fn(() => ({})),
    getTaskStore: vi.fn(() => ({})),
    getTrustStore: vi.fn(() => ({})),
    getPeerDirectoryStore: vi.fn(() => ({})),
    getVaultIndex: vi.fn(async () => ({ documents: [] })),
    getVaultDir: vi.fn(() => "/vault"),
    getModelProviders: vi.fn(() => ({ mode: "disabled" })),
  };
}

const params = {
  envelope: {
    messageId: "m1",
    createdAt: "T",
    senderPeerId: "sp",
    intent: "share.request",
    payload: {},
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-share-request", () => {
  it("returns silently when handleInboundShareRequest rejects", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleShareRequestViaRuntime(ctx, params);
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.deliverOutboundEnvelope).not.toHaveBeenCalled();
  });

  it("delivers a share.preview envelope when accepted", async () => {
    const ctx = makeMockCtx({ ok: true });
    await handleShareRequestViaRuntime(ctx, params);
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
  });
});