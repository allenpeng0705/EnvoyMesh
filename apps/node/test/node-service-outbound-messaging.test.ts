/**
 * Unit tests for extracted outbound messaging runtime.
 */
import { generateEd25519KeyPair } from "@envoymesh/identity";
import { describe, expect, it, vi } from "vitest";
import type { OutboundMessagingContext } from "../src/node-service-outbound-messaging.js";
import {
  finalizePeerTransportResolve,
  getPeerConnectionInfoViaRuntime,
  resolvePeerTransportForOwnerViaRuntime,
  sendChatViaRuntime,
  warmContactConnectionTransportViaRuntime,
  warmContactConnectionViaRuntime,
} from "../src/node-service-outbound-messaging.js";

const OWNER_ID = "envoy:owner:remote";
const TRANSPORT_ID = "12D3KooWRemoteTransportUnitTest";

function testProfile() {
  const device = generateEd25519KeyPair();
  const owner = generateEd25519KeyPair();
  return {
    owner: { ownerId: "envoy:owner:self", publicKeyPem: owner.publicKeyPem, privateKeyPem: owner.privateKeyPem },
    device: {
      publicKeyPem: device.publicKeyPem,
      privateKeyPem: device.privateKeyPem,
      deviceCertificate: {},
    },
  };
}

function makeCtx(overrides: Partial<OutboundMessagingContext> = {}): OutboundMessagingContext {
  const transportCache = new Map<string, { peerId: string; listenAddrs?: string[] }>();
  const mesh = {
    peerId: "12D3KooWSelfUnitTest",
    getPeerConnectionInfo: vi.fn(() => ({ connected: true, direct: true })),
    getConnectedPeerIds: vi.fn(() => [TRANSPORT_ID]),
    ensurePeerReachable: vi.fn(async () => ({ connected: true, direct: true })),
    closeConnectionsToPeer: vi.fn(async () => 0),
    probeBondedPeerConnection: vi.fn(async () => ({ connected: true, direct: true })),
    mergePeerStoreDialHints: vi.fn(async () => {}),
    scrubPeerStoreDialHints: vi.fn(async () => []),
    sendChat: vi.fn(async () => {}),
  };

  return {
    loadConfig: async () => ({}) as never,
    getReachableMesh: () => mesh as never,
    requireMesh: () => mesh as never,
    getDiscoverySeedStore: () => undefined,
    getProfileDir: () => "/tmp/test-profile",
    peerDirectoryStore: {
      listPeerRecords: async () => [
        {
          ownerId: OWNER_ID,
          peerId: TRANSPORT_ID,
          listenAddrs: ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
          lastSeenAt: "2026-06-20T12:00:00.000Z",
        },
      ],
      getPeerByOwnerId: async () => ({
        ownerId: OWNER_ID,
        peerId: TRANSPORT_ID,
        listenAddrs: ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
        lastSeenAt: "2026-06-20T12:00:00.000Z",
      }),
    } as never,
    getTransportCache: () => transportCache,
    setTransportCache: (ownerId, entry) => {
      transportCache.set(ownerId, entry);
    },
    deleteTransportCache: (ownerId) => {
      transportCache.delete(ownerId);
    },
    getPendingHelloRequesterPeerIds: () => [],
    learnInboundDialHints: async () => {},
    assertOnline: () => {},
    recordOwnerActivity: () => {},
    requireProfile: () => testProfile() as never,
    loadHumanProfile: async () => ({ displayName: "Self" }),
    getTrustDisplayName: async () => "Remote Contact",
    tagBondedContactReachability: () => {},
    flushPendingRoomSyncs: () => {},
    flushPendingRoomMessages: () => {},
    getBridgeAgentPeerId: () => undefined,
    getSelfOwnerId: () => "envoy:owner:self",
    getBridgeChatHandler: () => undefined,
    persistChatMessage: vi.fn(),
    emitChatMessage: vi.fn(),
    markOutboundChatDelivered: vi.fn(async () => {}),
    learnFromMessage: vi.fn(),
    resolvePeerTransportForOwner: async () => ({
      transportPeerId: TRANSPORT_ID,
      recipientEnvelopePeerId: undefined,
      listenAddrs: ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
    }),
    deliverChatEnvelope: async () => ({
      delivered: true,
      deliveredAt: "2026-06-20T12:00:01.000Z",
    }),
    dialHintsForChat: async () => ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
    ...overrides,
  };
}

describe("finalizePeerTransportResolve", () => {
  it("omits recipientPeerId when device key is unknown", () => {
    const records = [
      {
        ownerId: OWNER_ID,
        peerId: TRANSPORT_ID,
        lastSeenAt: "2026-06-20T12:00:00.000Z",
      },
    ];
    const result = finalizePeerTransportResolve(
      OWNER_ID,
      TRANSPORT_ID,
      records as never,
      ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
      undefined,
    );
    expect(result.recipientEnvelopePeerId).toBeUndefined();
    expect(result.transportPeerId).toBe(TRANSPORT_ID);
  });
});

describe("resolvePeerTransportForOwnerViaRuntime", () => {
  it("prefers a live connected libp2p row from the directory", async () => {
    const device = generateEd25519KeyPair();
    const ctx = makeCtx({
      peerDirectoryStore: {
        listPeerRecords: async () => [
          {
            ownerId: OWNER_ID,
            peerId: TRANSPORT_ID,
            devicePublicKeyPem: device.publicKeyPem,
            listenAddrs: ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
            lastSeenAt: "2026-06-20T12:00:00.000Z",
          },
        ],
        getPeerByOwnerId: async () => ({
          ownerId: OWNER_ID,
          peerId: TRANSPORT_ID,
          listenAddrs: ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
          lastSeenAt: "2026-06-20T12:00:00.000Z",
        }),
      } as never,
    });
    const mesh = ctx.requireMesh();
    vi.mocked(mesh.getConnectedPeerIds).mockReturnValue([TRANSPORT_ID]);
    vi.mocked(mesh.getPeerConnectionInfo).mockReturnValue({ connected: true, direct: true });

    const resolved = await resolvePeerTransportForOwnerViaRuntime(ctx, OWNER_ID);
    expect(resolved.transportPeerId).toBe(TRANSPORT_ID);
    expect(resolved.recipientEnvelopePeerId).toBeTruthy();
  });

  it("throws when owner is not in peer directory", async () => {
    const ctx = makeCtx({
      peerDirectoryStore: {
        listPeerRecords: async () => [],
        getPeerByOwnerId: async () => undefined,
      } as never,
    });
    await expect(resolvePeerTransportForOwnerViaRuntime(ctx, OWNER_ID)).rejects.toThrow(
      /Peer not found/,
    );
  });
});

describe("warmContactConnectionTransportViaRuntime", () => {
  it("returns existing connection without redial when already connected", async () => {
    const ctx = makeCtx();
    const mesh = ctx.requireMesh();
    vi.mocked(mesh.getPeerConnectionInfo).mockReturnValue({ connected: true, direct: true });

    const info = await warmContactConnectionTransportViaRuntime(
      ctx,
      TRANSPORT_ID,
      ["/ip4/10.0.0.2/tcp/4011/p2p/" + TRANSPORT_ID],
    );

    expect(info).toEqual({ connected: true, direct: true });
    expect(mesh.ensurePeerReachable).not.toHaveBeenCalled();
    expect(mesh.closeConnectionsToPeer).not.toHaveBeenCalled();
  });

  it("verifyOnly probes libp2p state without dialing", async () => {
    const ctx = makeCtx();
    const mesh = ctx.requireMesh();
    vi.mocked(mesh.getPeerConnectionInfo).mockReturnValue({ connected: true, direct: false });
    vi.mocked(mesh.probeBondedPeerConnection).mockResolvedValueOnce({ connected: true, direct: false });

    const info = await warmContactConnectionTransportViaRuntime(
      ctx,
      TRANSPORT_ID,
      [],
      { verifyOnly: true },
    );

    expect(mesh.probeBondedPeerConnection).toHaveBeenCalledWith(TRANSPORT_ID);
    expect(info).toEqual({ connected: true, direct: false });
    expect(mesh.ensurePeerReachable).not.toHaveBeenCalled();
  });
});

describe("warmContactConnectionViaRuntime", () => {
  it("returns self shortcut for own owner id", async () => {
    const ctx = makeCtx();
    const info = await warmContactConnectionViaRuntime(ctx, "envoy:owner:self");
    expect(info).toEqual({ connected: true, direct: true, pathVerified: true });
  });

  it("returns disconnected when resolve fails", async () => {
    const ctx = makeCtx({
      resolvePeerTransportForOwner: async () => {
        throw new Error("Peer not found");
      },
    });
    const info = await warmContactConnectionViaRuntime(ctx, OWNER_ID);
    expect(info).toEqual({ connected: false, direct: false });
  });
});

describe("getPeerConnectionInfoViaRuntime", () => {
  it("short-circuits bridge agent as local", async () => {
    const ctx = makeCtx({
      getBridgeAgentPeerId: () => "envoy:agent:bridge",
    });
    const info = await getPeerConnectionInfoViaRuntime(ctx, "envoy:agent:bridge");
    expect(info).toEqual({ connected: true, direct: true });
  });

  it("returns libp2p snapshot without probing (probe runs on send / warm verifyConnection)", async () => {
    const ctx = makeCtx();
    const mesh = ctx.requireMesh() as {
      getPeerConnectionInfo: ReturnType<typeof vi.fn>;
      probeBondedPeerConnection: ReturnType<typeof vi.fn>;
    };
    mesh.getPeerConnectionInfo.mockReturnValue({ connected: true, direct: true, relayPeerId: "12Relay" });

    const info = await getPeerConnectionInfoViaRuntime(ctx, OWNER_ID);

    expect(mesh.probeBondedPeerConnection).not.toHaveBeenCalled();
    expect(info.connected).toBe(true);
    expect(info.direct).toBe(true);
    expect(info.pathVerified).toBe(false);
  });
});

describe("sendChatViaRuntime", () => {
  it("caches transport only after successful delivery", async () => {
    const ctx = makeCtx();
    const cache = ctx.getTransportCache();
    expect(cache.has(OWNER_ID)).toBe(false);

    const result = await sendChatViaRuntime(ctx, OWNER_ID, "hello");

    expect(result.deliveryReceipt).toBe("delivered");
    expect(cache.get(OWNER_ID)?.peerId).toBe(TRANSPORT_ID);
    expect(ctx.persistChatMessage).toHaveBeenCalled();
    expect(ctx.emitChatMessage).toHaveBeenCalled();
  });

  it("does not cache transport when delivery fails", async () => {
    const ctx = makeCtx({
      deliverChatEnvelope: async () => ({ delivered: false }),
    });
    const result = await sendChatViaRuntime(ctx, OWNER_ID, "hello");

    expect(result.deliveryReceipt).toBe("sent");
    expect(ctx.getTransportCache().has(OWNER_ID)).toBe(false);
  });

  it("requires delivery ack on Online-Direct until the path is recently verified", async () => {
    const { resetOutboundPeerFreshnessForTests } = await import(
      "../src/outbound-peer-freshness.js"
    );
    resetOutboundPeerFreshnessForTests();
    const deliverChatEnvelope = vi.fn(async (_peer, _env, _hints, _addrs, options) => {
      expect(options?.expectDeliveryAck).toBeUndefined();
      return { delivered: true, deliveredAt: "2026-06-20T12:00:01.000Z" };
    });
    const ctx = makeCtx({ deliverChatEnvelope });
    await sendChatViaRuntime(ctx, OWNER_ID, "hello");
    expect(deliverChatEnvelope).toHaveBeenCalled();
  });

  it("skips delivery ack on Online-Direct after recent path verify", async () => {
    const { markOutboundPeerVerified, resetOutboundPeerFreshnessForTests } = await import(
      "../src/outbound-peer-freshness.js"
    );
    resetOutboundPeerFreshnessForTests();
    markOutboundPeerVerified(TRANSPORT_ID);
    const deliverChatEnvelope = vi.fn(async (_peer, _env, _hints, _addrs, options) => {
      expect(options).toEqual({ expectDeliveryAck: false });
      return { delivered: false };
    });
    const ctx = makeCtx({ deliverChatEnvelope });
    const result = await sendChatViaRuntime(ctx, OWNER_ID, "hello");
    expect(result.deliveryReceipt).toBe("sent");
  });
});
