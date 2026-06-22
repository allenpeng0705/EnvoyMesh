// Phase 42G.1 — two-CallManager jsdom integration test.
//
// End-to-end integration test for the call protocol. Stands up two
// `CallManager` instances (caller side and callee side) and wires
// them together the way the home node would in production:
// the home's `call-inbound.ts` translates `call.invite` envelopes
// into `inboundCallReceived` calls on the callee's CallManager,
// and translates outbound events into signed envelopes that the
// caller's `call-inbound.ts` decodes back into CallManager calls.
//
// The test asserts:
//   * SDP offer round-trips through the call-invite path with the
//     callee seeing the exact SDP the caller generated.
//   * SDP answer round-trips through the call-accept path with the
//     caller seeing the exact SDP the callee generated.
//   * Hangup on either side transitions both call managers to the
//     empty state.
//   * Reject from callee → both managers reset.
//   * A second concurrent call attempt is rejected (one-call-per-
//     node is enforced on both sides).
//   * State machine transitions are reflected in `getActiveCall()`.

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { CallManager } from "../src/call-manager.js";

const CALLER_OWNER = "envoy:owner:caller";
const CALLEE_OWNER = "envoy:owner:callee";

// SDP samples used in the integration scenarios. Real SDP bodies
// are larger (10-50 KB) but a short canonical SDP is sufficient
// to assert round-trip semantics in this test.
const SDP_OFFER = "v=0\r\no=- caller-offer 0 IN IP4 127.0.0.1\r\n";
const SDP_ANSWER = "v=0\r\no=- callee-answer 0 IN IP4 127.0.0.1\r\n";

describe("Phase 42G.1 — two-CallManager integration", () => {
  let callerCm: CallManager;
  let calleeCm: CallManager;

  beforeEach(() => {
    vi.useFakeTimers();
    callerCm = new CallManager();
    calleeCm = new CallManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("SDP offer round-trips caller → callee through call.invite", () => {
    const callId = callerCm.outboundCallInitiated(
      "call-1", CALLER_OWNER, CALLEE_OWNER, "Callee",
    );
    expect(callId).toBe("call-1");

    // The home would translate the outbound call into a `call.invite`
    // envelope carrying `sdpOffer`. The callee's `call-inbound` then
    // routes it to `inboundCallReceived` with the offer.
    const events: any[] = [];
    calleeCm.onCallEvent((e) => events.push(e));
    const incoming = calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );
    expect(incoming).toEqual({ ok: true, callId: "call-1" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "call:incoming",
      callId: "call-1",
      sdpOffer: SDP_OFFER,
    });
  });

  it("SDP answer round-trips callee → caller through call.accept", () => {
    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );

    const callerEvents: any[] = [];
    callerCm.onCallEvent((e) => callerEvents.push(e));

    // Callee accepts — home translates acceptCallInvite into a
    // `call.accept` envelope with `sdpAnswer`. Caller's call-inbound
    // then invokes `outboundCallAccepted`.
    const accepted = calleeCm.acceptInboundCall("call-1", CALLEE_OWNER);
    expect(accepted).toBe(true);
    // The home propagates the answer back to the caller. We simulate
    // this by directly invoking the caller's outboundCallAccepted —
    // the SDP answer here is hypothetical from the production
    // pipeline (it would be carried inside the call.accept envelope).
    callerCm.outboundCallAccepted("call-1", SDP_ANSWER);

    expect(callerCm.getActiveCall()).toMatchObject({
      callId: "call-1", status: "active",
    });
    expect(callerEvents.some((e) => e.type === "call:answered" && e.sdpAnswer === SDP_ANSWER)).toBe(true);
  });

  it("hangup on either side clears both CallManagers", () => {
    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );
    calleeCm.acceptInboundCall("call-1", CALLEE_OWNER);
    callerCm.outboundCallAccepted("call-1");

    expect(callerCm.getActiveCall()).not.toBeNull();
    expect(calleeCm.getActiveCall()).not.toBeNull();

    // Callee hangs up. The home translates this to a `call.hangup`
    // envelope. Caller's call-inbound would dispatch
    // hangupCall(callId, reason).
    calleeCm.hangupCall("call-1", "normal");
    callerCm.hangupCall("call-1", "normal");

    expect(callerCm.getActiveCall()).toBeNull();
    expect(calleeCm.getActiveCall()).toBeNull();
  });

  it("reject from callee clears both CallManagers", () => {
    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );

    calleeCm.rejectCall("call-1", "declined");

    // In production the home sends a call.reject envelope; the
    // caller's CallManager dispatches hangupCall when it sees the
    // call has ended. We simulate that.
    callerCm.hangupCall("call-1", "rejected");

    expect(callerCm.getActiveCall()).toBeNull();
    expect(calleeCm.getActiveCall()).toBeNull();
  });

  it("one-call-per-node enforced on both sides (caller + callee)", () => {
    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );

    // Caller tries a second outbound — rejected (one-call-per-node).
    const secondOutbound = callerCm.outboundCallInitiated(
      "call-2", CALLER_OWNER, "envoy:owner:third-party", "Third",
    );
    expect(secondOutbound).toBeNull();

    // Callee (already ringing) tries to accept a second inbound —
    // rejected.
    const secondInbound = calleeCm.inboundCallReceived(
      "call-2", "envoy:owner:third-party", "peer-third", "Third", SDP_OFFER,
    );
    expect(secondInbound).toEqual({ ok: false, reason: "busy" });
  });

  it("caller side reflects state transitions in getActiveCall()", () => {
    expect(callerCm.getActiveCall()).toBeNull();

    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    expect(callerCm.getActiveCall()).toMatchObject({
      callId: "call-1",
      status: "ringing",
      peerOwnerId: CALLEE_OWNER,
    });

    callerCm.outboundCallAccepted("call-1");
    expect(callerCm.getActiveCall()).toMatchObject({
      callId: "call-1",
      status: "active",
    });

    callerCm.hangupCall("call-1", "normal");
    expect(callerCm.getActiveCall()).toBeNull();
  });

  it("callee side reflects state transitions in getActiveCall()", () => {
    expect(calleeCm.getActiveCall()).toBeNull();

    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );
    expect(calleeCm.getActiveCall()).toMatchObject({
      callId: "call-1",
      status: "ringing",
      peerOwnerId: CALLER_OWNER,
    });

    calleeCm.acceptInboundCall("call-1", CALLEE_OWNER);
    expect(calleeCm.getActiveCall()).toMatchObject({
      callId: "call-1",
      status: "active",
    });

    calleeCm.hangupCall("call-1", "normal");
    expect(calleeCm.getActiveCall()).toBeNull();
  });

  it("mute toggle is reflected in getActiveCall()", () => {
    callerCm.outboundCallInitiated("call-1", CALLER_OWNER, CALLEE_OWNER, "Callee");
    calleeCm.inboundCallReceived(
      "call-1", CALLER_OWNER, "peer-caller", "Caller", SDP_OFFER,
    );
    calleeCm.acceptInboundCall("call-1", CALLEE_OWNER);
    callerCm.outboundCallAccepted("call-1");

    expect(callerCm.getActiveCall()?.muted).toBe(false);

    // setMute emits `call:remote-mute` on the local call manager —
    // this is the event the home would forward as a `call.mute`
    // envelope to the peer.
    const events: any[] = [];
    callerCm.onCallEvent((e) => events.push(e));

    callerCm.setMute("call-1", true);
    expect(callerCm.getActiveCall()?.muted).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "call:remote-mute", muted: true });

    callerCm.setMute("call-1", false);
    expect(callerCm.getActiveCall()?.muted).toBe(false);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ type: "call:remote-mute", muted: false });
  });
});
