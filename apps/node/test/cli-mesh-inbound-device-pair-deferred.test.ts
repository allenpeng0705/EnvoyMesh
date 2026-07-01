/**
 * Tests for the device.pair.deferred arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleDevicePairDeferredViaRuntime } from "../src/cli-mesh-inbound-device-pair-deferred.js";

function makeMockCtx() {
  return {
    parseDevicePairDeferredPayload: vi.fn(() => ({
      requestId: "req-1",
      reason: "user_declined",
    })),
    appendAuditEvent: vi.fn(async () => {}),
  };
}

const params = {
  envelope: { messageId: "m1", createdAt: "T" },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-device-pair-deferred", () => {
  it("appends a verified audit event with the deferral reason", async () => {
    const ctx = makeMockCtx();
    await handleDevicePairDeferredViaRuntime(ctx, params);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    const event = ctx.appendAuditEvent.mock.calls[0]?.[0];
    expect(event.type).toBe("message.verified");
    expect(event.summary).toContain("req-1");
    expect(event.summary).toContain("user_declined");
  });
});