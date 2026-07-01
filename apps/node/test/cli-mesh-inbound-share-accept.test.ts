/**
 * Tests for the share.accept arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleShareAcceptViaRuntime } from "../src/cli-mesh-inbound-share-accept.js";

function makeMockCtx(
  overrides: Partial<{ ok: boolean; reason: string; deliverError: boolean }> = {},
) {
  const nodeService = {
    clearPendingShareStateForPreview: vi.fn(),
    maybeSendShareFileForInboundAccept: vi.fn(async () => {}),
  };
  return {
    getNodeService: vi.fn(() => nodeService),
    parseShareAcceptPayload: vi.fn(() => ({ accept: true, inReplyTo: "r1" })),
    handleInboundShareAccept: vi.fn(async () => ({
      ok: overrides.ok ?? true,
      reason: overrides.reason ?? "denied",
    })),
    getTaskStore: vi.fn(() => ({})),
    getTrustStore: vi.fn(() => ({})),
    getPeerDirectoryStore: vi.fn(() => ({})),
    getProfile: vi.fn(() => ({})),
    getVaultIndex: vi.fn(async () => ({ documents: [] })),
    getVaultDir: vi.fn(() => "/vault"),
    logWarn: vi.fn(),
    logError: vi.fn(),
    log: vi.fn(),
    _nodeService: nodeService,
  };
}

const params = {
  envelope: {
    messageId: "m1",
    intent: "share.accept",
    payload: {},
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-share-accept", () => {
  it("returns silently when handleInboundShareAccept rejects", async () => {
    const ctx = makeMockCtx({ ok: false, reason: "policy_denied" });
    await handleShareAcceptViaRuntime(ctx, params);
    expect(ctx.logWarn).toHaveBeenCalled();
  });

  it("clears pending share state on a reject (accept=false)", async () => {
    const ctx = makeMockCtx();
    ctx.parseShareAcceptPayload.mockReturnValueOnce({ accept: false, inReplyTo: "R" });
    await handleShareAcceptViaRuntime(ctx, params);
    expect(ctx._nodeService.clearPendingShareStateForPreview).toHaveBeenCalledWith("R");
  });

  it("calls maybeSendShareFileForInboundAccept on accept", async () => {
    const ctx = makeMockCtx({ ok: true });
    await handleShareAcceptViaRuntime(ctx, params);
    expect(ctx._nodeService.maybeSendShareFileForInboundAccept).toHaveBeenCalledTimes(1);
    expect(ctx.log).toHaveBeenCalled();
  });
});