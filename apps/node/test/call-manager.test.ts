import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallManager } from "../src/call-manager.js";
import { CALL_RING_TIMEOUT_MS } from "@envoymesh/protocol";

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
      const callId = cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      expect(callId).toBe("call-1");
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "ringing" });
    });

    it("rejects second outbound when already in a call", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      const second = cm.outboundCallInitiated("call-2", "envoy:owner:charlie", "Charlie");
      expect(second).toBeNull();
    });

    it("transitions to active when callee accepts", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      const accepted = cm.outboundCallAccepted("call-1");
      expect(accepted).toBe(true);
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "active" });
    });

    it("rejects outboundCallAccepted on non-existent callId", () => {
      expect(cm.outboundCallAccepted("nonexistent")).toBe(false);
    });

    it("rejects outboundCallAccepted when not in ringing state", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1"); // now active
      expect(cm.outboundCallAccepted("call-1")).toBe(false); // not ringing anymore
    });
  });

  // ------------------------------------------------------------------
  // Inbound flow
  // ------------------------------------------------------------------
  describe("inbound calls", () => {
    it("registers inbound call and emits call:incoming event", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const callId = cm.inboundCallReceived(
        "call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(callId).toBe("call-1");
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "call:incoming",
        callId: "call-1",
        peerOwnerId: "envoy:owner:alice",
        peerDisplayName: "Alice",
        sdpOffer: "v=0\r\n...",
      });
    });

    it("deduplicates by (callId, callerOwnerId)", () => {
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      const duplicate = cm.inboundCallReceived(
        "call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(duplicate).toBeNull();
      expect(events).toHaveLength(1); // only one incoming event
    });

    it("rejects inbound when already in a call (busy)", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      const incoming = cm.inboundCallReceived(
        "call-2", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...",
      );
      expect(incoming).toBeNull();
    });

    it("acceptInboundCall transitions to active", () => {
      cm.inboundCallReceived("call-1", "envoy:owner:alice", "peer-alice", "Alice", "v=0\r\n...");
      const events: any[] = [];
      cm.onCallEvent((e) => events.push(e));

      const accepted = cm.acceptInboundCall("call-1", "envoy:owner:self");
      expect(accepted).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "call:answered", callId: "call-1" });
      expect(cm.getActiveCall()).toMatchObject({ callId: "call-1", status: "active" });
    });

    it("rejects acceptInboundCall on non-ringing call", () => {
      expect(cm.acceptInboundCall("nonexistent", "envoy:owner:self")).toBe(false);
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
      cm.acceptInboundCall("call-1", "envoy:owner:self");

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

      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      cm.outboundCallAccepted("call-1");
      const result = cm.hangupCall("call-1", "normal");
      expect(result).toBe(true);
      expect(events).toContainEqual({ type: "call:ended", callId: "call-1", reason: "normal" });
      expect(cm.getActiveCall()).toBeNull();
    });

    it("can hang up ringing call too", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
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

      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
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
  // Identity binding helpers
  // ------------------------------------------------------------------
  describe("identity binding", () => {
    it("isParticipant returns true for participant", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
      // In outbound, only peer is in participants initially
      expect(cm.isParticipant("call-1", "envoy:owner:bob")).toBe(true);
    });

    it("isParticipant returns false for non-participant", () => {
      cm.outboundCallInitiated("call-1", "envoy:owner:bob", "Bob");
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
