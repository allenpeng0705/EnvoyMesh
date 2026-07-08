import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallManager } from "../src/call-manager.js";
import { CALL_RING_TIMEOUT_MS } from "@envoymesh/protocol";

const LOCAL_OWNER = "envoy:owner:self";

describe("CallManager", () => {
  let cm: CallManager;

  beforeEach(() => {
    vi.useFakeTimers();
    cm = new CallManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ------------------------------------------------------------------
  // Outbound flow
  // ------------------------------------------------------------------
  describe("outbound calls", () => {
    it("registers outbound call and returns callId", () => {
      const callId = cm.outboundCallInitiated(
        "call-1",
        LOCAL_OWNER,
        "envoy:owner:bob",
        "Bob",
      );
      expect(callId).toBe("call-1");
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "ringing", callType: "audio" });
    });

    it("stores video callType on outbound call", () => {
      cm.outboundCallInitiated(
        "call-v1",
        LOCAL_OWNER,
        "envoy:owner:bob",
        "Bob",
        "video",
      );
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-v1", callType: "video" });
    });

    it("rejects second outbound when already in a call", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      const second = cm.outboundCallInitiated(
        "call-2",
        LOCAL_OWNER,
        "envoy:owner:charlie",
        "Charlie",
      );
      expect(second).toBeNull();
    });

    it("transitions to active when callee accepts", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      const accepted = cm.outboundCallAccepted("call-1", "v=0\r\nanswer");
      expect(accepted).toBe(true);
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "active" });
    });

    it("rejects outboundCallAccepted on non-existent callId", () => {
      expect(cm.outboundCallAccepted("nonexistent")).toBe(false);
    });

    it("allows outboundCallAccepted renegotiation when already active", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1"); // now active
      expect(cm.outboundCallAccepted("call-1", "v=0\r\nanswer2")).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // Inbound flow
  // ------------------------------------------------------------------
  describe("inbound calls", () => {
    it("registers inbound call and emits call:incoming event", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const result = cm.inboundCallReceived(
        "call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(result).toEqual({ ok: true, callId: "call-1" });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "call:incoming",
        callId: "call-1",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        callType: "audio",
        sdpOffer: "v=0\r\n...",
      });
    });

    it("emits call:incoming with callType video", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const result = cm.inboundCallReceived(
        "call-v2",
        "envoy:owner:alice",
        "peer-alice",
        "Alice",
        "v=0\r\nvideo...",
        undefined,
        "video",
      );
      expect(result).toEqual({ ok: true, callId: "call-v2" });
      expect(events[0]).toMatchObject({
        type: "call:incoming",
        callType: "video",
      });
      expect(cm.getActiveCall()?.callType).toBe("video");
    });

    it("deduplicates by (callId, callerOwnerId)", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      const duplicate = cm.inboundCallReceived(
        "call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
      expect(events).toHaveLength(1); // only one incoming event
    });

    it("rejects inbound when already in a call (busy)", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      const incoming = cm.inboundCallReceived(
        "call-2", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(incoming).toEqual({ ok: false, reason: "busy" });
    });

    it("acceptInboundCall transitions to active", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const accepted = cm.acceptInboundCall("call-1", LOCAL_OWNER);
      expect(accepted).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "call:answered", callId: "call-1" });
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "active" });
    });

    it("rejects acceptInboundCall on non-ringing call", () => {
      expect(cm.acceptInboundCall("nonexistent", LOCAL_OWNER)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // ICE trickle
  // ------------------------------------------------------------------
  describe("ICE candidates", () => {
    it("forwards ice candidates to subscribers for participants", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1");

      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const ok = cm.iceCandidateReceived(
        "call-1",
        { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
        "envoy:owner:bob",
      );
      expect(ok).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "call:ice-candidate",
        callId: "call-1",
      });
    });

    it("rejects ice from non-participants", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(
        cm.iceCandidateReceived(
          "call-1",
          { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
          "envoy:owner:mallory",
        ),
      ).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Ring timeout
  // ------------------------------------------------------------------
  describe("ring timeout", () => {
    it("auto-rejects after CALL_RING_TIMEOUT_MS", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      expect(cm.getActiveCall()?.status).toBe("ringing");

      // Advance past the timeout
      vi.advanceTimersByTime(CALL_RING_TIMEOUT_MS + 100);

      expect(events).toHaveLength(2); // incoming + rejected
      expect(events[1]).toMatchObject({
        type: "call:rejected",
        callId: "call-1",
        reason: "no_answer",
      });
      expect(cm.getActiveCall()).toBeNull();
    });

    it("cancels timer when acceptInboundCall is called", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      cm.acceptInboundCall("call-1", LOCAL_OWNER);

      vi.advanceTimersByTime(CALL_RING_TIMEOUT_MS + 100);

      // Should only have incoming + answered, NOT rejected
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("call:incoming");
      expect(events[1].type).toBe("call:answered");
    });
  });

  // ------------------------------------------------------------------
  // Reject / hangup
  // ------------------------------------------------------------------
  describe("reportOutboundDeliveryFailed", () => {
    it("emits call:error and call:ended for outbound ringing session", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.reportOutboundDeliveryFailed("call-1", "Could not reach contact");

      expect(events).toEqual([
        { type: "call:error", callId: "call-1", error: "Could not reach contact" },
        { type: "call:ended", callId: "call-1", reason: "error" },
      ]);
      expect(cm.getActiveCall()).toBeNull();
    });

    it("ignores unknown or inbound sessions", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      cm.reportOutboundDeliveryFailed("call-1", "ignored");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("call:incoming");
    });
  });

  describe("reject", () => {
    it("rejects ringing call", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      const result = cm.rejectCall("call-1", "declined");
      expect(result).toBe(true);
      expect(events[1]).toMatchObject({ type: "call:rejected", callId: "call-1", reason: "declined" });
      expect(cm.getActiveCall()).toBeNull();
    });

    it("rejects non-existent callId", () => {
      expect(cm.rejectCall("nonexistent", "declined")).toBe(false);
    });
  });

  describe("hangup", () => {
    it("hangs up active call", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1");
      const result = cm.hangupCall("call-1", "normal");
      expect(result).toBe(true);
      expect(events).toContainEqual({ type: "call:ended", callId: "call-1", reason: "normal" });
      expect(cm.getActiveCall()).toBeNull();
    });

    it("can hang up ringing call too", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(cm.hangupCall("call-1", "normal")).toBe(true);
      expect(cm.getActiveCall()).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  // Mute
  // ------------------------------------------------------------------
  describe("mute", () => {
    it("sets mute on active call", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1");

      const result = cm.setMute("call-1", true);
      expect(result).toBe(true);
      expect(events).toContainEqual({ type: "call:remote-mute", callId: "call-1", muted: true });
      expect(cm.getActiveCall()?.muted).toBe(true);
    });

    it("rejects mute on non-active call", () => {
      expect(cm.setMute("nonexistent", true)).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // call.reinvite — Path 1 → Path 2 fallback
  // ------------------------------------------------------------------
  describe("call.reinvite", () => {
    it("inboundCallReinvite emits call:reinvite while ringing", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\npath1");
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const ok = cm.inboundCallReinvite(
        "call-1",
        "envoy:owner:alice",
        "v=0\r\npath2",
        [{ urls: "stun:stun.l.google.com:19302" }],
        "path1_timeout",
      );
      expect(ok).toBe(true);
      expect(events).toContainEqual({
        type: "call:reinvite",
        callId: "call-1",
        peerOwnerId: "envoy:owner:alice",
        sdpOffer: "v=0\r\npath2",
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        reason: "path1_timeout",
        transportPath: "path2",
      });
    });

    it("canSendOutboundReinvite allows ringing and active outbound calls", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(cm.canSendOutboundReinvite("call-1", LOCAL_OWNER)).toBe(true);
      cm.outboundCallAccepted("call-1", "v=0\r\nanswer");
      expect(cm.canSendOutboundReinvite("call-1", LOCAL_OWNER)).toBe(true);
    });

    it("outboundCallAccepted works when already active (renegotiation)", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1", "v=0\r\nanswer1");
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));
      const ok = cm.outboundCallAccepted("call-1", "v=0\r\nanswer2");
      expect(ok).toBe(true);
      expect(events).toContainEqual({
        type: "call:answered",
        callId: "call-1",
        sdpAnswer: "v=0\r\nanswer2",
      });
    });

    it("acceptInboundCall allows renegotiation when already active", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      cm.acceptInboundCall("call-1", LOCAL_OWNER);
      expect(cm.acceptInboundCall("call-1", LOCAL_OWNER)).toBe(true);
    });

    it("isCalleeMatch works for outbound calls", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(cm.isCalleeMatch("call-1", "envoy:owner:bob")).toBe(true);
      expect(cm.isCalleeMatch("call-1", "envoy:owner:alice")).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  // Identity binding helpers
  // ------------------------------------------------------------------
  describe("identity binding", () => {
    it("isParticipant returns true for local and remote participants", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(cm.isParticipant("call-1", "envoy:owner:bob")).toBe(true);
      expect(cm.isParticipant("call-1", LOCAL_OWNER)).toBe(true);
    });

    it("isParticipant returns false for non-participant", () => {
      cm.outboundCallInitiated("call-1", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(cm.isParticipant("call-1", "envoy:owner:mallory")).toBe(false);
    });

    it("isCallerMatch works for inbound calls", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      expect(cm.isCallerMatch("call-1", "envoy:owner:alice")).toBe(true);
      expect(cm.isCallerMatch("call-1", "envoy:owner:bob")).toBe(false);
    });

    it("getSessionStatus returns null for unknown callId", () => {
      expect(cm.getSessionStatus("nonexistent")).toBeNull();
    });

    it("getSessionPeerOwnerId returns peer for known call", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      expect(cm.getSessionPeerOwnerId("call-1")).toBe("envoy:owner:alice");
    });
  });

  // ------------------------------------------------------------------
  // Transport peer ID storage — fast response delivery (Round 2 & 3)
  // ------------------------------------------------------------------
  describe("transport peer ID storage", () => {
    it("getSessionRemoteTransportPeerId returns null for unknown callId", () => {
      expect(cm.getSessionRemoteTransportPeerId("nonexistent")).toBeNull();
    });

    it("inboundCallReceived stores callerTransportPeerId as remoteTransportPeerId", () => {
      cm.inboundCallReceived(
        "call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
        undefined,
        "audio",
        "12D3KooWCallerTransport",
      );
      expect(cm.getSessionRemoteTransportPeerId("call-1")).toBe("12D3KooWCallerTransport");
    });

    it("inboundCallReceived without transport peer ID stores null", () => {
      cm.inboundCallReceived(
        "call-2", "envoy:owner:bob", "peer-bob", "Bob", "v=0\r\n...",
      );
      expect(cm.getSessionRemoteTransportPeerId("call-2")).toBeNull();
    });

    it("setOutboundTransportPeerId stores peer ID on outbound session", () => {
      cm.outboundCallInitiated("call-3", LOCAL_OWNER, "envoy:owner:charlie", "Charlie");
      cm.setOutboundTransportPeerId("call-3", "12D3KooWOutboundTransport");
      expect(cm.getSessionRemoteTransportPeerId("call-3")).toBe("12D3KooWOutboundTransport");
    });

    it("setOutboundTransportPeerId on non-existent session is a no-op", () => {
      cm.setOutboundTransportPeerId("nonexistent", "12D3KooWGhost");
      expect(cm.getSessionRemoteTransportPeerId("nonexistent")).toBeNull();
    });

    it("inbound transport peer ID persists after call ends", () => {
      const result = cm.inboundCallReceived(
        "in-call", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
        undefined,
        "audio",
        "12D3KooWInboundPeer",
      );
      expect(result).toEqual({ ok: true, callId: "in-call" });
      expect(cm.getSessionRemoteTransportPeerId("in-call")).toBe("12D3KooWInboundPeer");
      // End the call — transport peer ID is still stored on the session
      cm.rejectCall("in-call", "declined");
      expect(cm.getSessionRemoteTransportPeerId("in-call")).toBe("12D3KooWInboundPeer");
    });

    it("outbound transport peer ID set after outboundCallInitiated", () => {
      const callId = cm.outboundCallInitiated("out-call", LOCAL_OWNER, "envoy:owner:bob", "Bob");
      expect(callId).toBeTruthy();
      expect(cm.getSessionRemoteTransportPeerId("out-call")).toBeNull(); // not set yet
      cm.setOutboundTransportPeerId("out-call", "12D3KooWOutboundPeer");
      expect(cm.getSessionRemoteTransportPeerId("out-call")).toBe("12D3KooWOutboundPeer");
    });
  });

  // ------------------------------------------------------------------
  // Event unsubscribe
  // ------------------------------------------------------------------
  describe("event unsubscribe", () => {
    it("unsubscribes correctly", () => {
      const events: any[] = [];
      const unsub = cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      expect(events).toHaveLength(1);

      unsub();

      cm.inboundCallReceived("call-2", "envoy:owner:bob", "peer-bob", "Bob", "v=0\r\n...");
      expect(events).toHaveLength(1); // no new event after unsubscribe
    });
  });
});
