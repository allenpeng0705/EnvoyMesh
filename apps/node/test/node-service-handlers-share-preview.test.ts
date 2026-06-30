/**
 * Tests for the share.preview inbound intent handler.
 */
import { describe, expect, it, vi } from "vitest";

import { handleSharePreviewViaRuntime } from "../src/node-service-handlers-share-preview.js";

function makeCtx(
  overrides: Partial<{
    recordInboundPullSharePreview: ReturnType<typeof vi.fn>;
    linkOutboundSharePreviewFromInbound: ReturnType<typeof vi.fn>;
  }> = {},
) {
  return {
    recordInboundPullSharePreview: vi.fn(() => true),
    linkOutboundSharePreviewFromInbound: vi.fn(),
    ...overrides,
  };
}

describe("handleSharePreviewViaRuntime", () => {
  it("returns true (handler consumed the envelope)", () => {
    const ctx = makeCtx();
    const out = handleSharePreviewViaRuntime(
      ctx,
      { messageId: "m1", payload: {} },
      "peer-1",
    );
    expect(out).toBe(true);
  });

  it("silently swallows invalid payloads and still returns true", () => {
    const ctx = makeCtx();
    // Force parseSharePreviewPayload to throw — easiest is to pass garbage.
    expect(() =>
      handleSharePreviewViaRuntime(
        ctx,
        { messageId: "m1", payload: { __garbage__: true } },
        "peer-1",
      ),
    ).not.toThrow();
    expect(ctx.recordInboundPullSharePreview).not.toHaveBeenCalled();
    expect(ctx.linkOutboundSharePreviewFromInbound).not.toHaveBeenCalled();
  });

  it("does not record when payload is not a file transfer", () => {
    const ctx = makeCtx();
    handleSharePreviewViaRuntime(
      ctx,
      {
        messageId: "m1",
        payload: { inReplyTo: "x", previewText: "hi", isFileTransfer: false, refused: false },
      },
      "peer-1",
    );
    expect(ctx.recordInboundPullSharePreview).not.toHaveBeenCalled();
  });

  it("does not record when payload is refused", () => {
    const ctx = makeCtx();
    handleSharePreviewViaRuntime(
      ctx,
      {
        messageId: "m1",
        payload: { inReplyTo: "x", previewText: "hi", isFileTransfer: true, refused: true },
      },
      "peer-1",
    );
    expect(ctx.recordInboundPullSharePreview).not.toHaveBeenCalled();
  });
});