import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { ENVOY_CHAT_PROTOCOL } from "@envoymesh/network";
import { describe, expect, it, vi } from "vitest";
import { deliverCallEnvelopeWithRetry } from "../src/chat-outbound-deliver.js";

describe("deliverCallEnvelopeWithRetry (call.* on chat protocol)", () => {
  const callEnvelope = { intent: "call.invite" } as EnvoyEnvelope;

  it("uses mesh.sendChat (not send) for call envelopes", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const send = vi.fn();
    const mesh = {
      sendChat,
      send,
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

    expect(sendChat).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    expect(result.delivered).toBe(true);
  });

  it("warms before first send when not connected", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendChat,
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
    expect(sendChat).toHaveBeenCalledTimes(1);
  });

  it("skips warm when already connected (relay or direct)", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWConnectedCallPeer",
      envelope: callEnvelope,
      dialHints: ["/ip4/192.168.1.50/tcp/64780/p2p/12D3KooWConnectedCallPeer"],
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect(sendChat).toHaveBeenCalledWith(
      "12D3KooWConnectedCallPeer",
      callEnvelope,
      expect.objectContaining({ dialHints: [] }),
    );
  });

  it("keeps circuit dialHints when preferCircuitHints is explicit true on connected relay", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const peerId = "12D3KooWCircuitRetainCallPeer";
    const circuit =
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`;
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: peerId,
      envelope: callEnvelope,
      dialHints: [circuit],
      preferCircuitHints: true,
      maxAttempts: 1,
    });

    expect(sendChat).toHaveBeenCalledWith(
      peerId,
      callEnvelope,
      expect.objectContaining({
        dialHints: [circuit],
        preferCircuitHints: true,
      }),
    );
  });

  it("keeps dialHints for bond.request on connected relay (message-protocol path)", async () => {
    const send = vi.fn().mockResolvedValue(0);
    const peerId = "12D3KooWBondRetainPeer";
    const circuit =
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`;
    const bondEnvelope = { intent: "bond.request" } as EnvoyEnvelope;
    const mesh = {
      send,
      sendChat: vi.fn(),
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable: vi.fn().mockResolvedValue({ connected: true, direct: false }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: true, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: peerId,
      envelope: bondEnvelope,
      dialHints: [circuit],
      preferCircuitHints: true,
      maxAttempts: 1,
    });

    // bond.request is not a chat-protocol intent — routed to message send.
    expect(send).toHaveBeenCalledWith(
      peerId,
      bondEnvelope,
      expect.objectContaining({
        dialHints: [circuit],
        preferCircuitHints: true,
      }),
    );
  });

  it("honors preferCircuitHints override on first attempt", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: false });
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: "12D3KooWPreferCircuitCallPeer",
      envelope: callEnvelope,
      dialHints: [
        "/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPreferCircuitCallPeer",
      ],
      preferCircuitHints: true,
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledWith(
      "12D3KooWPreferCircuitCallPeer",
      ENVOY_CHAT_PROTOCOL,
      expect.objectContaining({ preferCircuitHints: true }),
    );
    expect(sendChat).toHaveBeenCalledTimes(1);
  });

  it("honors preferCircuitHints:false even when only private LAN hints exist", async () => {
    const sendChat = vi.fn().mockResolvedValue(0);
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: true });
    const peerId = "12D3KooWLanFastCallPeer";
    const mesh = {
      sendChat,
      closeConnectionsToPeer: vi.fn().mockResolvedValue(0),
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId: peerId,
      envelope: callEnvelope,
      dialHints: [
        `/ip4/192.168.1.42/tcp/4001/p2p/${peerId}`,
        `/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/${peerId}`,
      ],
      peerListenAddrs: [`/ip4/192.168.1.42/tcp/4001/p2p/${peerId}`],
      preferCircuitHints: false,
      maxAttempts: 1,
    });

    expect(ensurePeerReachable).toHaveBeenCalledWith(
      peerId,
      ENVOY_CHAT_PROTOCOL,
      expect.objectContaining({ preferCircuitHints: false }),
    );
    expect(sendChat).toHaveBeenCalledWith(
      peerId,
      callEnvelope,
      expect.objectContaining({ preferCircuitHints: false }),
    );
  });
});
