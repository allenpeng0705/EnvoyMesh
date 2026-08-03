/**
 * Unit tests for the voice/video calls runtime (Phase 38).
 *
 * The class's `_sendCallResponseEnvelope` is stubbed in the context
 * so we can assert which payload/intent the runtime builds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptCallInviteViaRuntime,
  declineCallInviteViaRuntime,
  effectiveCallIceServersViaRuntime,
  endCallViaRuntime,
  getActiveCallViaRuntime,
  onCallEventViaRuntime,
  sendCallRejectToOwnerViaRuntime,
  sendIceCandidateViaRuntime,
  setCallMutedViaRuntime,
  type CallContext,
} from "../src/node-service-calls.js";
import type { CallManager, CallEvent } from "../src/call-manager.js";
import type { CallSession, NodeProfile } from "@envoymesh/api";

function makeProfile(): NodeProfile {
  return {
    owner: { ownerId: "owner-1" },
    device: {
      deviceId: "device-1",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----",
    },
  } as unknown as NodeProfile;
}

function makeCallManager(): CallManager {
  // The runtime only calls a small set of methods, so we can mock the
  // whole class with vi.fn()s and assert the right calls happen.
  return {
    getActiveCall: vi.fn(),
    onCallEvent: vi.fn(() => () => {}),
    hangupCall: vi.fn(),
    setMute: vi.fn(),
    rejectCall: vi.fn(),
    getSessionStatus: vi.fn(),
    getSessionPeerOwnerId: vi.fn(),
    acceptInboundCall: vi.fn(),
  } as unknown as CallManager;
}

const { CALL_ID } = { CALL_ID: "11111111-1111-4111-8111-111111111111" };

function makeSession(overrides: Partial<CallSession> = {}): CallSession {
  return {
    callId: CALL_ID,
    callerOwnerId: "owner-1",
    calleeOwnerId: "owner-2",
    callType: "audio",
    status: "ringing",
    initiatedAt: "2026-06-30T00:00:00.000Z",
    ...overrides,
  } as unknown as CallSession;
}

let callManager: CallManager;
let sentEnvelopes: Array<{ peerOwnerId: string; intent: string; payload: unknown }>;
let getProfileValue: NodeProfile | undefined;

function makeContext(): CallContext {
  return {
    callManager,
    getProfile: () => getProfileValue,
    sendCallResponseEnvelope: vi.fn(async (peerOwnerId, unsigned, intent) => {
      sentEnvelopes.push({
        peerOwnerId,
        intent,
        payload: unsigned.payload,
      });
      return true;
    }),
    loadConfig: async () => null,
  };
}

beforeEach(() => {
  callManager = makeCallManager();
  sentEnvelopes = [];
  getProfileValue = makeProfile();
});

describe("getActiveCall + onCallEvent passthroughs", () => {
  it("getActiveCall delegates to callManager.getActiveCall", () => {
    const session = makeSession();
    (callManager.getActiveCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(session);
    expect(getActiveCallViaRuntime(makeContext())).toBe(session);
  });

  it("onCallEvent returns the unsubscribe function from the callManager", () => {
    const unsub = () => {};
    (callManager.onCallEvent as ReturnType<typeof vi.fn>).mockReturnValueOnce(unsub);
    const handler: (e: CallEvent) => void = () => {};
    expect(onCallEventViaRuntime(makeContext(), handler)).toBe(unsub);
  });
});

describe("endCallViaRuntime", () => {
  it("returns false when profile is not loaded", async () => {
    getProfileValue = undefined;
    const out = await endCallViaRuntime(makeContext(), CALL_ID);
    expect(out).toBe(false);
  });

  it("returns false when callManager.hangupCall returns false", async () => {
    (callManager.hangupCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const out = await endCallViaRuntime(makeContext(), CALL_ID);
    expect(out).toBe(false);
  });

  it("returns true without sending when the call has no peer (local-only)", async () => {
    (callManager.hangupCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
    const out = await endCallViaRuntime(makeContext(), CALL_ID);
    expect(out).toBe(true);
    expect(sentEnvelopes).toHaveLength(0);
  });

  it("sends call.hangup to the peer when the call had a peer", async () => {
    (callManager.hangupCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    const out = await endCallViaRuntime(makeContext(), CALL_ID);
    expect(out).toBe(true);
    expect(sentEnvelopes).toHaveLength(1);
    expect(sentEnvelopes[0]?.intent).toBe("call.hangup");
    expect((sentEnvelopes[0]?.payload as { callId: string; reason: string }).callId).toBe(CALL_ID);
    expect((sentEnvelopes[0]?.payload as { callId: string; reason: string }).reason).toBe("normal");
  });
});

describe("setCallMutedViaRuntime", () => {
  it("returns false when profile is not loaded", async () => {
    getProfileValue = undefined;
    expect(await setCallMutedViaRuntime(makeContext(), CALL_ID, true)).toBe(false);
  });

  it("sends call.mute when setMute succeeds and peer exists", async () => {
    (callManager.setMute as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    const out = await setCallMutedViaRuntime(makeContext(), CALL_ID, true);
    expect(out).toBe(true);
    expect(sentEnvelopes[0]?.intent).toBe("call.mute");
    expect((sentEnvelopes[0]?.payload as { muted: boolean }).muted).toBe(true);
  });
});

describe("declineCallInviteViaRuntime", () => {
  it("returns false when callManager.rejectCall fails", async () => {
    (callManager.rejectCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    expect(await declineCallInviteViaRuntime(makeContext(), CALL_ID, "declined")).toBe(false);
  });

  it("sends call.reject on success with the right reason", async () => {
    (callManager.rejectCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    const out = await declineCallInviteViaRuntime(makeContext(), CALL_ID, "busy");
    expect(out).toBe(true);
    expect(sentEnvelopes[0]?.intent).toBe("call.reject");
    expect((sentEnvelopes[0]?.payload as { reason: string }).reason).toBe("busy");
  });
});

describe("sendIceCandidateViaRuntime", () => {
  it("returns false when session status is neither ringing nor active", async () => {
    (callManager.getSessionStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce("idle");
    expect(
      await sendIceCandidateViaRuntime(makeContext(), CALL_ID, {
        candidate: "candidate:1 1 udp 1 1.1.1.1 1 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      }),
    ).toBe(false);
  });

  it("sends call.ice-candidate when status is ringing", async () => {
    (callManager.getSessionStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce("ringing");
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    const out = await sendIceCandidateViaRuntime(makeContext(), CALL_ID, {
      candidate: "candidate:1 1 udp 1 1.1.1.1 1 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
    expect(out).toBe(true);
    expect(sentEnvelopes[0]?.intent).toBe("call.ice-candidate");
  });
});

describe("sendCallRejectToOwnerViaRuntime (busy path)", () => {
  it("no-ops when profile is not loaded", async () => {
    getProfileValue = undefined;
    await sendCallRejectToOwnerViaRuntime(makeContext(), CALL_ID, "owner-2", "busy");
    expect(sentEnvelopes).toHaveLength(0);
  });

  it("sends call.reject to the caller with the right reason", async () => {
    await sendCallRejectToOwnerViaRuntime(makeContext(), CALL_ID, "owner-2", "busy");
    expect(sentEnvelopes).toHaveLength(1);
    expect(sentEnvelopes[0]?.peerOwnerId).toBe("owner-2");
    expect(sentEnvelopes[0]?.intent).toBe("call.reject");
    expect((sentEnvelopes[0]?.payload as { reason: string }).reason).toBe("busy");
    expect((sentEnvelopes[0]?.payload as { callId: string }).callId).toBe(CALL_ID);
  });
});

describe("effectiveCallIceServersViaRuntime", () => {
  it("returns the caller-supplied list when provided (even when empty)", async () => {
    const ctx = makeContext();
    const out = await effectiveCallIceServersViaRuntime(ctx, []);
    expect(out).toEqual([]);
  });

  it("returns the config-supplied list when present and non-empty", async () => {
    const ctx = makeContext();
    (ctx as unknown as { loadConfig: () => Promise<unknown> }).loadConfig = async () => ({
      iceServers: [{ urls: "stun:example.com:3478" }],
    });
    const out = await effectiveCallIceServersViaRuntime(ctx);
    expect(out).toEqual([{ urls: "stun:example.com:3478" }]);
  });

  it("falls back to the 3-server STUN default when no config and no caller input", async () => {
    const ctx = makeContext();
    const out = await effectiveCallIceServersViaRuntime(ctx);
    expect(out).toEqual([
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ]);
  });
});

describe("acceptCallInviteViaRuntime", () => {
  it("returns false when profile is not loaded", async () => {
    getProfileValue = undefined;
    expect(await acceptCallInviteViaRuntime(makeContext(), CALL_ID, "v=0\r\n...")).toBe(false);
  });

  it("returns false when the session has no peer", async () => {
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce(undefined);
    expect(await acceptCallInviteViaRuntime(makeContext(), CALL_ID, "sdp")).toBe(false);
  });

  it("returns false when session status is neither ringing nor active", async () => {
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    (callManager.getSessionStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce("idle");
    expect(await acceptCallInviteViaRuntime(makeContext(), CALL_ID, "sdp")).toBe(false);
  });

  it("sends call.accept to the peer on success", async () => {
    (callManager.getSessionPeerOwnerId as ReturnType<typeof vi.fn>).mockReturnValueOnce("owner-2");
    (callManager.getSessionStatus as ReturnType<typeof vi.fn>).mockReturnValueOnce("ringing");
    (callManager.acceptInboundCall as ReturnType<typeof vi.fn>).mockReturnValueOnce(true);
    const out = await acceptCallInviteViaRuntime(
      makeContext(),
      CALL_ID,
      "v=0\r\nsdp-answer\r\n",
    );
    expect(out).toBe(true);
    expect(sentEnvelopes[0]?.intent).toBe("call.accept");
  });
});
describe("buildFullCallContext mesh binding", () => {
  it("uses _externalMesh when _mesh is unset (CLI node:dev / bindExternalMesh)", async () => {
    const { buildFullCallContext } = await import("../src/node-service-calls.js");
    const externalMesh = { peerId: "12D3KooWexternal" };
    const host = {
      callManager: makeCallManager(),
      _profile: makeProfile(),
      _mesh: undefined as unknown,
      _externalMesh: externalMesh,
      _requireMesh: () => host._mesh ?? host._externalMesh,
      _configStore: { load: async () => null },
      _callContext: () => ({}),
      _resolvePeerTransportForOwner: vi.fn(),
      warmContactConnection: vi.fn(),
      _dialHintsForChat: vi.fn(),
      _deliverCallEnvelope: vi.fn(),
      deliverCallEnvelopeToTransportPeer: vi.fn(),
      _trustStore: {},
      _peerDirectoryStore: {},
      _lastLibp2pTransportByOwner: new Map(),
      _taskStore: undefined,
    };
    const ctx = buildFullCallContext(host);
    expect(ctx.getMesh()).toBe(externalMesh);
  });
});
