/**
 * Tests for the broadcast.* arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleBroadcastViaRuntime } from "../src/cli-mesh-inbound-broadcast.js";

function makeMockCtx(
  overrides: Partial<{
    ok: boolean;
    reason: string;
    withResponsePayload: boolean;
    intent: "broadcast.request" | "broadcast.response";
  }> = {},
) {
  const intent = overrides.intent ?? "broadcast.request";
  return {
    loadCapabilityManifest: vi.fn(async () => ({})),
    loadNodeConfig: vi.fn(async () => ({})),
    handleInboundBroadcastRequest: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
      responsePayload: overrides.withResponsePayload
        ? { queryId: "q1", matches: [] }
        : null,
    })),
    handleInboundBroadcastResponse: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
    })),
    appendAuditEvent: vi.fn(async () => {}),
    logWarn: vi.fn(),
    getProfile: vi.fn(() => ({
      device: { publicKeyPem: "PK", privateKeyPem: "PRIV" },
    })),
    getMesh: vi.fn(() => ({})),
    deliverOutboundEnvelope: vi.fn(async () => {}),
    createUnsignedEnvelope: vi.fn(() => ({})),
    signUnsignedEnvelope: vi.fn(() => ({
      messageId: "M1",
      intent: "broadcast.response",
      correlationId: "C1",
      createdAt: "T1",
    })),
    derivePeerId: vi.fn(() => "local"),
    getProtocol: vi.fn(() => "envoy-msg/0.1"),
  };
}

describe("cli-mesh-inbound-broadcast", () => {
  it("warns + returns silently on broadcast.request reject", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleBroadcastViaRuntime(ctx, {
      envelope: { intent: "broadcast.request" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.deliverOutboundEnvelope).not.toHaveBeenCalled();
  });

  it("sends a response when broadcast.request is accepted", async () => {
    const ctx = makeMockCtx({ ok: true, withResponsePayload: true });
    await handleBroadcastViaRuntime(ctx, {
      envelope: { intent: "broadcast.request", senderPeerId: "sp" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    });
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalled();
  });

  it("warns on broadcast.response reject", async () => {
    const ctx = makeMockCtx({ ok: false, intent: "broadcast.response" });
    await handleBroadcastViaRuntime(ctx, {
      envelope: { intent: "broadcast.response" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
  });
});