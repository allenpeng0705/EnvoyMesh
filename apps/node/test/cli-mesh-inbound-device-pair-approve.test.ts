/**
 * Tests for the device.pair.approve arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleDevicePairApproveViaRuntime } from "../src/cli-mesh-inbound-device-pair-approve.js";

function makeMockCtx(overrides: Partial<{ certValid: boolean }> = {}) {
  return {
    parseDevicePairApprovePayload: vi.fn(() => ({
      deviceCertificate: {
        deviceId: "device-1",
        ownerId: "owner-1",
      },
      requestId: "req-1",
    })),
    getProfile: vi.fn(() => ({
      device: { deviceId: "device-1" },
      owner: { ownerId: "owner-1", publicKeyPem: "PK" },
    })),
    verifyDeviceCertificate: vi.fn(() => overrides.certValid ?? true),
    appendAuditEvent: vi.fn(async () => {}),
    log: vi.fn(),
    saveNodeProfile: vi.fn(async () => {}),
  };
}

const params = {
  envelope: {
    messageId: "m1",
    createdAt: "T",
    intent: "device.pair.approve",
    payload: {},
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
  profileDir: "/profile",
};

describe("cli-mesh-inbound-device-pair-approve", () => {
  it("rejects + audits when the certificate is invalid", async () => {
    const ctx = makeMockCtx({ certValid: false });
    await handleDevicePairApproveViaRuntime(ctx, params);
    expect(ctx.saveNodeProfile).not.toHaveBeenCalled();
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent.mock.calls[0]?.[0]?.type).toBe("message.rejected");
  });

  it("saves the cert + audits when the certificate is valid", async () => {
    const ctx = makeMockCtx({ certValid: true });
    await handleDevicePairApproveViaRuntime(ctx, params);
    expect(ctx.saveNodeProfile).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(ctx.appendAuditEvent.mock.calls[0]?.[0]?.type).toBe("message.verified");
    expect(ctx.log).toHaveBeenCalled();
  });
});