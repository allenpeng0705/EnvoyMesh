/**
 * Phase 42B — Home response envelopes (accept / reject / hangup / mute) tests.
 *
 * Verifies that the four methods on NodeServiceImpl:
 *   acceptCallInvite(callId, sdpAnswer, iceServers?)
 *   declineCallInvite(callId, reason)
 *   endCall(callId)
 *   setCallMuted(callId, muted)
 *
 * build, sign, and send the right `call.*` response envelope back to the
 * peer with the right payload and recipientPeerId (device peer ID, not
 * owner ID). Verifies CallManager state transitions and idempotency.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  parseCallAcceptPayload,
  parseCallHangupPayload,
  parseCallMutePayload,
  parseCallRejectPayload,
} from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeServiceImpl } from "../src/node-service-impl.js";
import { derivePeerId, generateEd25519KeyPair, verifyEnvelope } from "@envoymesh/identity";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

const CALLEE_OWNER_ID = "envoy:owner:callee-self"; // overwritten per test
const PEER_TARGET_OWNER_ID = "envoy:owner:remote-peer";
const PEER_TRANSPORT_PEER_ID = "12D3KooWRemotePeerTransportIdCallResponse";
const PEER_ENVELOPE_PEER_ID = "envoy_peer_envelope_peer_id";

interface CapturedSend {
  transportPeerId: string;
  envelope: EnvoyEnvelope;
}

function buildHarness(sendsRef: CapturedSend[]) {
  const mockMesh = {
    peerId: "12D3KooWSelfPeerIdForCallResponseTest",
    sendChat: vi.fn(async (transportPeerId: string, envelope: EnvoyEnvelope) => {
      sendsRef.push({ transportPeerId, envelope });
    }),
    sendChatExpectReply: vi.fn(async () => undefined as unknown as EnvoyEnvelope),
    send: vi.fn(async () => ({ connected: true, direct: true })),
    ensurePeerReachable: vi.fn(async () => ({ connected: true, direct: true })),
    getPeerConnectionInfo: vi.fn(() => ({ connected: true, direct: true })),
    closeConnectionsToPeer: vi.fn(async () => 0),
  };
  return { mockMesh };
}

async function bootstrapNode(profileDir: string) {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
  const humanProfileStore = createHumanProfileStore(profileDir);

  const device = generateEd25519KeyPair();
  const owner = generateEd25519KeyPair();
  const profile = {
    owner: {
      ownerId: CALLEE_OWNER_ID,
      publicKeyPem: owner.publicKeyPem,
      privateKeyPem: owner.privateKeyPem,
    },
    device: {
      deviceId: `envoy:device:${device.publicKeyPem.slice(-16)}`,
      publicKeyPem: device.publicKeyPem,
      privateKeyPem: device.privateKeyPem,
    },
  } as any;

  const node = new NodeServiceImpl(
    undefined,
    trustStore,
    peerDirectoryStore,
    humanProfileStore,
    profileDir,
    profile,
  );
  return { node, profile };
}

describe("NodeServiceImpl call response envelopes (Phase 42B)", () => {
  let profileDir: string;
  let node: NodeServiceImpl;
  let sends: CapturedSend[];

  // Helper: stage an inbound call on the local node so the response methods
  // have something to operate on. The remote "caller" is PEER_TARGET_OWNER_ID;
  // the local node is the callee.
  function stageInbound(callId: string) {
    return node.callManager.inboundCallReceived(
      callId,
      PEER_TARGET_OWNER_ID,
      PEER_ENVELOPE_PEER_ID,
      "Remote Peer",
      "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n",
    );
  }

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "call-response-"));
    const h = await bootstrapNode(profileDir);
    node = h.node;
    sends = [];
    const { mockMesh } = buildHarness(sends);
    (node as any)._mesh = mockMesh;
    (node as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
      if (ownerId !== PEER_TARGET_OWNER_ID) {
        throw new Error(`Peer not found for owner: ${ownerId}`);
      }
      return {
        transportPeerId: PEER_TRANSPORT_PEER_ID,
        recipientEnvelopePeerId: PEER_ENVELOPE_PEER_ID,
        listenAddrs: ["/ip4/192.168.1.50/tcp/4001"],
      };
    };
    (node as any)._dialHintsForChat = async () => ["/ip4/192.168.1.50/tcp/4001"];
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------
  // acceptCallInvite
  // ------------------------------------------------------------------

  describe("acceptCallInvite", () => {
    it("1. sends a call.accept envelope with the SDP answer and iceServers", async () => {
      const callId = stageInbound("11111111-1111-4111-8111-111111111111")!;
      const sdpAnswer = "v=0\r\no=- 2 2 IN IP4 0.0.0.0\r\n...";
      const iceServers = [{ urls: "stun:stun.example.com:3478" }];

      const ok = await node.acceptCallInvite(callId, sdpAnswer, iceServers);
      expect(ok).toBe(true);
      expect(sends).toHaveLength(1);

      const captured = sends[0]!;
      expect(captured.transportPeerId).toBe(PEER_TRANSPORT_PEER_ID);
      expect(captured.envelope.intent).toBe("call.accept");

      const payload = parseCallAcceptPayload(captured.envelope.payload);
      expect(payload.callId).toBe(callId);
      expect(payload.calleeOwnerId).toBe(CALLEE_OWNER_ID);
      expect(payload.calleePeerId).toBe(derivePeerId((node as any)._profile.device.publicKeyPem));
      expect(payload.sdpAnswer).toBe(sdpAnswer);
      expect(payload.iceServers).toEqual(iceServers);
    });

    it("2. stamps the device peer ID (not owner ID) on the envelope's recipientPeerId", async () => {
      const callId = stageInbound("22222222-2222-4222-8222-222222222222")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      const captured = sends[0]!;
      expect(captured.envelope.recipientPeerId).toBe(PEER_ENVELOPE_PEER_ID);
      expect(captured.envelope.recipientPeerId).not.toBe(PEER_TARGET_OWNER_ID);
    });

    it("3. transitions CallManager from ringing → active", async () => {
      const callId = stageInbound("33333333-3333-4333-8333-333333333333")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      expect(node.callManager.getActiveCall()).toMatchObject({ callId, status: "active" });
    });

    it("4. signs the envelope with the local device key", async () => {
      const callId = stageInbound("44444444-4444-4444-8444-444444444444")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      const captured = sends[0]!;
      expect(captured.envelope.signature).toBeTruthy();
      expect(captured.envelope.signature.length).toBeGreaterThan(0);
      expect(captured.envelope.senderPublicKey).toBe(
        (node as any)._profile.device.publicKeyPem,
      );
    });

    it("5. returns false (no envelope) when the callId is unknown", async () => {
      const ok = await node.acceptCallInvite(
        "55555555-5555-4555-8555-555555555555",
        "v=0\r\n...",
      );
      expect(ok).toBe(false);
      expect(sends).toHaveLength(0);
    });

    it("6. sends the envelope even when iceServers is omitted (undefined)", async () => {
      const callId = stageInbound("66666666-6666-4666-8666-666666666666")!;
      const ok = await node.acceptCallInvite(callId, "v=0\r\n...");
      expect(ok).toBe(true);
      const payload = parseCallAcceptPayload(sends[0]!.envelope.payload);
      expect(payload.iceServers).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // declineCallInvite
  // ------------------------------------------------------------------

  describe("declineCallInvite", () => {
    it("1. sends a call.reject envelope with the user-supplied reason", async () => {
      const callId = stageInbound("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!;
      const ok = await node.declineCallInvite(callId, "busy");
      expect(ok).toBe(true);
      expect(sends).toHaveLength(1);

      const captured = sends[0]!;
      expect(captured.transportPeerId).toBe(PEER_TRANSPORT_PEER_ID);
      expect(captured.envelope.intent).toBe("call.reject");
      expect(captured.envelope.recipientPeerId).toBe(PEER_ENVELOPE_PEER_ID);

      const payload = parseCallRejectPayload(captured.envelope.payload);
      expect(payload.callId).toBe(callId);
      expect(payload.calleeOwnerId).toBe(CALLEE_OWNER_ID);
      expect(payload.reason).toBe("busy");
    });

    it("2. transitions CallManager to ended and emits call:rejected", async () => {
      const callId = stageInbound("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!;
      const events: any[] = [];
      node.callManager.onCallEvent((e) => events.push(e));
      await node.declineCallInvite(callId, "declined");
      expect(node.callManager.getActiveCall()).toBeNull();
      expect(events).toContainEqual(
        expect.objectContaining({ type: "call:rejected", callId, reason: "declined" }),
      );
    });

    it("3. propagates each reason value through to the payload", async () => {
      const reasons = ["busy", "declined", "offline", "no_answer"] as const;
      // Each call needs a distinct UUID callId. Use a counter suffix in hex.
      let counter = 0;
      for (const reason of reasons) {
        counter += 1;
        const callId = `cccccccc-cccc-4ccc-8ccc-${counter.toString().padStart(12, "0")}`;
        const freshDir = await mkdtemp(join(tmpdir(), "call-reject-"));
        const localSends: CapturedSend[] = [];
        const localH = await bootstrapNode(freshDir);
        const localNode = localH.node;
        (localNode as any)._mesh = buildHarness(localSends).mockMesh;
        (localNode as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
          if (ownerId !== PEER_TARGET_OWNER_ID) throw new Error("not found");
          return {
            transportPeerId: PEER_TRANSPORT_PEER_ID,
            recipientEnvelopePeerId: PEER_ENVELOPE_PEER_ID,
            listenAddrs: undefined,
          };
        };
        (localNode as any)._dialHintsForChat = async () => [];

        localNode.callManager.inboundCallReceived(
          callId,
          PEER_TARGET_OWNER_ID,
          PEER_ENVELOPE_PEER_ID,
          "Remote Peer",
          "v=0\r\n...",
        );
        const ok = await localNode.declineCallInvite(callId, reason);
        expect(ok).toBe(true);
        expect(parseCallRejectPayload(localSends[0]!.envelope.payload).reason).toBe(reason);
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it("4. returns false and sends no envelope for an unknown callId", async () => {
      const ok = await node.declineCallInvite(
        "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        "declined",
      );
      expect(ok).toBe(false);
      expect(sends).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // endCall
  // ------------------------------------------------------------------

  describe("endCall", () => {
    it("1. sends a call.hangup envelope with reason 'normal' for an active call", async () => {
      const callId = stageInbound("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      sends.length = 0; // reset after the accept envelope

      const ok = await node.endCall(callId);
      expect(ok).toBe(true);
      expect(sends).toHaveLength(1);

      const captured = sends[0]!;
      expect(captured.envelope.intent).toBe("call.hangup");
      const payload = parseCallHangupPayload(captured.envelope.payload);
      expect(payload.callId).toBe(callId);
      expect(payload.reason).toBe("normal");
      expect(captured.envelope.recipientPeerId).toBe(PEER_ENVELOPE_PEER_ID);
    });

    it("2. transitions CallManager to ended and emits call:ended", async () => {
      const callId = stageInbound("abababab-abab-4aba-8aba-abababababab")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      sends.length = 0;
      const events: any[] = [];
      node.callManager.onCallEvent((e) => events.push(e));
      await node.endCall(callId);
      expect(events).toContainEqual(
        expect.objectContaining({ type: "call:ended", callId, reason: "normal" }),
      );
      expect(node.callManager.getActiveCall()).toBeNull();
    });

    it("3. no-ops gracefully when the call is already ended", async () => {
      const callId = stageInbound("cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd")!;
      await node.declineCallInvite(callId, "declined");
      sends.length = 0;
      const ok = await node.endCall(callId);
      expect(ok).toBe(false);
      expect(sends).toHaveLength(0);
    });

    it("4. sends no envelope for a non-existent callId (no session, no peer)", async () => {
      const ok = await node.endCall("ffffffff-ffff-4fff-8fff-ffffffffffff");
      expect(ok).toBe(false);
      expect(sends).toHaveLength(0);
    });
  });

  // ------------------------------------------------------------------
  // setCallMuted
  // ------------------------------------------------------------------

  describe("setCallMuted", () => {
    it("1. sends a call.mute envelope with muted=true", async () => {
      const callId = stageInbound("11112222-1111-4222-8111-222211112222")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      sends.length = 0;

      const ok = await node.setCallMuted(callId, true);
      expect(ok).toBe(true);
      expect(sends).toHaveLength(1);

      const captured = sends[0]!;
      expect(captured.envelope.intent).toBe("call.mute");
      const payload = parseCallMutePayload(captured.envelope.payload);
      expect(payload.callId).toBe(callId);
      expect(payload.muted).toBe(true);
    });

    it("2. sends a call.mute envelope with muted=false to unmute", async () => {
      const callId = stageInbound("33334444-3333-4333-8333-444433333444")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      sends.length = 0;
      await node.setCallMuted(callId, false);
      const payload = parseCallMutePayload(sends[0]!.envelope.payload);
      expect(payload.muted).toBe(false);
    });

    it("3. returns false and sends no envelope when the call is not active", async () => {
      const callId = stageInbound("55556666-5555-4555-8555-666655556666")!;
      // Don't accept — call is still ringing, not active.
      const ok = await node.setCallMuted(callId, true);
      expect(ok).toBe(false);
      expect(sends).toHaveLength(0);
    });

    it("4. updates CallManager state.muted so getActiveCall() reflects the change", async () => {
      const callId = stageInbound("77778888-7777-4777-8777-888877778888")!;
      await node.acceptCallInvite(callId, "v=0\r\n...");
      await node.setCallMuted(callId, true);
      expect(node.callManager.getActiveCall()?.muted).toBe(true);
    });
  });

  // ------------------------------------------------------------------
  // cross-cutting: helper handles peer transport resolution failures
  // ------------------------------------------------------------------

  describe("_sendCallResponseEnvelope helper", () => {
    it("silently swallows peer-not-found errors (state has already been updated)", async () => {
      const callId = stageInbound("99990000-9999-4999-8999-000099990000")!;
      (node as any)._resolvePeerTransportForOwner = async () => {
        throw new Error("Peer not found for owner: envoy:owner:gone");
      };
      // acceptCallInvite should still return true (CallManager state changed)
      const ok = await node.acceptCallInvite(callId, "v=0\r\n...");
      expect(ok).toBe(true);
      expect(sends).toHaveLength(0);
    });

    // Regression guard: recipientPeerId must be stamped BEFORE signing so the
    // signature covers the same canonical JSON the verifier recomputes.
    // A previous version stamped it after signing → every response envelope was
    // signature-invalid and silently dropped by the peer's InboundMessageGuard.
    it("produces a verifiable signature on every response intent (accept/reject/hangup/mute)", async () => {
      // Each intent needs its own node — CallManager is one-call-per-node, so a
      // second staged inbound auto-rejects the first as "busy".
      async function freshNode(sendsRef: CapturedSend[]) {
        const dir = await mkdtemp(join(tmpdir(), "call-resp-sig-"));
        const n = (await bootstrapNode(dir)).node;
        (n as any)._mesh = buildHarness(sendsRef).mockMesh;
        (n as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
          if (ownerId !== PEER_TARGET_OWNER_ID) throw new Error("not found");
          return {
            transportPeerId: PEER_TRANSPORT_PEER_ID,
            recipientEnvelopePeerId: PEER_ENVELOPE_PEER_ID,
            listenAddrs: ["/ip4/192.168.1.50/tcp/4001"],
          };
        };
        (n as any)._dialHintsForChat = async () => [];
        return { n, dir };
      }

      // accept
      {
        const s: CapturedSend[] = [];
        const { n, dir } = await freshNode(s);
        const id = n.callManager.inboundCallReceived(
          "a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1",
          PEER_TARGET_OWNER_ID,
          PEER_ENVELOPE_PEER_ID,
          "Remote",
          "v=0\r\n...",
        )!;
        await n.acceptCallInvite(id, "v=0\r\n...");
        expect(s[0]!.envelope.intent).toBe("call.accept");
        expect(s[0]!.envelope.recipientPeerId).toBe(PEER_ENVELOPE_PEER_ID);
        expect(verifyEnvelope(s[0]!.envelope)).toBe(true);
        await rm(dir, { recursive: true, force: true });
      }
      // reject
      {
        const s: CapturedSend[] = [];
        const { n, dir } = await freshNode(s);
        const id = n.callManager.inboundCallReceived(
          "b2b2b2b2-2222-4222-8222-b2b2b2b2b2b2",
          PEER_TARGET_OWNER_ID,
          PEER_ENVELOPE_PEER_ID,
          "Remote",
          "v=0\r\n...",
        )!;
        await n.declineCallInvite(id, "busy");
        expect(s[0]!.envelope.intent).toBe("call.reject");
        expect(verifyEnvelope(s[0]!.envelope)).toBe(true);
        await rm(dir, { recursive: true, force: true });
      }
      // hangup
      {
        const s: CapturedSend[] = [];
        const { n, dir } = await freshNode(s);
        const id = n.callManager.inboundCallReceived(
          "c3c3c3c3-3333-4333-8333-c3c3c3c3c3c3",
          PEER_TARGET_OWNER_ID,
          PEER_ENVELOPE_PEER_ID,
          "Remote",
          "v=0\r\n...",
        )!;
        await n.acceptCallInvite(id, "v=0\r\n...");
        await n.endCall(id);
        const hangupEnv = s.find((x) => x.envelope.intent === "call.hangup")!;
        expect(hangupEnv).toBeTruthy();
        expect(verifyEnvelope(hangupEnv.envelope)).toBe(true);
        await rm(dir, { recursive: true, force: true });
      }
      // mute
      {
        const s: CapturedSend[] = [];
        const { n, dir } = await freshNode(s);
        const id = n.callManager.inboundCallReceived(
          "d4d4d4d4-4444-4444-8444-d4d4d4d4d4d4",
          PEER_TARGET_OWNER_ID,
          PEER_ENVELOPE_PEER_ID,
          "Remote",
          "v=0\r\n...",
        )!;
        await n.acceptCallInvite(id, "v=0\r\n...");
        await n.setCallMuted(id, true);
        const muteEnv = s.find((x) => x.envelope.intent === "call.mute")!;
        expect(muteEnv).toBeTruthy();
        expect(verifyEnvelope(muteEnv.envelope)).toBe(true);
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});