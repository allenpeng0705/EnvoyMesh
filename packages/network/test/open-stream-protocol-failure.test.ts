/**
 * Regression: failing to open a message-protocol stream must NOT close a connection
 * that still supports chat (Mac↔Windows relay path).
 */

import { describe, expect, it, vi } from "vitest";

describe("openStreamOnConnection protocol negotiation", () => {
  it("does not close connection when only protocol selection fails", async () => {
    const close = vi.fn(async () => {});
    const newStream = vi.fn(async (_protocol: string) => {
      throw new Error("Protocol selection failed - could not negotiate /envoymesh/message/0.1.0");
    });
    const connection = {
      newStream,
      remotePeer: { toString: () => "12D3KooWTestPeer" },
      close,
    };

    const isProtocolOnlyFailure = (detail: string) =>
      detail.includes("Protocol selection failed") || detail.includes("could not negotiate");

    let closed = false;
    try {
      await connection.newStream("/envoymesh/message/0.1.0");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      if (!isProtocolOnlyFailure(detail)) {
        closed = true;
        await connection.close?.();
      }
    }

    expect(isProtocolOnlyFailure(
      "Protocol selection failed - could not negotiate /envoymesh/message/0.1.0",
    )).toBe(true);
    expect(closed).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});
