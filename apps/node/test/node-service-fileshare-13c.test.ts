/**
 * Step 13c tests — network-driven file-sharing runtime.
 *
 * Verifies the runtime surface (context plumbing + delegation shape)
 * for discoverPublishedLibrary / shareFile / requestShareFromLibrary.
 * The mesh send/recv side is exercised by the existing integration
 * tests — these tests focus on context wiring and per-peer error
 * reporting.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertOnline: vi.fn(() => {}),
  mesh: {
    getPeerConnectionInfo: (_id: string) => ({ connected: false, direct: false }),
    getConnectedPeerIds: () => [] as string[],
  },
  profile: {
    owner: { ownerId: "owner-1" },
    device: {
      publicKeyPem: "PUB",
      privateKeyPem: "PRIV",
    },
  },
  bonds: [] as Array<{
    peerOwnerId: string;
    displayName?: string;
    level: string;
    libp2pPeerId?: string;
  }>,
  pendingPush: new Map<string, unknown>(),
  pendingPull: new Map<string, unknown>(),
  correlation: new Map<string, string>(),
  transferStatus: [] as Array<Record<string, unknown>>,
  delivered: [] as Array<{ peer: string; envelope: unknown }>,
}));

vi.mock("@envoymesh/vault", () => ({
  buildVaultIndex: async () => ({ documents: [] }),
  assertPathInsideVault: (_r: string, c: string) => c,
  isSafeVaultPath: (_r: string, _p: string) => true,
}));

vi.mock("@envoymesh/identity", () => ({
  derivePeerId: (_pk: string) => "peer-from-pub",
  signUnsignedEnvelope: (unsigned: unknown) => ({ ...(unsigned as object), signature: "sig" }),
}));

vi.mock("@envoymesh/protocol", () => ({
  createDiscoveryRequestPayload: (p: unknown) => p,
  createShareRequestPayload: (p: unknown) => p,
  createUnsignedEnvelope: (p: unknown) => ({
    ...(p as Record<string, unknown>),
    messageId: "msg-test",
  }),
  parseDiscoveryResponsePayload: (p: unknown) => ({ matches: [] }),
  bondTrustRank: (level: string) => (level === "blocked" ? 99 : level === "direct" ? 1 : 5),
  PUBLISHED_LIB_CAPABILITY: "published_library",
}));

vi.mock("../src/chat-outbound-deliver.js", () => ({
  sendExpectReplyWithRetry: async () => ({ intent: "discovery.response", payload: { matches: [] } }),
}));

vi.mock("../src/discovery-inbound.js", () => ({
  PUBLISHED_LIB_CAPABILITY: "published_library",
}));

import {
  discoverPublishedLibraryViaRuntime,
  shareFileViaRuntime,
  requestShareFromLibraryViaRuntime,
  type FileShareNetworkContext,
} from "../src/node-service-fileshare.js";

function makeContext(): FileShareNetworkContext {
  return {
    getVaultDir: () => "/vault",
    getProfileDir: () => "/profile",
    getNodeConfig: async () => ({}),
    getTaskStore: () => ({}),
    getRagService: async () => null,
    recordOwnerActivity: () => {},
    appendAuditEvent: async () => {},
    emit: () => {},
    assertOnline: mocks.assertOnline,
    requireMesh: () => mocks.mesh as never,
    requireProfile: () => mocks.profile as never,
    resolvePeerTransportForOwner: async (ownerId: string) => ({
      transportPeerId: `transport-${ownerId}`,
      recipientEnvelopePeerId: `recipient-${ownerId}`,
      listenAddrs: [],
    }),
    dialHintsForChat: async () => [],
    getBonds: async () => mocks.bonds,
    deliverCallEnvelope: async (peerId, envelope) => {
      mocks.delivered.push({ peer: peerId, envelope });
    },
    setPendingPushShare: (messageId, info) => {
      mocks.pendingPush.set(messageId, info);
    },
    setPendingPullShare: (messageId, info) => {
      mocks.pendingPull.set(messageId, info);
    },
    setCorrelationByRequestMsgId: (messageId, correlationId) => {
      mocks.correlation.set(messageId, correlationId);
    },
    upsertTransferStatus: (status) => {
      mocks.transferStatus.push(status);
    },
    isVaultPathSafe: () => true,
    assertVaultFileExists: async () => {},
  };
}

beforeEach(() => {
  mocks.assertOnline.mockClear();
  mocks.bonds.length = 0;
  mocks.pendingPush.clear();
  mocks.pendingPull.clear();
  mocks.correlation.clear();
  mocks.transferStatus.length = 0;
  mocks.delivered.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("discoverPublishedLibraryViaRuntime", () => {
  it("returns [] when there are no bonds", async () => {
    const results = await discoverPublishedLibraryViaRuntime(makeContext());
    expect(results).toEqual([]);
    expect(mocks.assertOnline).toHaveBeenCalled();
  });

  it("skips blocked bonds and reports per-bond results", async () => {
    mocks.bonds.push(
      { peerOwnerId: "blocked-peer", level: "blocked" },
      { peerOwnerId: "good-peer", level: "direct" },
    );
    const results = await discoverPublishedLibraryViaRuntime(makeContext());
    expect(results).toHaveLength(1);
    expect(results[0]?.peerOwnerId).toBe("good-peer");
  });
});

describe("shareFileViaRuntime", () => {
  it("validates the vault path before sending", async () => {
    const ctx = makeContext();
    ctx.isVaultPathSafe = () => false;
    await expect(
      shareFileViaRuntime(ctx, "peer-1", {
        path: "../../etc/passwd",
        sensitivity: "public",
      }),
    ).rejects.toThrow(/Invalid vault path/);
    expect(mocks.delivered).toHaveLength(0);
  });

  it("sends a share.request envelope and records pending-share + transfer-status", async () => {
    const out = await shareFileViaRuntime(makeContext(), "peer-1", {
      path: "docs/x.md",
      sensitivity: "private",
      deliveryChannel: "inbox",
    });
    expect(out.shareRequestMessageId).toBeDefined();
    expect(mocks.delivered).toHaveLength(1);
    const delivered = mocks.delivered[0]!;
    expect(delivered.peer).toBe("transport-peer-1");
    expect(mocks.pendingPush.size).toBe(1);
    expect(mocks.transferStatus).toHaveLength(1);
    expect(mocks.transferStatus[0]).toMatchObject({
      remotePeerOwnerId: "peer-1",
      vaultRelativePath: "docs/x.md",
      phase: "negotiating",
    });
  });
});

describe("requestShareFromLibraryViaRuntime", () => {
  it("sends a pull share.request and records pending-pull entry", async () => {
    const out = await requestShareFromLibraryViaRuntime(makeContext(), "peer-1", {
      relativePath: "docs/y.md",
      sensitivity: "friends",
      correlationId: "corr-1",
    });
    expect(out.shareRequestMessageId).toBeDefined();
    expect(mocks.delivered).toHaveLength(1);
    expect(mocks.pendingPull.size).toBe(1);
    expect(mocks.correlation.get(out.shareRequestMessageId)).toBe("corr-1");
    expect(mocks.transferStatus).toHaveLength(1);
  });
});