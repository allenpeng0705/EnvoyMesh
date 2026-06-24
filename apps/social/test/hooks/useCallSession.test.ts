/**
 * useCallSession — media-plane wiring tests (Phase 42).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallSession } from "../../src/hooks/useCallSession.js";
import type { CallEvent, NodeService } from "@envoymesh/api";

function createMockNodeService(): NodeService & {
  emitCallEvent: (event: CallEvent) => void;
} {
  let callHandler: ((event: CallEvent) => void) | null = null;

  const service = {
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
    sendCallInvite: vi.fn(async () => "call-123"),
    sendCallReinvite: vi.fn(async () => true),
    acceptCallInvite: vi.fn(async () => true),
    declineCallInvite: vi.fn(async () => true),
    endCall: vi.fn(async () => true),
    setCallMuted: vi.fn(async () => true),
    sendIceCandidate: vi.fn(async () => true),
    getNodeConfig: vi.fn(async () => ({ iceServers: [] })),
    warmContactConnection: vi.fn(async () => ({ connected: true, direct: true })),
  } as unknown as NodeService & { emitCallEvent: (event: CallEvent) => void };

  return service;
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

let latestOnPath1Timeout: (() => void) | undefined;

vi.mock("../../src/lib/webrtc-call-transport.js", () => ({
  createWebRtcCallTransport: (opts: { onPath1Timeout?: () => void }) => {
    latestOnPath1Timeout = opts.onPath1Timeout;
    let micAvailable = true;
    return {
      startOffer: vi.fn(async () => {
        micAvailable = mockMicAvailableOnOffer;
        return "local-offer";
      }),
      startAnswer: vi.fn(async () => "local-answer"),
      applyRemoteAnswer: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      setMute: vi.fn(),
      isMicAvailable: vi.fn(() => micAvailable),
      close: vi.fn(),
    };
  },
}));

let mockMicAvailableOnOffer = true;

describe("useCallSession media plane", () => {
  beforeEach(() => {
    mockNodeService = createMockNodeService();
    latestOnPath1Timeout = undefined;
    mockMicAvailableOnOffer = true;
    vi.clearAllMocks();
  });

  it("subscribes to individual call:* events and sets activeCall on call:answered", () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:answered",
        callId: "call-123",
        sdpAnswer: "remote-answer",
      });
    });

    expect(result.current.activeCall).toMatchObject({
      callId: "call-123",
      status: "active",
    });
    expect(result.current.connectionState).toBe("connected");
  });

  it("forwards trickle ICE via sendIceCandidate during outbound call", async () => {
    const { result } = renderHook(() => useCallSession());

    await act(async () => {
      await result.current.startCall("envoy:owner:bob");
    });

    expect(mockNodeService.sendCallInvite).toHaveBeenCalledWith(
      "envoy:owner:bob",
      "local-offer",
      [],
    );
  });

  it("still places outbound call when microphone is unavailable (listen-only)", async () => {
    mockMicAvailableOnOffer = false;
    const { result } = renderHook(() => useCallSession());

    await act(async () => {
      await result.current.startCall("envoy:owner:bob");
    });

    expect(mockNodeService.sendCallInvite).toHaveBeenCalledWith(
      "envoy:owner:bob",
      "local-offer",
      [],
    );
    expect(result.current.callingState).toBe("call-123");
    expect(result.current.micAvailable).toBe(false);
  });

  it("sends call.reinvite on Path 1 timeout during outbound call", async () => {
    const { result } = renderHook(() => useCallSession());

    await act(async () => {
      await result.current.startCall("envoy:owner:bob");
    });

    await act(async () => {
      latestOnPath1Timeout?.();
    });

    expect(mockNodeService.sendCallReinvite).toHaveBeenCalledWith(
      "call-123",
      "local-offer",
      [],
      "path1_timeout",
    );
  });

  it("handles call:reinvite while active and re-accepts with Path 2", async () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:incoming",
        callId: "call-123",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        sdpOffer: "path1-offer",
        iceServers: [],
      });
    });

    await act(async () => {
      await result.current.acceptCall();
    });

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:reinvite",
        callId: "call-123",
        peerOwnerId: "envoy:owner:alice",
        sdpOffer: "path2-offer",
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        reason: "path1_timeout",
        transportPath: "path2",
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockNodeService.acceptCallInvite).toHaveBeenCalledTimes(2);
  });

  it("clears state on call:ended", () => {
    const { result } = renderHook(() => useCallSession());

    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:answered",
        callId: "call-123",
      });
    });
    act(() => {
      mockNodeService.emitCallEvent({
        type: "call:ended",
        callId: "call-123",
        reason: "normal",
      });
    });

    expect(result.current.activeCall).toBeNull();
    expect(result.current.connectionState).toBe("disconnected");
  });
});
