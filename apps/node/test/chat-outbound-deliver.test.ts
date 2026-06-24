import { describe, expect, it, vi } from "vitest";
import {
  deliverCallEnvelopeWithRetry,
  deliverChatEnvelopeWithRetry,
  deliverDataTransferWithRetry,
  deliverExpectReplyWithRetry,
  isChatAckFailureLikelyAfterWrite,
  prepareOutboundPeerConnection,
  resolveChatDeliveryAckTimeoutMs,
  rotateDialHintsForRetry,
} from "../src/chat-outbound-deliver.js";
import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { CHAT_DELIVERY_ACK_TIMEOUT_MS } from "@envoymesh/protocol";
import { ENVOY_MESSAGE_PROTOCOL } from "@envoymesh/network";
import {
  markOutboundPeerVerified,
  resetOutboundPeerFreshnessForTests,
} from "../src/outbound-peer-freshness.js";

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

  it("treats ack timeout as post-write failure (message likely delivered, no retry)", () => {
    expect(isChatAckFailureLikelyAfterWrite(new Error("sendChatExpectReply timed out after 45000ms"))).toBe(
      true,
    );
    expect(isChatAckFailureLikelyAfterWrite(new Error("chat ack timed out after 45000ms"))).toBe(true);
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
    resetOutboundPeerFreshnessForTests();
    const deliveredAt = "2026-05-28T12:00:00.000Z";
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: {
        messageId: "msg-1",
        recipientOwnerId: "envoy:owner:abc",
        deliveredAt,
      },
    });
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    const result = await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWAckPeer",
      envelope: { ...envelope, messageId: "msg-1" },
      dialHints: ["/p2p/12D3KooWAckPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
    expect(mesh.sendChat).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: true, deliveredAt });
  });

  it("skips pre-send verify when peer was recently verified", async () => {
    resetOutboundPeerFreshnessForTests();
    const transportPeerId = "12D3KooWFreshPeer";
    markOutboundPeerVerified(transportPeerId);
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: { messageId: "msg-fresh", deliveredAt: new Date().toISOString() },
    });
    const ensurePeerReachable = vi.fn();
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope: { ...envelope, messageId: "msg-fresh" },
      dialHints: [`/p2p/${transportPeerId}`],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
  });

  it("retries after send failure on a connected direct path (no pre-send verify when ack enabled)", async () => {
    resetOutboundPeerFreshnessForTests();
    const sendChatExpectReply = vi
      .fn()
      .mockRejectedValueOnce(new Error("Cannot send on stream 3"))
      .mockResolvedValueOnce({
        intent: "chat.delivered",
        payload: {
          messageId: "msg-2",
          recipientOwnerId: "envoy:owner:abc",
          deliveredAt: "2026-05-28T12:00:00.000Z",
        },
      });
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const closeConnectionsToPeer = vi.fn().mockResolvedValue(1);
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer,
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWStalePeer",
      envelope: { ...envelope, messageId: "msg-2" },
      dialHints: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWStalePeer"],
      peerListenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWStalePeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 2,
    });

    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect(closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWStalePeer");
    expect(sendChatExpectReply).toHaveBeenCalledTimes(2);
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

  it("does not retry when ack times out after send", async () => {
    const sendChatExpectReply = vi.fn().mockRejectedValue(new Error("sendChatExpectReply timed out after 45000ms"));
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
      transportPeerId: "12D3KooWTimeoutPeer",
      envelope,
      dialHints: ["/p2p/12D3KooWTimeoutPeer"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 3,
    });

    expect(sendChatExpectReply).toHaveBeenCalledTimes(1);
    expect(sendChat).not.toHaveBeenCalled();
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

describe("deliverDataTransferWithRetry", () => {
  it("retries after first transfer failure and succeeds on second attempt", async () => {
    const sendDataTransfer = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale data stream"))
      .mockResolvedValueOnce(42);
    const mesh = {
      sendDataTransfer,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(1),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    const latencyMs = await deliverDataTransferWithRetry({
      mesh,
      transportPeerId: "12D3KooWDataPeer",
      voucherUtf8: new Uint8Array([1, 2, 3]),
      chunks: [new Uint8Array([4, 5])],
      dialHints: ["/p2p/12D3KooWDataPeer"],
      maxAttempts: 3,
    });

    expect(latencyMs).toBe(42);
    expect(sendDataTransfer).toHaveBeenCalledTimes(2);
    expect(mesh.closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWDataPeer");
  });

  it("warms data path before first transfer when not connected", async () => {
    const sendDataTransfer = vi.fn().mockResolvedValue(10);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendDataTransfer,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverDataTransferWithRetry({
      mesh,
      transportPeerId: "12D3KooWWarmDataPeer",
      voucherUtf8: new Uint8Array([1]),
      chunks: [new Uint8Array([2])],
      dialHints: ["/p2p/12D3KooWWarmDataPeer"],
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    expect(sendDataTransfer).toHaveBeenCalledTimes(1);
  });
});

describe("deliverExpectReplyWithRetry", () => {
  const requestEnvelope = { intent: "profile.request", messageId: "prof-req-1" } as EnvoyEnvelope;

  it("verifies connected peer before expect-reply send", async () => {
    const reply = { intent: "profile.response", payload: {}, messageId: "prof-res-1" } as EnvoyEnvelope;
    const sendExpectReply = vi.fn().mockResolvedValue(reply);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      send: vi.fn(),
      sendExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    const result = await deliverExpectReplyWithRetry({
      mesh,
      transportPeerId: "12D3KooWExpectReplyPeer",
      envelope: requestEnvelope,
      dialHints: ["/p2p/12D3KooWExpectReplyPeer"],
      maxAttempts: 1,
    });

    expect(result).toBe(reply);
    expect(ensurePeerReachable).toHaveBeenCalledWith(
      "12D3KooWExpectReplyPeer",
      ENVOY_MESSAGE_PROTOCOL,
      expect.objectContaining({ verifyConnection: true }),
    );
    expect(sendExpectReply).toHaveBeenCalledTimes(1);
  });

  it("retries after sendExpectReply failure and succeeds on second attempt", async () => {
    const reply = { intent: "discovery.response", payload: {}, messageId: "disc-res-1" } as EnvoyEnvelope;
    const sendExpectReply = vi
      .fn()
      .mockRejectedValueOnce(new Error("stale expect-reply stream"))
      .mockResolvedValueOnce(reply);
    const mesh = {
      send: vi.fn(),
      sendExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(1),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    const result = await deliverExpectReplyWithRetry({
      mesh,
      transportPeerId: "12D3KooWExpectReplyRetry",
      envelope: requestEnvelope,
      dialHints: ["/p2p/12D3KooWExpectReplyRetry"],
      maxAttempts: 3,
    });

    expect(result).toBe(reply);
    expect(sendExpectReply).toHaveBeenCalledTimes(2);
    expect(mesh.closeConnectionsToPeer).toHaveBeenCalledWith("12D3KooWExpectReplyRetry");
  });
});

describe("resolveChatDeliveryAckTimeoutMs", () => {
  it("uses shorter timeout for direct TCP dial hints", () => {
    expect(
      resolveChatDeliveryAckTimeoutMs(["/ip4/192.168.1.50/tcp/4011/p2p/12D3KooWPeer"]),
    ).toBe(12_000);
  });

  it("uses default protocol timeout for relay-only hints", () => {
    expect(
      resolveChatDeliveryAckTimeoutMs([
        "/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
      ]),
    ).toBe(CHAT_DELIVERY_ACK_TIMEOUT_MS);
  });
});

describe("prepareOutboundPeerConnection freshness", () => {
  it("skips verify for recently verified relay connections", async () => {
    resetOutboundPeerFreshnessForTests();
    const transportPeerId = "12D3KooWRelayFresh";
    markOutboundPeerVerified(transportPeerId);
    const ensurePeerReachable = vi.fn();
    const mesh = {
      closeConnectionsToPeer: vi.fn(),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    const ready = await prepareOutboundPeerConnection({
      mesh,
      transportPeerId,
      protocol: "/envoy/chat/0.1",
      dialHints: ["/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWRelayFresh"],
      preferCircuitHints: true,
      forceFreshDial: false,
    });

    expect(ready).toBe(true);
    expect(ensurePeerReachable).not.toHaveBeenCalled();
  });
});

describe("deliverChatEnvelopeWithRetry ack timeout", () => {
  it("passes LAN timeout to sendChatExpectReply for direct TCP hints", async () => {
    resetOutboundPeerFreshnessForTests();
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: { messageId: "msg-lan", deliveredAt: new Date().toISOString() },
    });
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn(),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: true }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWLanTimeout",
      envelope: { ...envelope, messageId: "msg-lan" },
      dialHints: ["/ip4/10.0.0.5/tcp/4011/p2p/12D3KooWLanTimeout"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(sendChatExpectReply).toHaveBeenCalledWith(
      "12D3KooWLanTimeout",
      expect.anything(),
      expect.objectContaining({ timeoutMs: 12_000 }),
    );
  });

  it("passes WAN timeout to sendChatExpectReply for relay-only hints", async () => {
    resetOutboundPeerFreshnessForTests();
    const sendChatExpectReply = vi.fn().mockResolvedValue({
      intent: "chat.delivered",
      payload: { messageId: "msg-wan", deliveredAt: new Date().toISOString() },
    });
    const mesh = {
      sendChat: vi.fn(),
      sendChatExpectReply,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWWanTimeout",
      envelope: { ...envelope, messageId: "msg-wan" },
      dialHints: ["/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWWanTimeout"],
      chatProtocol: "/envoy/chat/0.1",
      maxAttempts: 1,
    });

    expect(sendChatExpectReply).toHaveBeenCalledWith(
      "12D3KooWWanTimeout",
      expect.anything(),
      expect.objectContaining({ timeoutMs: CHAT_DELIVERY_ACK_TIMEOUT_MS }),
    );
  });
});
