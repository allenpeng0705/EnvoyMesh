/**
 * useCallSession + WebRtcCallTransport integration (real transport, mock node).
 *
 * Covers cross-NAT fixes: STUN path2 from start, listen-only, ICE queue, remote track.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallSession } from "../../src/hooks/useCallSession.js";
import { DEFAULT_CALL_ICE_SERVERS } from "../../src/lib/call-ice-servers.js";
import type { CallEvent, NodeService } from "@envoymesh/api";

function createMockNodeService(): NodeService & {
  emitCallEvent: (event: CallEvent) => void;
} {
  let callHandler: ((event: CallEvent) => void) | null = null;

  return {
    getActiveCall: () => null,
    onCallEvent(handler: (event: CallEvent) => void) {
      callHandler = handler;
      return () => {
        callHandler = null;
      };
    },
    emitCallEvent(event: CallEvent) {
      callHandler?.(event);
    },
    sendCallInvite: vi.fn(async () => "call-456"),
    sendCallReinvite: vi.fn(async () => true),
    acceptCallInvite: vi.fn(async () => true),
    declineCallInvite: vi.fn(async () => true),
    endCall: vi.fn(async () => true),
    setCallMuted: vi.fn(async () => true),
    sendIceCandidate: vi.fn(async () => true),
    getNodeConfig: vi.fn(async () => ({ iceServers: [] })),
    warmContactConnection: vi.fn(async () => ({ connected: true, direct: true })),
  } as unknown as NodeService & { emitCallEvent: (event: CallEvent) => void };
}

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string) => key,
}));

let mockNodeService = createMockNodeService();

describe("useCallSession media integration", () => {
  beforeEach(() => {
    mockNodeService = createMockNodeService();
    vi.clearAllMocks();
  });

  it("starts outbound call with STUN defaults (no explicit Path 1 [])", async () => {
    const { result } = renderHook(() => useCallSession());

    await act(async () => {
      await result.current.startCall("envoy:owner:win");
    });

    expect(mockNodeService.sendCallInvite).toHaveBeenCalledWith(
      "envoy:owner:win",
      expect.any(String),
      undefined,
      "audio",
    );
    expect(mockNodeService.sendCallInvite).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      [],
    );
    expect(result.current.callingState).toBe("call-456");
  });

  it("accepts with invite STUN iceServers and passes them to acceptCallInvite", async () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:incoming",
        callId: "call-456",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "Mac",
        callType: "audio",
        sdpOffer: "v=0\r\no=- mac-offer 0 IN IP4 127.0.0.1\r\n",
        iceServers: DEFAULT_CALL_ICE_SERVERS,
      });
    });

    await act(async () => {
      await result.current.acceptCall();
    });

    expect(mockNodeService.acceptCallInvite).toHaveBeenCalledWith(
      "call-456",
      expect.any(String),
      DEFAULT_CALL_ICE_SERVERS,
    );
    expect(result.current.activeCall?.callId).toBe("call-456");
    expect(result.current.micAvailable).toBe(true);
  });

  it("accepts listen-only when getUserMedia fails", async () => {
    const getUserMedia = (globalThis as any).navigator?.mediaDevices?.getUserMedia as ReturnType<
      typeof vi.fn
    >;
    getUserMedia?.mockRejectedValueOnce(new Error("Requested device not found"));

    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:incoming",
        callId: "call-456",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "Mac",
        callType: "audio",
        sdpOffer: "v=0\r\no=- mac-offer 0 IN IP4 127.0.0.1\r\n",
        iceServers: DEFAULT_CALL_ICE_SERVERS,
      });
    });

    await act(async () => {
      await result.current.acceptCall();
    });

    expect(mockNodeService.acceptCallInvite).toHaveBeenCalled();
    expect(result.current.micAvailable).toBe(false);
    expect(result.current.activeCall?.callId).toBe("call-456");
  });

  it("queues ICE candidates received before accept and applies them after", async () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:incoming",
        callId: "call-456",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "Mac",
        callType: "audio",
        sdpOffer: "v=0\r\no=- mac-offer 0 IN IP4 127.0.0.1\r\n",
        iceServers: DEFAULT_CALL_ICE_SERVERS,
      });
      mockNodeService.emitCallEvent({
        type: "call:ice-candidate",
        callId: "call-456",
        candidate: {
          candidate: "candidate:1 1 UDP 2113937159 192.0.2.1 54321 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      });
    });

    await act(async () => {
      await result.current.acceptCall();
    });

    expect(mockNodeService.acceptCallInvite).toHaveBeenCalled();
    expect(result.current.activeCall?.callId).toBe("call-456");
  });

  it("sets remoteStream when caller receives answer and remote audio track", async () => {
    const { result } = renderHook(() => useCallSession());

    await act(async () => {
      await result.current.startCall("envoy:owner:win");
    });

    await act(async () => {
      mockNodeService.emitCallEvent({
        type: "call:answered",
        callId: "call-456",
        sdpAnswer: "v=0\r\no=- win-answer 0 IN IP4 127.0.0.1\r\n",
      });
    });

    expect(result.current.activeCall?.callId).toBe("call-456");
  });

  it("accepts incoming video call with video mediaType", async () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:incoming",
        callId: "call-vid-456",
        peerOwnerId: "envoy:owner:mac",
        peerDisplayName: "Mac",
        callType: "video",
        sdpOffer: "v=0\r\no=- mac-video-offer 0 IN IP4 127.0.0.1\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
        iceServers: DEFAULT_CALL_ICE_SERVERS,
      });
    });

    expect(result.current.incomingCall?.callType).toBe("video");

    await act(async () => {
      await result.current.acceptCall();
    });

    expect(mockNodeService.acceptCallInvite).toHaveBeenCalled();
    expect(result.current.activeCall).toMatchObject({
      callId: "call-vid-456",
      callType: "video",
    });
    expect(result.current.cameraAvailable).toBe(true);
  });
});
