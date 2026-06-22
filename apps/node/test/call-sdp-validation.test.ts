/**
 * Phase 42A — call-inbound.ts defensive SDP / ICE-candidate validation tests.
 *
 * Verifies:
 *  - validateSdpString accepts valid SDP, rejects empty/oversize/non-string
 *  - validateIceCandidate accepts standard SDP candidate grammar, rejects junk
 */

import { describe, expect, it } from "vitest";

import {
  MAX_SDP_BYTES,
  validateIceCandidate,
  validateSdpString,
} from "../src/call-inbound.js";

describe("validateSdpString", () => {
  it("accepts a non-empty short SDP", () => {
    expect(validateSdpString("v=0\r\n...\r\n")).toBe(true);
  });

  it("accepts a realistically-sized SDP (32 KB)", () => {
    const sdp = "v=0\r\n" + "a=rtpmap:0 PCMU/8000\r\n".repeat(1500);
    expect(sdp.length).toBeGreaterThan(20_000);
    expect(sdp.length).toBeLessThan(MAX_SDP_BYTES);
    expect(validateSdpString(sdp)).toBe(true);
  });

  it("accepts an SDP at exactly the size cap", () => {
    const sdp = "v=0\r\n" + "x".repeat(MAX_SDP_BYTES - 5);
    expect(validateSdpString(sdp)).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(validateSdpString("")).toBe(false);
  });

  it("rejects a string at size-cap + 1", () => {
    const sdp = "v=0\r\n" + "x".repeat(MAX_SDP_BYTES);
    expect(validateSdpString(sdp)).toBe(false);
  });

  it("rejects a 1 MB SDP (DoS attempt)", () => {
    const sdp = "v=0\r\n" + "x".repeat(1024 * 1024);
    expect(validateSdpString(sdp)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(validateSdpString(undefined)).toBe(false);
    expect(validateSdpString(null)).toBe(false);
    expect(validateSdpString(42)).toBe(false);
    expect(validateSdpString({})).toBe(false);
    expect(validateSdpString(["v=0\r\n"])).toBe(false);
  });
});

describe("validateIceCandidate", () => {
  it("accepts a standard SDP candidate", () => {
    expect(validateIceCandidate("candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(
      true,
    );
  });

  it("accepts a srflx candidate with raddr/rport", () => {
    expect(
      validateIceCandidate(
        "candidate:2 1 UDP 1677729535 198.51.100.7 23456 typ srflx raddr 192.0.2.1 rport 12345",
      ),
    ).toBe(true);
  });

  it("accepts a candidate with generation", () => {
    expect(
      validateIceCandidate(
        "candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host generation 0",
      ),
    ).toBe(true);
  });

  it("accepts a candidate with network-cost", () => {
    expect(
      validateIceCandidate(
        "candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host network-cost 10",
      ),
    ).toBe(true);
  });

  it("accepts an ICE-TCP candidate with tcptype (RFC 6544)", () => {
    expect(
      validateIceCandidate(
        "candidate:1 1 tcp 1518280447 192.0.2.3 9 typ host tcptype active",
      ),
    ).toBe(true);
  });

  it("accepts a relay TCP candidate with tcptype + raddr/rport", () => {
    expect(
      validateIceCandidate(
        "candidate:2 1 TCP 1518280447 198.51.100.5 12345 typ relay tcptype passive raddr 192.0.2.1 rport 9",
      ),
    ).toBe(true);
  });

  it("rejects an empty candidate", () => {
    expect(validateIceCandidate("")).toBe(false);
  });

  it("rejects a candidate that doesn't start with 'candidate:'", () => {
    expect(validateIceCandidate("1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(false);
  });

  it("rejects a candidate with a leading space", () => {
    expect(validateIceCandidate(" candidate:1 1 UDP 2113929471 192.0.2.1 12345 typ host")).toBe(
      false,
    );
  });

  it("rejects a candidate with arbitrary junk", () => {
    expect(validateIceCandidate("not-a-real-candidate")).toBe(false);
    expect(validateIceCandidate("candidate:!@#$%")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(validateIceCandidate(undefined)).toBe(false);
    expect(validateIceCandidate(null)).toBe(false);
    expect(validateIceCandidate({})).toBe(false);
    expect(validateIceCandidate(123)).toBe(false);
  });

  it("rejects candidates longer than 1024 bytes", () => {
    expect(validateIceCandidate("candidate:" + "x".repeat(1100))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 42I — callee-side VoIP push dispatch hook (handleCallInvite)
// ---------------------------------------------------------------------------

import { handleCallIntent, type CallInboundDeps } from "../src/call-inbound.js";
import { createCallInvitePayload, type EnvoyEnvelope } from "@envoymesh/protocol";
import { describe as describe2, expect as expect2, it as it2, vi } from "vitest";

function buildInviteEnvelope(callerOwnerId: string, callId: string): EnvoyEnvelope {
  const payload = createCallInvitePayload({
    callId,
    callerOwnerId,
    callerPeerId: `envoy_peer_${callerOwnerId}`,
    sdpOffer: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n",
  });
  // Minimal envelope. senderPeerId is set to the owner ID because
  // senderOwnerId() falls back to senderPeerId when there's no
  // agentCredential — identity binding requires sender == callerOwnerId.
  return {
    version: "0.1",
    messageId: "m1",
    createdAt: new Date().toISOString(),
    senderPeerId: callerOwnerId,
    senderPublicKey: "pk",
    senderRole: "human",
    recipientRole: "human",
    intent: "call.invite",
    payload,
    signature: "sig",
  } as unknown as EnvoyEnvelope;
}

function buildDeps(overrides: Partial<CallInboundDeps> = {}): CallInboundDeps {
  return {
    callManager: {
      inboundCallReceived: vi.fn(() => ({ ok: true, callId: "call-1" })),
    } as unknown as CallInboundDeps["callManager"],
    trustStore: {
      getTrustRecord: vi.fn(async () => ({ level: "direct", displayName: "Alice" })),
    } as unknown as CallInboundDeps["trustStore"],
    peerDirectoryStore: {} as unknown as CallInboundDeps["peerDirectoryStore"],
    sendResponseEnvelope: vi.fn(async () => {}),
    calleeOwnerId: "envoy:owner:callee",
    ...overrides,
  } as CallInboundDeps;
}

describe2("call.invite VoIP push dispatch (Phase 42I)", () => {
  const caller = "envoy:owner:alice";
  const callId = "11111111-1111-4111-8111-111111111111";

  it2("dispatches a VoIP push when the phone has no authenticated WS", async () => {
    const dispatch = vi.fn(async () => {});
    const deps = buildDeps({
      isDeviceOnline: () => false,
      dispatchIncomingCallPush: dispatch,
    });
    await handleCallIntent(buildInviteEnvelope(caller, callId), deps);
    expect2(dispatch).toHaveBeenCalledWith({
      callId,
      callerOwnerId: caller,
      callerName: "Alice",
      calleeOwnerId: "envoy:owner:callee",
    });
  });

  it2("suppresses the push when the phone already has a WS session", async () => {
    const dispatch = vi.fn(async () => {});
    const deps = buildDeps({
      isDeviceOnline: () => true,
      dispatchIncomingCallPush: dispatch,
    });
    await handleCallIntent(buildInviteEnvelope(caller, callId), deps);
    expect2(dispatch).not.toHaveBeenCalled();
  });

  it2("defaults to online (no push) when isDeviceOnline is not wired", async () => {
    const dispatch = vi.fn(async () => {});
    const deps = buildDeps({ dispatchIncomingCallPush: dispatch });
    await handleCallIntent(buildInviteEnvelope(caller, callId), deps);
    expect2(dispatch).not.toHaveBeenCalled();
  });

  it2("does not push for an untrusted (public) caller", async () => {
    const dispatch = vi.fn(async () => {});
    const deps = buildDeps({
      trustStore: { getTrustRecord: vi.fn(async () => ({ level: "public" })) } as unknown as CallInboundDeps["trustStore"],
      isDeviceOnline: () => false,
      dispatchIncomingCallPush: dispatch,
    });
    await handleCallIntent(buildInviteEnvelope(caller, callId), deps);
    expect2(dispatch).not.toHaveBeenCalled();
  });

  it2("swallows push-delivery errors without failing the call", async () => {
    const dispatch = vi.fn(async () => {
      throw new Error("APNs 503");
    });
    const deps = buildDeps({
      isDeviceOnline: () => false,
      dispatchIncomingCallPush: dispatch,
    });
    // Should not throw.
    await expect2(handleCallIntent(buildInviteEnvelope(caller, callId), deps)).resolves.toBe(true);
  });
});