/**
 * Post-merge regression guards — compare current behavior against the
 * pre-Phase-42-fix working model (61f7513) without restoring old code.
 *
 * These tests lock in:
 *  - warmContactConnection: connected → return early; verifyOnly → probe without redial
 *  - sendChat transport cache: only remember route after delivered ack
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { generateEd25519KeyPair } from "@envoymesh/identity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeServiceImpl } from "../src/node-service-impl.js";
import { resetOwnerWarmCoordinatorForTests } from "../src/bond-warm-coordinator.js";

const PEER_OWNER_ID = "envoy:owner:remote";
const TRANSPORT_PEER_ID = "12D3KooWRemotePeerTransportIdRegression";

async function bootstrapNode(profileDir: string) {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
  const humanProfileStore = createHumanProfileStore(profileDir);

  const device = generateEd25519KeyPair();
  const owner = generateEd25519KeyPair();
  const profile = {
    owner: {
      ownerId: "envoy:owner:self",
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
  return node;
}

describe("post-merge chat regression (pre-61f7513 behavior preserved)", () => {
  let profileDir: string;
  let node: NodeServiceImpl;
  let ensurePeerReachable: ReturnType<typeof vi.fn>;
  let closeConnectionsToPeer: ReturnType<typeof vi.fn>;
  let getPeerConnectionInfo: ReturnType<typeof vi.fn>;
  let probeBondedPeerConnection: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "post-merge-regression-"));
    node = await bootstrapNode(profileDir);
    resetOwnerWarmCoordinatorForTests();

    ensurePeerReachable = vi.fn(async () => ({ connected: true, direct: true }));
    closeConnectionsToPeer = vi.fn(async () => 0);
    getPeerConnectionInfo = vi.fn(() => ({ connected: true, direct: true }));
    probeBondedPeerConnection = vi.fn(async () => ({ connected: true, direct: true }));

    (node as any)._nodeStatus = "running";
    (node as any)._mesh = {
      peerId: "12D3KooWSelfPeerRegression",
      getConnectedPeerIds: vi.fn(() => []),
      ensurePeerReachable,
      closeConnectionsToPeer,
      getPeerConnectionInfo,
      probeBondedPeerConnection,
      mergePeerStoreDialHints: vi.fn(async () => {}),
      scrubPeerStoreDialHints: vi.fn(async () => []),
      send: vi.fn(),
      sendChat: vi.fn(),
      sendChatExpectReply: vi.fn(),
    };
    (node as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
      if (ownerId !== PEER_OWNER_ID) {
        throw new Error(`Peer not found for owner: ${ownerId}`);
      }
      return {
        transportPeerId: TRANSPORT_PEER_ID,
        recipientEnvelopePeerId: undefined,
        listenAddrs: ["/ip4/192.168.1.50/tcp/4011/p2p/" + TRANSPORT_PEER_ID],
      };
    };
    (node as any)._dialHintsForChat = async () => [
      "/ip4/192.168.1.50/tcp/4011/p2p/" + TRANSPORT_PEER_ID,
    ];
    (node as any)._tagBondedContactReachability = vi.fn(async () => {});
    (node as any)._flushPendingRoomSyncs = vi.fn();
    (node as any)._flushPendingRoomMessages = vi.fn();
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  describe("warmContactConnection", () => {
    it("returns existing connection without redialing when already connected (61f7513 model)", async () => {
      const info = await node.warmContactConnection(PEER_OWNER_ID);

      expect(info).toMatchObject({ connected: true, direct: true });
      expect(ensurePeerReachable).not.toHaveBeenCalled();
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
    });

    it("verifyOnly probes libp2p state without tearing down or redial", async () => {
      getPeerConnectionInfo.mockReturnValue({ connected: true, direct: false });
      probeBondedPeerConnection.mockResolvedValueOnce({ connected: true, direct: false });

      const info = await node.warmContactConnection(PEER_OWNER_ID, { verifyOnly: true });

      expect(probeBondedPeerConnection).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(info).toMatchObject({ connected: true, direct: false });
      expect(ensurePeerReachable).not.toHaveBeenCalled();
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
    });

    it("keeps relay connection on background warm (no upgrade unless explicit)", async () => {
      getPeerConnectionInfo.mockReturnValue({ connected: true, direct: false });

      const info = await node.warmContactConnection(PEER_OWNER_ID);

      expect(info).toMatchObject({ connected: true, direct: false });
      expect(ensurePeerReachable).not.toHaveBeenCalled();
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
    });

    it("upgradeRelayToDirect redials for Direct without closing relay first", async () => {
      getPeerConnectionInfo.mockReturnValue({ connected: true, direct: false });

      await node.warmContactConnection(PEER_OWNER_ID, { upgradeRelayToDirect: true });

      // Keep the working relay until ensurePeerReachable succeeds on LAN.
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
      expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
      expect(ensurePeerReachable).toHaveBeenCalledWith(
        TRANSPORT_PEER_ID,
        expect.anything(),
        expect.objectContaining({ upgradeRelayToDirect: true, forceFreshDial: false }),
      );
    });

    it("redial closes and re-dials only when explicitly requested", async () => {
      await node.warmContactConnection(PEER_OWNER_ID, { redial: true });

      expect(closeConnectionsToPeer).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    });

    it("keepAlive probes the open path and reports stale without redialing", async () => {
      probeBondedPeerConnection.mockResolvedValueOnce({ connected: false, direct: false });

      const info = await node.warmContactConnection(PEER_OWNER_ID, { keepAlive: true });

      expect(probeBondedPeerConnection).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
      expect(ensurePeerReachable).not.toHaveBeenCalled();
      expect(info).toMatchObject({ connected: false, direct: false });
    });

    it("verifyConnection probes in place without tearing down when still connected", async () => {
      const info = await node.warmContactConnection(PEER_OWNER_ID, { verifyConnection: true });

      expect(probeBondedPeerConnection).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
      expect(ensurePeerReachable).not.toHaveBeenCalled();
      expect(info).toMatchObject({ connected: true, direct: true });
    });

    it("verifyConnection redials when probe reports stale connection", async () => {
      probeBondedPeerConnection.mockResolvedValueOnce({ connected: false, direct: false });

      await node.warmContactConnection(PEER_OWNER_ID, { verifyConnection: true });

      expect(probeBondedPeerConnection).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(closeConnectionsToPeer).toHaveBeenCalledWith(TRANSPORT_PEER_ID);
      expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    });

    it("merges peer-directory listen addrs before warm dial", async () => {
      getPeerConnectionInfo.mockReturnValue({ connected: false, direct: false });
      const dialHintsForChat = vi.fn(async (_peerId: string, addrs?: string[]) => addrs ?? []);
      (node as any)._dialHintsForChat = dialHintsForChat;
      const peerDirectoryStore = (node as any)._peerDirectoryStore;
      peerDirectoryStore.listPeerRecords = vi.fn(async () => [
        {
          ownerId: PEER_OWNER_ID,
          peerId: TRANSPORT_PEER_ID,
          listenAddrs: ["/ip4/10.0.0.5/tcp/4011/p2p/" + TRANSPORT_PEER_ID],
        },
      ]);

      await node.warmContactConnection(PEER_OWNER_ID);

      expect(dialHintsForChat).toHaveBeenCalledWith(
        TRANSPORT_PEER_ID,
        expect.arrayContaining([
          "/ip4/192.168.1.50/tcp/4011/p2p/" + TRANSPORT_PEER_ID,
          "/ip4/10.0.0.5/tcp/4011/p2p/" + TRANSPORT_PEER_ID,
        ]),
      );
    });

    it("dials when not connected and no redial flag", async () => {
      getPeerConnectionInfo.mockReturnValue({ connected: false, direct: false });

      await node.warmContactConnection(PEER_OWNER_ID);

      expect(closeConnectionsToPeer).not.toHaveBeenCalled();
      expect(ensurePeerReachable).toHaveBeenCalledTimes(1);
    });
  });

  describe("sendChat transport cache", () => {
    it("remembers transport only after a delivered ack, not on send-without-ack", async () => {
      const cache = (node as any)._lastLibp2pTransportByOwner as Map<
        string,
        { peerId: string; listenAddrs: string[] }
      >;

      (node as any)._deliverChatEnvelope = vi.fn(async () => ({
        delivered: false,
      }));
      (node as any)._persistChatMessage = vi.fn();
      (node as any).recordOwnerActivity = vi.fn();
      (node as any).emit = vi.fn();

      await node.sendChat(PEER_OWNER_ID, "hello without ack");
      expect(cache.has(PEER_OWNER_ID)).toBe(false);

      (node as any)._deliverChatEnvelope = vi.fn(async () => ({
        delivered: true,
        deliveredAt: "2026-06-20T12:00:00.000Z",
      }));

      await node.sendChat(PEER_OWNER_ID, "hello with ack");
      expect(cache.get(PEER_OWNER_ID)?.peerId).toBe(TRANSPORT_PEER_ID);
    });

    it("clears cached transport when resolve fails", async () => {
      const cache = (node as any)._lastLibp2pTransportByOwner as Map<
        string,
        { peerId: string; listenAddrs: string[] }
      >;
      cache.set(PEER_OWNER_ID, { peerId: TRANSPORT_PEER_ID, listenAddrs: [] });

      (node as any)._resolvePeerTransportForOwner = async () => {
        throw new Error("Peer not found for owner: test");
      };

      await expect(node.sendChat(PEER_OWNER_ID, "should fail")).rejects.toThrow(/Peer not found/);
      expect(cache.has(PEER_OWNER_ID)).toBe(false);
    });
  });

  describe("bindExternalMesh CLI parity", () => {
    it("starts bond warm and emits node:ready when external mesh is bound", async () => {
      const readyHandler = vi.fn();
      node.on("node:ready", readyHandler);

      const mockMesh = {
        peerId: "12D3KooWSelfBindExternal",
        multiaddrs: ["/ip4/127.0.0.1/tcp/4011/p2p/12D3KooWSelfBindExternal"],
        tagContactForPersistentReachability: vi.fn(async () => {}),
      };
      (node as any).bindExternalMesh(mockMesh);

      expect(readyHandler).toHaveBeenCalled();
      expect((node as any)._nodeStatus).toBe("running");
      expect((node as any)._bondWarmTimer).toBeTruthy();
    });
  });
});
