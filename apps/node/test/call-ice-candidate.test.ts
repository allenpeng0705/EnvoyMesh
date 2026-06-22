/**
 * Phase 42 — sendIceCandidate RPC and call.ice-candidate inbound forwarding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallManager } from "../src/call-manager.js";

describe("CallManager ICE + sendIceCandidate path", () => {
  let cm: CallManager;

  beforeEach(() => {
    cm = new CallManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards inbound ICE to local subscribers during ringing", () => {
    cm.inboundCallReceived(
      "call-1",
      "envoy:owner:alice",
      "peer-alice",
      "Alice",
      "v=0\r\n...",
    );
    cm.acceptInboundCall("call-1", "envoy:owner:self");

    const events: unknown[] = [];
    cm.onCallEvent((e) => events.push(e));

    const ok = cm.iceCandidateReceived(
      "call-1",
      { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 },
      "envoy:owner:alice",
    );

    expect(ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "call:ice-candidate",
      callId: "call-1",
    });
  });

  it("includes sdpAnswer on outbound call:answered", () => {
    cm.outboundCallInitiated(
      "call-1",
      "envoy:owner:self",
      "envoy:owner:bob",
      "Bob",
    );

    const events: unknown[] = [];
    cm.onCallEvent((e) => events.push(e));

    cm.outboundCallAccepted("call-1", "v=0\r\nanswer", [
      { urls: "stun:stun.example.com:3478" },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "call:answered",
      callId: "call-1",
      sdpAnswer: "v=0\r\nanswer",
    });
  });
});
