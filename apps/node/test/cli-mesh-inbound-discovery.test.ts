/**
 * Tests for the discovery.* arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleDiscoveryViaRuntime } from "../src/cli-mesh-inbound-discovery.js";

function makeMockCtx(
  overrides: Partial<{
    ok: boolean;
    reason: string;
    withResponsePayload: boolean;
  }> = {},
) {
  return {
    loadCapabilityManifest: vi.fn(async () => ({})),
    loadNodeConfig: vi.fn(async () => ({})),
    loadHumanProfile: vi.fn(async () => ({})),
    handleInboundDiscoveryIntent: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
      responsePayload: overrides.withResponsePayload
        ? { matches: [], queryId: "q1" }
        : null,
    })),
    appendAuditEvent: vi.fn(async () => {}),
    appendDiscoveryEvent: vi.fn(async () => {}),
    logWarn: vi.fn(),
    getProfile: vi.fn(() => ({
      device: { publicKeyPem: "PK", privateKeyPem: "PRIV" },
      owner: { ownerId: "owner-1" },
    })),
    getMesh: vi.fn(() => ({})),
    deliverOutboundEnvelope: vi.fn(async () => {}),
    createUnsignedEnvelope: vi.fn(() => ({})),
    createDiscoveryResponsePayload: vi.fn(() => ({})),
    signUnsignedEnvelope: vi.fn(() => ({
      messageId: "M1",
      intent: "discovery.response",
      correlationId: "C1",
      createdAt: "T1",
    })),
    derivePeerId: vi.fn(() => "local"),
    getProtocol: vi.fn(() => "envoy-msg/0.1"),
  };
}

describe("cli-mesh-inbound-discovery", () => {
  it("warns + returns silently on reject", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleDiscoveryViaRuntime(ctx, {
      envelope: { intent: "discovery.request" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
      profileDir: "/profile",
    });
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.deliverOutboundEnvelope).not.toHaveBeenCalled();
  });

  it("sends a response + appends a discovery event on accept", async () => {
    const ctx = makeMockCtx({ ok: true, withResponsePayload: true });
    await handleDiscoveryViaRuntime(ctx, {
      envelope: { intent: "discovery.request", messageId: "m1" },
      remotePeerId: "rp",
      receivedAt: 1,
      correlationId: "c1",
      profileDir: "/profile",
    });
    expect(ctx.deliverOutboundEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.appendDiscoveryEvent).toHaveBeenCalledTimes(1);
  });
});