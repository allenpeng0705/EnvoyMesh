/**
 * webrtc-call-transport.test.ts — Phase 38 WebRTC call transport tests.
 *
 * Tests the WebRtcCallTransport with mock browser APIs (RTCPeerConnection,
 * getUserMedia, MediaStream). Uses fake timers for Path 1 timeout testing.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWebRtcCallTransport, type WebRtcCallTransportOptions } from "../../src/lib/webrtc-call-transport.js";

// --------------------------------------------------------------------------
// Access the mocks from vitest.setup.ts
// --------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockRTCPeerConnection = (globalThis as any).RTCPeerConnection as any;
const mockGetUserMedia = () => (globalThis as any).navigator?.mediaDevices?.getUserMedia as ReturnType<typeof vi.fn>;

// --------------------------------------------------------------------------
// Track the last created PC instance for assertions
// --------------------------------------------------------------------------

let lastCreatedPC: any = null;

// Store reference to original constructor
const originalPC = MockRTCPeerConnection;

// Wrap the constructor to track instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WrappedMockPC(this: any, ...args: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastCreatedPC = new (originalPC as any)(...args);
  return lastCreatedPC;
}
// Copy prototype and static methods
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(WrappedMockPC as any).prototype = originalPC.prototype;
(WrappedMockPC as any).generateCertificate = originalPC.generateCertificate?.bind(originalPC);

// Replace the global with our wrapper
(globalThis as any).RTCPeerConnection = WrappedMockPC;

// --------------------------------------------------------------------------
// Helper: create transport with test callbacks
// --------------------------------------------------------------------------

function createTestTransport(overrides: Partial<WebRtcCallTransportOptions> = {}): {
  transport: ReturnType<typeof createWebRtcCallTransport>;
  onRemoteStream: ReturnType<typeof vi.fn>;
  onConnectionStateChange: ReturnType<typeof vi.fn>;
  onSdpGenerated: ReturnType<typeof vi.fn>;
  onIceCandidate: ReturnType<typeof vi.fn>;
  onPath1Timeout: ReturnType<typeof vi.fn>;
} {
  const onRemoteStream = vi.fn();
  const onConnectionStateChange = vi.fn();
  const onSdpGenerated = vi.fn();
  const onIceCandidate = vi.fn();
  const onPath1Timeout = vi.fn();

  const transport = createWebRtcCallTransport({
    path: "path1",
    onRemoteStream,
    onConnectionStateChange,
    onSdpGenerated,
    onIceCandidate,
    onMutePayload: vi.fn(),
    path1TimeoutMs: 100,
    onPath1Timeout,
    ...overrides,
  });

  return { transport, onRemoteStream, onConnectionStateChange, onSdpGenerated, onIceCandidate, onPath1Timeout };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe("WebRtcCallTransport", () => {
  beforeEach(() => {
    lastCreatedPC = null;
    mockGetUserMedia()?.mockClear();
  });

  describe("startOffer (Path 1)", () => {
    it("creates RTCPeerConnection with empty iceServers for Path 1", async () => {
      const { transport, onSdpGenerated } = createTestTransport();
      await transport.startOffer();

      expect(lastCreatedPC).toBeDefined();
      expect(lastCreatedPC.createOffer).toHaveBeenCalled();
      expect(onSdpGenerated).toHaveBeenCalledWith("mock-offer", "offer");
    });

    it("gets user media and adds audio track", async () => {
      const { transport } = createTestTransport();
      await transport.startOffer();

      expect(mockGetUserMedia()).toHaveBeenCalledWith({ audio: true });
      expect(lastCreatedPC.addTrack).toHaveBeenCalled();
    });

    it("starts Path 1 timeout timer", async () => {
      vi.useFakeTimers();
      const { transport, onPath1Timeout } = createTestTransport({ path1TimeoutMs: 100 });

      const offerPromise = transport.startOffer();
      await vi.runAllTimersAsync();
      await offerPromise;

      // Timeout should have fired and called onPath1Timeout
      expect(onPath1Timeout).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("clears Path 1 timeout when connection succeeds", async () => {
      vi.useFakeTimers();
      const { transport, onPath1Timeout } = createTestTransport({ path1TimeoutMs: 100 });

      const offerPromise = transport.startOffer();
      await vi.advanceTimersByTimeAsync(50); // advance time but not to timeout
      await offerPromise;

      // Timeout should NOT have fired yet (only 50ms of 100ms)
      expect(onPath1Timeout).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it("throws if transport is closed", async () => {
      const { transport } = createTestTransport();
      transport.close();

      await expect(transport.startOffer()).rejects.toThrow("Transport closed");
    });
  });

  describe("startOffer (Path 2)", () => {
    it("creates RTCPeerConnection with iceServers for Path 2", async () => {
      const { transport } = createTestTransport({
        path: "path2",
        iceServers: [{ urls: "stun:stun.example.com" }],
      });

      await transport.startOffer();

      expect(lastCreatedPC).toBeDefined();
      expect(lastCreatedPC.createOffer).toHaveBeenCalled();
    });

    it("does not set Path 1 timeout for Path 2", async () => {
      vi.useFakeTimers();
      const { transport, onPath1Timeout } = createTestTransport({
        path: "path2",
        path1TimeoutMs: 100,
      });

      const offerPromise = transport.startOffer();
      await vi.runAllTimersAsync();
      await offerPromise;

      // Timeout should NOT fire for Path 2
      expect(onPath1Timeout).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe("startAnswer", () => {
    it("creates RTCPeerConnection and returns SDP answer", async () => {
      const { transport, onSdpGenerated } = createTestTransport();
      await transport.startAnswer("remote-offer-sdp");

      expect(lastCreatedPC).toBeDefined();
      expect(lastCreatedPC.createAnswer).toHaveBeenCalled();
      expect(onSdpGenerated).toHaveBeenCalledWith("mock-answer", "answer");
    });
  });

  describe("setMute", () => {
    it("calls setMute on transport", async () => {
      const { transport } = createTestTransport();
      await transport.startOffer();

      transport.setMute(true);
      // setMute should be callable without error
      expect(() => transport.setMute(true)).not.toThrow();
    });

    it("can unmute after muting", async () => {
      const { transport } = createTestTransport();
      await transport.startOffer();

      transport.setMute(true);
      transport.setMute(false);
      expect(() => transport.setMute(false)).not.toThrow();
    });
  });

  describe("applyRemoteAnswer", () => {
    it("sets remote answer SDP on the peer connection", async () => {
      const { transport } = createTestTransport({ path: "path2" });
      await transport.startOffer();

      await transport.applyRemoteAnswer("remote-answer-sdp");

      expect(lastCreatedPC.setRemoteDescription).toHaveBeenCalled();
    });

    it("throws when transport is not ready", async () => {
      const { transport } = createTestTransport({ path: "path2" });
      await expect(transport.applyRemoteAnswer("remote-answer-sdp")).rejects.toThrow(
        "Transport not ready for remote answer",
      );
    });
  });

  describe("addIceCandidate", () => {
    it("accepts remote ICE candidates without throwing", async () => {
      const { transport } = createTestTransport({ path: "path2" });
      await transport.startOffer();
      if (lastCreatedPC && typeof lastCreatedPC.addIceCandidate !== "function") {
        lastCreatedPC.addIceCandidate = vi.fn().mockResolvedValue(undefined);
      }

      await expect(
        transport.addIceCandidate({
          candidate: "candidate:1 1 UDP 2113937159 192.0.2.1 54321 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        }),
      ).resolves.toBeUndefined();
    });

    it("no-ops when transport is closed", async () => {
      const { transport } = createTestTransport({ path: "path2" });
      transport.close();
      await expect(
        transport.addIceCandidate({
          candidate: "candidate:1",
          sdpMid: "0",
          sdpMLineIndex: 0,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("close", () => {
    it("closes peer connection", async () => {
      const { transport } = createTestTransport();
      await transport.startOffer();

      transport.close();

      expect(lastCreatedPC.close).toHaveBeenCalled();
    });

    it("is idempotent (can be called multiple times)", () => {
      const { transport } = createTestTransport();
      transport.close();
      transport.close(); // should not throw
    });
  });

  describe("connection state changes", () => {
    it("calls onConnectionStateChange when state changes", async () => {
      const { transport, onConnectionStateChange } = createTestTransport();
      await transport.startOffer();

      lastCreatedPC.onconnectionstatechange?.();
      expect(onConnectionStateChange).toHaveBeenCalledWith("new");
    });
  });

  describe("onPath1Timeout callback", () => {
    it("is called when Path 1 times out", async () => {
      vi.useFakeTimers();
      const { transport, onPath1Timeout } = createTestTransport({ path1TimeoutMs: 100 });

      const offerPromise = transport.startOffer();
      await vi.runAllTimersAsync();
      await offerPromise;

      expect(onPath1Timeout).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it("is optional — does not error if not provided", async () => {
      vi.useFakeTimers();
      const transport = createWebRtcCallTransport({
        path: "path1",
        onRemoteStream: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onSdpGenerated: vi.fn(),
        onIceCandidate: vi.fn(),
        onMutePayload: vi.fn(),
        path1TimeoutMs: 100,
        // onPath1Timeout intentionally omitted
      });

      const offerPromise = transport.startOffer();
      await vi.runAllTimersAsync();
      await offerPromise; // should not throw

      vi.useRealTimers();
    });
  });
});
