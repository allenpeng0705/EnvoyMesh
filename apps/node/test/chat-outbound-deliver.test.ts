import { describe, expect, it, vi } from "vitest";
import {
  deliverCallEnvelopeWithRetry,
  deliverChatEnvelopeWithRetry,
  isChatAckFailureLikelyAfterWrite,
  rotateDialHintsForRetry,
} from "../src/chat-outbound-deliver.js";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

const envelope = { intent: "chat.message" } as EnvoyEnvelope;

describe("rotateDialHintsForRetry", () => {
  it("keeps direct LAN hints first on the first retry when LAN paths exist", () => {
    const hints = [
      "/ip4/192.168.1.5/tcp/4011/p2p/12D3KooWPeer",
      "/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
    ];
    expect(rotateDialHintsForRetry(hints, 1)[0]).toContain("192.168.1.5");
  });

  it("puts circuit hints first on later retries when only relay paths exist", () => {
    const hints = [
      "/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
    ];
    expect(rotateDialHintsForRetry(hints, 2)[0]).toContain("/p2p-circuit/");
  });
});

describe("isChatAckFailureLikelyAfterWrite", () => {
  it("detects stream reset after write", () => {
    const err = new Error("The stream has been reset");
    (err as Error & { name: string }).name = "StreamResetError";
    expect(isChatAckFailureLikelyAfterWrite(err)).toBe(true);
    expect(isChatAckFailureLikelyAfterWrite(new Error("Cannot send on stream 3"))).toBe(false);
  });

  it("does not treat ack timeout as post-write failure (allows retry)", () => {
    expect(isChatAckFailureLikelyAfterWrite(new Error("sendChatExpectReply timed out after 45000ms"))).toBe(
      false,
    );
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

  it("upgrades relay connection to direct before send when LAN hints exist", async () => {
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: {
        messageId: "msg-1",
        recipientOwnerId: "envoy:owner:abc",
        deliveredAt: "2026-05-28T12:00:00.000Z",
      },
    });
    const closeConnectionsToPeer = vi.fn().mockResolvedValue(1);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer,
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWUpgradePeer",
      envelope: { ...envelope, messageId: "msg-1" },
      dialHints: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWUpgradePeer"],
      peerListenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWUpgradePeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWUpgradePeer");
    expect(ensurePeerReachable).toHaveBeenCalledWith(
      "12D3KooWUpgradePeer",
      "/envoy/chat/0.1",
      expect.objectContaining({ preferCircuitHints: false, forceFreshDial: true }),
    );
    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
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

  it("falls back to send without ack after ack attempts fail", async () => {
    const sendChatExpectReply = vi.fn().mockRejectedValue(new Error("stream reset"));
    const sendChat = vi.fn().mockResolvedValue(undefined);
    const mesh = {
      sendChat,
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(1),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    const result = await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWFallbackPeer",
      envelope,
      dialHints: ["/p2p/12D3KooWFallbackPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 2,
    });

    expect(sendChatExpectReply).toHaveBeenCalledTimes(2);
    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(sendChat.mock.calls[0]?.[2]).toMatchObject({ forceFreshDial: true });
    expect(result).toEqual({ delivered: false });
  });

  it("does not retry when ack fails after send (stream reset)", async () => {
    const sendChatExpectReply = vi.fn().mockRejectedValue(new Error("The stream has been reset"));
    const sendChat = vi.fn();
    const mesh = {
      sendChat,
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    const result = await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWAfterWritePeer",
      envelope,
      dialHints: ["/p2p/12D3KooWAfterWritePeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 3,
    });

    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
    expect(sendChat).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false });
  });
});

describe("deliverCallEnvelopeWithRetry (Phase 42A — call.* on message protocol)", () => {
  const callEnvelope = { intent: "call.invite" } as EnvoyEnvelope;

  it("uses mesh.send (not sendChat) for call envelopes", async () => {
    const send = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const sendChat = vi.fn();
    const mesh = {
      send,
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: true }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    const result = await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWCallPeer",
      envelope: callEnvelope,
      dialHints: ["/p2p/12D3KooWCallPeer"],
      maxAttempts: 1,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sendChat).not.toHaveBeenCalled();
    expect(result.delivered).toBe(true);
  });

  it("warms before first send when not connected (same as pre-merge chat path)", async () => {
    const send = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      send,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWWarmCallPeer",
      envelope: callEnvelope,
      dialHints: ["/p2p/12D3KooWWarmCallPeer"],
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips warm when already connected (pre-merge stable-LAN behavior)", async () => {
    const send = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const ensurePeerReachable = vi.fn();
    const mesh = {
      send,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWConnectedCallPeer",
      envelope: callEnvelope,
      dialHints: ["/p2p/12D3KooWConnectedCallPeer"],
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
