/**
 * Tests for the sync.state arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleSyncStateViaRuntime } from "../src/cli-mesh-inbound-sync-state.js";

function makeMockCtx(
  overrides: Partial<{ ok: boolean; reason: string; scope: string }> = {},
) {
  return {
    handleInboundSyncStateIntent: vi.fn(() => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "policy_denied",
      scope: overrides.scope ?? "vault",
      updateBase64: "base64blob",
      senderOwnerId: "owner-1",
    })),
    appendAuditEvent: vi.fn(async () => {}),
    getProfile: vi.fn(() => ({})),
    getNodeService: vi.fn(() => null),
  };
}

const params = {
  envelope: {
    messageId: "m1",
    createdAt: "T",
    intent: "sync.state",
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-sync-state", () => {
  it("returns silently + appends reject audit when syncResult.ok=false", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleSyncStateViaRuntime(ctx, params);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("appends verified audit when syncResult.ok=true", async () => {
    const ctx = makeMockCtx({ ok: true });
    await handleSyncStateViaRuntime(ctx, params);
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("emits crdt:sync event when nodeService is wired", async () => {
    const emit = vi.fn();
    const ctx = makeMockCtx({ ok: true });
    ctx.getNodeService = vi.fn(() => ({ emit }));
    await handleSyncStateViaRuntime(ctx, params);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "crdt:sync",
      expect.objectContaining({ scope: "vault", senderOwnerId: "owner-1" }),
    );
  });

  it("does NOT emit crdt:sync when nodeService is null", async () => {
    const ctx = makeMockCtx({ ok: true });
    ctx.getNodeService = vi.fn(() => null);
    await handleSyncStateViaRuntime(ctx, params);
    // Only the verified-audit appendAuditEvent call — no emit.
    expect(ctx.appendAuditEvent).toHaveBeenCalledTimes(1);
  });
});