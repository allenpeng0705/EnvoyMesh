/**
 * Tests for the profile.sync/response/request arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleProfileIntentViaRuntime } from "../src/cli-mesh-inbound-profile-intent.js";

function makeMockCtx(handled: boolean) {
  return {
    getNodeService: vi.fn(() => ({
      handleInboundProfileIntent: vi.fn(async () => handled),
    })),
    appendAuditEvent: vi.fn(async () => {}),
  };
}

const params = {
  envelope: { messageId: "m1", intent: "profile.sync", createdAt: "T" },
  remotePeerId: "rp",
  remoteAddr: undefined,
  receivedAt: 1,
  correlationId: "c1",
  replyWithEnvelope: undefined,
};

describe("cli-mesh-inbound-profile-intent", () => {
  it("returns false + does NOT audit when nodeService is missing", async () => {
    const ctx = { getNodeService: vi.fn(() => null), appendAuditEvent: vi.fn() };
    const out = await handleProfileIntentViaRuntime(ctx, params);
    expect(out).toBe(false);
    expect(ctx.appendAuditEvent).not.toHaveBeenCalled();
  });

  it("returns false when handleInboundProfileIntent returns false", async () => {
    const ctx = makeMockCtx(false);
    const out = await handleProfileIntentViaRuntime(ctx, params);
    expect(out).toBe(false);
    expect(ctx.appendAuditEvent).not.toHaveBeenCalled();
  });

  it("returns true + audits when handled", async () => {
    const ctx = makeMockCtx(true);
    const out = await handleProfileIntentViaRuntime(ctx, params);
    expect(out).toBe(true);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
    const event = ctx.appendAuditEvent.mock.calls[0]?.[0];
    expect(event.type).toBe("message.verified");
    expect(event.summary).toContain("profile.sync");
  });
});