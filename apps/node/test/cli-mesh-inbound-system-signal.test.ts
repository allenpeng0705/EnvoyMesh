/**
 * Tests for the system.signal arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleSystemSignalViaRuntime } from "../src/cli-mesh-inbound-system-signal.js";

function makeMockCtx(
  overrides: Partial<{ authorized: boolean; capabilityAction: "allow" | "deny" }> = {},
) {
  return {
    parseSystemSignalPayload: vi.fn(() => ({
      ownerId: "owner-1",
      deviceId: "device-1",
      deviceProfile: "desktop",
      capabilities: ["basic"],
      deviceCertificate: {},
      ownerPublicKeyPem: "PK",
    })),
    verifyAuthorizedDeviceEnvelope: vi.fn(() => overrides.authorized ?? true),
    evaluateCapability: vi.fn(() => ({
      action: overrides.capabilityAction ?? "allow",
      reason: "deny_reason",
    })),
    appendAuditEvent: vi.fn(async () => {}),
    logWarn: vi.fn(),
    log: vi.fn(),
    upsertPeerFromSignal: vi.fn(async () => {}),
  };
}

const params = {
  envelope: {
    messageId: "m1",
    createdAt: "T",
    intent: "system.signal",
    payload: {},
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-system-signal", () => {
  it("warns + audits + returns when not authorized", async () => {
    const ctx = makeMockCtx({ authorized: false });
    await handleSystemSignalViaRuntime(ctx, params);
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(ctx.upsertPeerFromSignal).not.toHaveBeenCalled();
  });

  it("warns + audits + returns when capability denies", async () => {
    const ctx = makeMockCtx({ capabilityAction: "deny" });
    await handleSystemSignalViaRuntime(ctx, params);
    expect(ctx.logWarn).toHaveBeenCalled();
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(ctx.upsertPeerFromSignal).not.toHaveBeenCalled();
  });

  it("logs, audits, and upserts peer when authorized + allowed", async () => {
    const ctx = makeMockCtx({ authorized: true, capabilityAction: "allow" });
    await handleSystemSignalViaRuntime(ctx, params);
    expect(ctx.log).toHaveBeenCalled();
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1); // verified
    expect(ctx.upsertPeerFromSignal).toHaveBeenCalledTimes(1);
  });
});