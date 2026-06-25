/**
 * Phase 42A — Home `sendCallInvite` rewrite tests.
 *
 * Verifies:
 *  - owner ID is resolved to a device peer ID before sending (not the raw owner ID)
 *  - the SDP offer is embedded into the call.invite payload (no longer empty string)
 *  - the callId is a UUID (z.string().uuid() requires it)
 *  - iceServers fall back to the 3-server default when neither caller nor
 *    node-config provide them
 *  - iceServers pass through when the caller supplies them
 *  - iceServers pass through when node-config provides them
 *  - the envelope is signed and sent via mesh.send
 *  - when peer transport cannot be resolved, the call is rejected and no
 *    envelope is sent
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { parseCallInvitePayload } from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeServiceImpl } from "../src/node-service-impl.js";
import { derivePeerId, generateEd25519KeyPair } from "@envoymesh/identity";
import type { EnvoyEnvelope } from "@envoymesh/protocol";

const FAKE_TRANSPORT_PEER_ID = "12D3KooWFakeTransportPeerIdForCallSendInviteTest";
const FAKE_OWNER_ID = "envoy:owner:bob-target";

interface CapturedSend {
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  options: unknown;
}

function buildSignedHarness(sendsRef: CapturedSend[]) {
  const mockMesh = {
    peerId: "12D3KooWSelfPeerIdForCallSendInviteTest",
    getConnectedPeerIds: vi.fn(() => [FAKE_TRANSPORT_PEER_ID]),
    send: vi.fn(async (transportPeerId: string, envelope: EnvoyEnvelope, options?: unknown) => {
      sendsRef.push({ transportPeerId, envelope, options });
      return { connected: true, direct: true };
    }),
    sendChat: vi.fn(async (transportPeerId: string, envelope: EnvoyEnvelope, options?: unknown) => {
      sendsRef.push({ transportPeerId, envelope, options });
    }),
    sendChatExpectReply: vi.fn(async () => undefined as unknown as EnvoyEnvelope),
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

  // Build a minimal NodeProfile with a real Ed25519 device key so we can sign.
  const device = generateEd25519KeyPair();
  const owner = generateEd25519KeyPair();
  const profile = {
    owner: {
      ownerId: `envoy:owner:${owner.publicKeyPem.slice(-16)}`,
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
    undefined, // mesh — we inject later
    trustStore,
    peerDirectoryStore,
    humanProfileStore,
    profileDir,
    profile,
  );

  return { node, profile, trustStore, peerDirectoryStore };
}

describe("NodeServiceImpl.sendCallInvite (Phase 42A)", () => {
  let profileDir: string;
  let node: NodeServiceImpl;
  let sends: CapturedSend[];

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "call-send-invite-"));
    const harness = await bootstrapNode(profileDir);
    node = harness.node;
    sends = [];
    const { mockMesh } = buildSignedHarness(sends);
    (node as any)._mesh = mockMesh;
    // Stub _resolvePeerTransportForOwner
    (node as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
      if (ownerId !== FAKE_OWNER_ID) {
        throw new Error(`Peer not found for owner: ${ownerId}`);
      }
      return {
        transportPeerId: FAKE_TRANSPORT_PEER_ID,
        recipientEnvelopePeerId: "envoy_recipient_envelope_peer_id",
        listenAddrs: ["/ip4/192.168.1.50/tcp/4001"],
      };
    };
    // Stub _dialHintsForChat
    (node as any)._dialHintsForChat = async () => ["/ip4/192.168.1.50/tcp/4001"];
    (node as any).warmContactConnection = vi.fn(async () => ({ connected: true, direct: true }));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("1. embeds the SDP offer and uses the resolved transport peer ID", async () => {
    const sdpOffer = "v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n...\r\n";
    const callId = await node.sendCallInvite(FAKE_OWNER_ID, sdpOffer);
    expect(callId).not.toBeNull();
    expect(sends).toHaveLength(1);
    const captured = sends[0]!;
    expect(captured.transportPeerId).toBe(FAKE_TRANSPORT_PEER_ID);
    expect(captured.envelope.recipientPeerId).toBe("envoy_recipient_envelope_peer_id");
    // The envelope payload parses cleanly and contains the SDP offer.
    const parsed = parseCallInvitePayload(captured.envelope.payload);
    expect(parsed.sdpOffer).toBe(sdpOffer);
    expect(parsed.callerOwnerId).toBe((node as any)._profile.owner.ownerId);
  });

  it("2. returns a UUID for callId (call.invite schema requires z.string().uuid())", async () => {
    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("3. injects the 3-server STUN default when no iceServers are provided", async () => {
    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).not.toBeNull();
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toBeDefined();
    expect(parsed.iceServers).toHaveLength(3);
    const urls = parsed.iceServers!.map((s) => s.urls);
    expect(urls).toContain("stun:stun.l.google.com:19302");
    expect(urls).toContain("stun:stun.cloudflare.com:3478");
    expect(urls).toContain("stun:global.stun.twilio.com:3478");
  });

  it("4. passes through caller-supplied iceServers (overrides defaults)", async () => {
    const callerIce = [
      { urls: "stun:custom.example.com:3478" },
      { urls: "turn:turn.example.com:3478", username: "u", credential: "c" },
    ];
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...", callerIce);
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toEqual(callerIce);
  });

  it("4b. preserves explicit empty iceServers for Path 1 (no STUN injection)", async () => {
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...", []);
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toEqual([]);
  });

  it("5. uses node-config iceServers when caller does not provide them", async () => {
    const configIce = [{ urls: "stun:from-config.example.com:3478" }];
    // First save a baseline config so load() returns something to mutate.
    await (node as any)._configStore.save({
      version: "0.1",
      profileDir,
      iceServers: configIce,
    });
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toEqual(configIce);
  });

  it("6. caller-supplied iceServers win over node-config", async () => {
    const configIce = [{ urls: "stun:from-config.example.com:3478" }];
    await (node as any)._configStore.save({
      version: "0.1",
      profileDir,
      iceServers: configIce,
    });
    const callerIce = [{ urls: "stun:from-caller.example.com:3478" }];
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...", callerIce);
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toEqual(callerIce);
  });

  // Phase 42H — the structured TURN editor writes a mixed STUN+TURN list
  // into node-config.iceServers. Verify the home ships the full list
  // (preserving credentials for symmetric-NAT relay candidates) rather
  // than collapsing it back to the STUN-only default.
  it("6b. node-config STUN+TURN entries are shipped verbatim (Phase 42H)", async () => {
    const configIce = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "turn:turn.example.com:3478?transport=udp", username: "envoymesh", credential: "secret" },
      { urls: "turns:turn.example.com:5349?transport=tcp", username: "envoymesh", credential: "secret2" },
    ];
    await (node as any)._configStore.save({
      version: "0.1",
      profileDir,
      iceServers: configIce,
    });
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.iceServers).toEqual(configIce);
    // Sanity: the TURN credentials survived the round-trip — callee
    // must be able to authenticate to the relay.
    const turn = parsed.iceServers!.find((s) => s.urls.startsWith("turn:"));
    expect(turn).toBeDefined();
    expect(turn!.username).toBe("envoymesh");
    expect(turn!.credential).toBe("secret");
  });

  it("7. signs the envelope so the callee can verify the caller", async () => {
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    const captured = sends[0]!;
    expect(captured.envelope.signature).toBeTruthy();
    expect(captured.envelope.signature.length).toBeGreaterThan(0);
    expect(captured.envelope.senderPeerId).toBe(
      derivePeerId((node as any)._profile.device.publicKeyPem),
    );
  });

  it("8. returns null and emits no envelope when peer transport cannot be resolved", async () => {
    (node as any)._resolvePeerTransportForOwner = async () => {
      throw new Error("Peer not found for owner: envoy:owner:unknown");
    };
    const callId = await node.sendCallInvite("envoy:owner:unknown", "v=0\r\n...");
    expect(callId).toBeNull();
    expect(sends).toHaveLength(0);
  });

  it("9. returns null when self profile is missing", async () => {
    (node as any)._profile = null;
    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).toBeNull();
    expect(sends).toHaveLength(0);
  });

  it("10. sets recipientRole=human and senderRole=human on the envelope", async () => {
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    const captured = sends[0]!;
    expect(captured.envelope.senderRole).toBe("human");
    expect(captured.envelope.recipientRole).toBe("human");
    expect(captured.envelope.intent).toBe("call.invite");
  });

  it("11. parses the embedded SDP end-to-end via the protocol schema (no schema violations)", async () => {
    const sdpOffer = "v=0\r\no=- 12345 67890 IN IP4 10.0.0.1\r\ns=-\r\nt=0 0\r\n";
    await node.sendCallInvite(FAKE_OWNER_ID, sdpOffer);
    expect(() => parseCallInvitePayload(sends[0]!.envelope.payload)).not.toThrow();
  });

  it("12. propagates the resolved recipientEnvelopePeerId (not the owner ID) to the envelope", async () => {
    // The pre-Phase-42A bug was passing `targetOwnerId` as `recipientPeerId`,
    // which broke libp2p delivery (libp2p expects a peer ID, not an owner ID).
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    const captured = sends[0]!;
    expect(captured.envelope.recipientPeerId).not.toBe(FAKE_OWNER_ID);
    expect(captured.envelope.recipientPeerId).toBe("envoy_recipient_envelope_peer_id");
    // Also confirm we dialed the transport peer ID, not the owner ID.
    expect(captured.transportPeerId).toBe(FAKE_TRANSPORT_PEER_ID);
    expect(captured.transportPeerId).not.toBe(FAKE_OWNER_ID);
  });

  it("13. returns null and emits call:error when delivery fails", async () => {
    const events: import("@envoymesh/api").CallEvent[] = [];
    node.callManager.onCallEvent((e) => events.push(e));
    (node as any)._mesh.getConnectedPeerIds = vi.fn(() => []);
    (node as any)._mesh.getPeerConnectionInfo = vi.fn(() => ({ connected: false, direct: false }));
    (node as any)._deliverCallEnvelope = vi.fn(async () => ({ delivered: false }));

    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).toBeNull();
    expect(events.some((e) => e.type === "call:error")).toBe(true);
    expect(events.some((e) => e.type === "call:ended")).toBe(true);
    expect((node as any)._deliverCallEnvelope).toHaveBeenCalled();
  });

  it("13b. returns null when sendChat fails on an already-connected peer", async () => {
    const events: import("@envoymesh/api").CallEvent[] = [];
    node.callManager.onCallEvent((e) => events.push(e));
    (node as any)._mesh.getPeerConnectionInfo = vi.fn(() => ({ connected: true, direct: true }));
    (node as any)._mesh.getConnectedPeerIds = vi.fn(() => [FAKE_TRANSPORT_PEER_ID]);
    (node as any)._mesh.sendChat = vi.fn(async () => {
      throw new Error("No reachable path");
    });

    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).toBeNull();
    expect(events.some((e) => e.type === "call:error")).toBe(true);
    expect(events.some((e) => e.type === "call:ended")).toBe(true);
    expect((node as any)._mesh.sendChat).toHaveBeenCalled();
  });

  it("14. reuses an open direct libp2p path without redialing stale WAN hints", async () => {
    const ensurePeerReachable = vi.fn(async () => ({ connected: true, direct: true }));
    (node as any)._mesh.ensurePeerReachable = ensurePeerReachable;
    (node as any)._mesh.getPeerConnectionInfo = vi.fn(() => ({ connected: true, direct: true }));
    (node as any)._mesh.getConnectedPeerIds = vi.fn(() => [FAKE_TRANSPORT_PEER_ID]);

    const callId = await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...");
    expect(callId).not.toBeNull();
    expect(sends).toHaveLength(1);
    // Connected peers take the fast sendChat path (not _deliverCallEnvelope / mesh.send).
    expect(sends[0]!.options).toEqual({ dialHints: [] });
    expect((node as any)._mesh.sendChat).toHaveBeenCalledTimes(1);
    expect((node as any)._mesh.send).not.toHaveBeenCalled();
    expect(ensurePeerReachable).not.toHaveBeenCalled();
    expect((node as any).warmContactConnection).not.toHaveBeenCalled();
  });

  it("15. embeds callType video in call.invite payload", async () => {
    await node.sendCallInvite(FAKE_OWNER_ID, "v=0\r\n...", undefined, "video");
    const parsed = parseCallInvitePayload(sends[0]!.envelope.payload);
    expect(parsed.callType).toBe("video");
    expect(node.getActiveCall()?.callType).toBe("video");
  });
});