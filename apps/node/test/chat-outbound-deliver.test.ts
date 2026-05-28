import { describe, expect, it, vi } from "vitest";
import {
  deliverChatEnvelopeWithRetry,
  rotateDialHintsForRetry,
} from "../src/chat-outbound-deliver.js";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

const envelope = { intent: "chat.message" } as EnvoyEnvelope;

describe("rotateDialHintsForRetry", () => {
  it("puts circuit hints first on retry attempts", () => {
    const hints = [
      "/ip4/192.168.1.5/tcp/4011/p2p/12D3KooWPeer",
      "/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
    ];
    expect(rotateDialHintsForRetry(hints, 1)[0]).toContain("/p2p-circuit/");
  });
});

describe("deliverChatEnvelopeWithRetry", () => {
  it("retries after first send failure and succeeds on second attempt", async () => {
    const sendChat = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale connection"))
      .mockResolvedValueOnce(undefined);
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(1),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWRetryPeer",
      envelope,
      dialHints: ["/p2p/12D3KooWRetryPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 3,
    });

    expect(sendChat).toHaveBeenCalledTimes(2);
    expect(mesh.closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWRetryPeer");
  });

  it("warms path before first send when not connected", async () => {
    const sendChat = vi.fn().mockResolvedValue(undefined);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWWarmPeer",
      envelope,
      dialHints: ["/p2p/12D3KooWWarmPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    expect(sendChat).toHaveBeenCalledTimes(1);
  });

  it("uses sendChatExpectReply when available and returns delivered ack", async () => {
    const deliveredAt = "2026-05-28T12:00:00.000Z";
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: {
        messageId: "msg-1",
        recipientOwnerId: "envoy:owner:abc",
        deliveredAt,
      },
    });
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    const result = await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWAckPeer",
      envelope: { ...envelope, messageId: "msg-1" },
      dialHints: ["/p2p/12D3KooWAckPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
    expect(mesh.sendChat).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: true, deliveredAt });
  });
});
