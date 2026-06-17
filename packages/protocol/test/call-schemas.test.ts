import { describe, expect, it } from "vitest";
import {
  CALL_RING_TIMEOUT_MS,
  CallInvitePayloadSchema,
  CallAcceptPayloadSchema,
  CallRejectPayloadSchema,
  CallIceCandidatePayloadSchema,
  CallHangupPayloadSchema,
  CallMutePayloadSchema,
  createCallInvitePayload,
  createCallAcceptPayload,
  createCallRejectPayload,
  createCallIceCandidatePayload,
  createCallHangupPayload,
  createCallMutePayload,
  parseCallInvitePayload,
  parseCallAcceptPayload,
  parseCallRejectPayload,
  parseCallIceCandidatePayload,
  parseCallHangupPayload,
  parseCallMutePayload,
  createUnsignedEnvelope,
  evaluateEnvelopeRolePolicy,
} from "../src/index.js";

// --------------------------------------------------------------------------
// call.invite
// --------------------------------------------------------------------------
describe("CallInvitePayloadSchema", () => {
  it("roundtrips via create + parse with sdpOffer", () => {
    const payload = createCallInvitePayload({
      callId: "00000000-0000-4000-a000-000000000001",
      callerOwnerId: "envoy:owner:alice",
      callerPeerId: "peer-alice",
      sdpOffer: "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n...",
    });
    const parsed = parseCallInvitePayload(payload);
    expect(parsed.callId).toBe("00000000-0000-4000-a000-000000000001");
    expect(parsed.callerOwnerId).toBe("envoy:owner:alice");
    expect(parsed.sdpOffer).toContain("v=0");
    expect(parsed.callType).toBe("audio");
  });

  it("roundtrips with optional iceServers", () => {
    const payload = createCallInvitePayload({
      callId: "00000000-0000-4000-a000-000000000002",
      callerOwnerId: "envoy:owner:alice",
      callerPeerId: "peer-alice",
      sdpOffer: "v=0\r\n...",
      iceServers: [{ urls: "turn:relay.example.com:3478", username: "user", credential: "pass" }],
    });
    const parsed = parseCallInvitePayload(payload);
    expect(parsed.iceServers).toHaveLength(1);
    expect(parsed.iceServers?.[0]?.urls).toBe("turn:relay.example.com:3478");
  });

  it("rejects missing sdpOffer", () => {
    expect(() =>
      CallInvitePayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000003",
        callerOwnerId: "envoy:owner:alice",
        callerPeerId: "peer-alice",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("rejects empty sdpOffer", () => {
    expect(() =>
      createCallInvitePayload({
        callId: "00000000-0000-4000-a000-000000000004",
        callerOwnerId: "envoy:owner:alice",
        callerPeerId: "peer-alice",
        sdpOffer: "",
      }),
    ).toThrow();
  });

  it("rejects invalid callId (not UUID)", () => {
    expect(() =>
      createCallInvitePayload({
        callId: "not-a-uuid",
        callerOwnerId: "envoy:owner:alice",
        callerPeerId: "peer-alice",
        sdpOffer: "v=0\r\n...",
      }),
    ).toThrow();
  });

  it("auto-fills timestamp when omitted", () => {
    const payload = createCallInvitePayload({
      callId: "00000000-0000-4000-a000-000000000005",
      callerOwnerId: "envoy:owner:alice",
      callerPeerId: "peer-alice",
      sdpOffer: "v=0\r\n...",
    });
    expect(payload.timestamp).toBeDefined();
    expect(() => new Date(payload.timestamp)).not.toThrow();
  });
});

// --------------------------------------------------------------------------
// call.accept
// --------------------------------------------------------------------------
describe("CallAcceptPayloadSchema", () => {
  it("roundtrips via create + parse with sdpAnswer", () => {
    const payload = createCallAcceptPayload({
      callId: "00000000-0000-4000-a000-000000000011",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      sdpAnswer: "v=0\r\no=- 456 2 IN IP4 192.168.1.1\r\n...",
    });
    const parsed = parseCallAcceptPayload(payload);
    expect(parsed.callId).toBe("00000000-0000-4000-a000-000000000011");
    expect(parsed.calleeOwnerId).toBe("envoy:owner:bob");
    expect(parsed.sdpAnswer).toContain("v=0");
  });

  it("rejects empty sdpAnswer", () => {
    expect(() =>
      createCallAcceptPayload({
        callId: "00000000-0000-4000-a000-000000000012",
        calleeOwnerId: "envoy:owner:bob",
        calleePeerId: "peer-bob",
        sdpAnswer: "",
      }),
    ).toThrow();
  });

  it("rejects missing calleeOwnerId", () => {
    expect(() =>
      CallAcceptPayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000013",
        calleePeerId: "peer-bob",
        timestamp: new Date().toISOString(),
        sdpAnswer: "v=0\r\n...",
      }),
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// call.reject
// --------------------------------------------------------------------------
describe("CallRejectPayloadSchema", () => {
  it("roundtrips with reason=declined", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000021",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      reason: "declined",
    });
    const parsed = parseCallRejectPayload(payload);
    expect(parsed.reason).toBe("declined");
    expect(parsed.calleeOwnerId).toBe("envoy:owner:bob");
  });

  it("roundtrips with reason=busy", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000022",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      reason: "busy",
    });
    expect(parseCallRejectPayload(payload).reason).toBe("busy");
  });

  it("roundtrips with reason=no_answer", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000023",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      reason: "no_answer",
    });
    expect(parseCallRejectPayload(payload).reason).toBe("no_answer");
  });

  it("roundtrips with reason=offline", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000024",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      reason: "offline",
    });
    expect(parseCallRejectPayload(payload).reason).toBe("offline");
  });

  it("roundtrips with reason=error", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000025",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
      reason: "error",
    });
    expect(parseCallRejectPayload(payload).reason).toBe("error");
  });

  it("defaults reason to declined", () => {
    const payload = createCallRejectPayload({
      callId: "00000000-0000-4000-a000-000000000026",
      calleeOwnerId: "envoy:owner:bob",
      calleePeerId: "peer-bob",
    });
    expect(parseCallRejectPayload(payload).reason).toBe("declined");
  });

  it("rejects invalid reason", () => {
    expect(() =>
      CallRejectPayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000027",
        calleeOwnerId: "envoy:owner:bob",
        calleePeerId: "peer-bob",
        reason: "unknown",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it("rejects missing calleeOwnerId", () => {
    expect(() =>
      CallRejectPayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000028",
        calleePeerId: "peer-bob",
        reason: "declined",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// call.ice-candidate
// --------------------------------------------------------------------------
describe("CallIceCandidatePayloadSchema", () => {
  it("roundtrips a trickle ICE candidate", () => {
    const payload = createCallIceCandidatePayload({
      callId: "00000000-0000-4000-a000-000000000031",
      candidate: {
        candidate: "candidate:1 1 UDP 2130706431 10.0.0.1 54321 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    });
    const parsed = parseCallIceCandidatePayload(payload);
    expect(parsed.candidate.candidate).toContain("typ host");
    expect(parsed.candidate.sdpMid).toBe("0");
  });

  it("handles null sdpMid and sdpMLineIndex", () => {
    const payload = createCallIceCandidatePayload({
      callId: "00000000-0000-4000-a000-000000000032",
      candidate: {
        candidate: "candidate:2 1 UDP 2130706431 10.0.0.2 54322 typ host",
        sdpMid: null,
        sdpMLineIndex: null,
      },
    });
    const parsed = parseCallIceCandidatePayload(payload);
    expect(parsed.candidate.sdpMid).toBeNull();
    expect(parsed.candidate.sdpMLineIndex).toBeNull();
  });

  it("rejects missing candidate", () => {
    expect(() =>
      CallIceCandidatePayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000033",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// call.hangup
// --------------------------------------------------------------------------
describe("CallHangupPayloadSchema", () => {
  it("roundtrips with reason=normal", () => {
    const payload = createCallHangupPayload({
      callId: "00000000-0000-4000-a000-000000000041",
      reason: "normal",
    });
    const parsed = parseCallHangupPayload(payload);
    expect(parsed.reason).toBe("normal");
  });

  it("roundtrips with reason=no_answer", () => {
    const payload = createCallHangupPayload({
      callId: "00000000-0000-4000-a000-000000000042",
      reason: "no_answer",
    });
    expect(parseCallHangupPayload(payload).reason).toBe("no_answer");
  });

  it("roundtrips with reason=error", () => {
    const payload = createCallHangupPayload({
      callId: "00000000-0000-4000-a000-000000000043",
      reason: "error",
    });
    expect(parseCallHangupPayload(payload).reason).toBe("error");
  });

  it("defaults reason to normal", () => {
    const payload = createCallHangupPayload({
      callId: "00000000-0000-4000-a000-000000000044",
    });
    expect(parseCallHangupPayload(payload).reason).toBe("normal");
  });

  it("rejects invalid reason", () => {
    expect(() =>
      CallHangupPayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000045",
        reason: "unknown",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// call.mute
// --------------------------------------------------------------------------
describe("CallMutePayloadSchema", () => {
  it("roundtrips muted=true", () => {
    const payload = createCallMutePayload({
      callId: "00000000-0000-4000-a000-000000000051",
      muted: true,
    });
    const parsed = parseCallMutePayload(payload);
    expect(parsed.muted).toBe(true);
  });

  it("roundtrips muted=false", () => {
    const payload = createCallMutePayload({
      callId: "00000000-0000-4000-a000-000000000052",
      muted: false,
    });
    expect(parseCallMutePayload(payload).muted).toBe(false);
  });

  it("rejects missing muted", () => {
    expect(() =>
      CallMutePayloadSchema.parse({
        callId: "00000000-0000-4000-a000-000000000053",
        timestamp: new Date().toISOString(),
      }),
    ).toThrow();
  });
});

// --------------------------------------------------------------------------
// Role policy
// --------------------------------------------------------------------------
describe("call.* role policy", () => {
  const callIntents = [
    "call.invite",
    "call.accept",
    "call.reject",
    "call.hangup",
    "call.ice-candidate",
    "call.mute",
  ] as const;

  for (const intent of callIntents) {
    it(`${intent} allows human→human`, () => {
      const result = evaluateEnvelopeRolePolicy(intent, "human", "human");
      expect(result.ok).toBe(true);
    });

    it(`${intent} rejects agent→human`, () => {
      const result = evaluateEnvelopeRolePolicy(intent, "agent", "human");
      expect(result.ok).toBe(false);
    });

    it(`${intent} rejects human→agent`, () => {
      const result = evaluateEnvelopeRolePolicy(intent, "human", "agent");
      expect(result.ok).toBe(false);
    });

    it(`${intent} rejects agent→agent`, () => {
      const result = evaluateEnvelopeRolePolicy(intent, "agent", "agent");
      expect(result.ok).toBe(false);
    });

    it(`${intent} rejects system→human`, () => {
      const result = evaluateEnvelopeRolePolicy(intent, "system", "human");
      expect(result.ok).toBe(false);
    });
  }
});

// --------------------------------------------------------------------------
// createUnsignedEnvelope defaults for call.*
// --------------------------------------------------------------------------
describe("createUnsignedEnvelope call.* defaults", () => {
  it("defaults senderRole and recipientRole to human for call.invite", () => {
    const envelope = createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "call.invite",
      payload: createCallInvitePayload({
        callId: "00000000-0000-4000-a000-000000000061",
        callerOwnerId: "envoy:owner:alice",
        callerPeerId: "peer-a",
        sdpOffer: "v=0\r\n...",
      }),
    });
    expect(envelope.senderRole).toBe("human");
    expect(envelope.recipientRole).toBe("human");
  });

  it("still allows explicit role override for call.* intents", () => {
    const envelope = createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      senderRole: "human",
      recipientRole: "human",
      intent: "call.invite",
      payload: createCallInvitePayload({
        callId: "00000000-0000-4000-a000-000000000062",
        callerOwnerId: "envoy:owner:alice",
        callerPeerId: "peer-a",
        sdpOffer: "v=0\r\n...",
      }),
    });
    expect(envelope.senderRole).toBe("human");
    expect(envelope.recipientRole).toBe("human");
  });
});

// --------------------------------------------------------------------------
// Constant
// --------------------------------------------------------------------------
describe("CALL_RING_TIMEOUT_MS", () => {
  it("is 60 seconds", () => {
    expect(CALL_RING_TIMEOUT_MS).toBe(60_000);
  });
});
