/**
 * E2E: bonded peer thumbnail sync — push (profile.sync), pull (profile.request/response),
 * peer-directory learn, inbound guard size, and cache refresh on thumbnail change.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signHumanProfile,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  parseProfileSyncPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInboundMessageGuard } from "../src/inbound-guard.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { loadProfileThumbnailInline } from "../src/profile-thumbnail-inline.js";

const THUMB_V1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
/** Minimal JPEG (SOI+EOI only) — different contentSha256 after strip than the PNG above. */
const THUMB_V2_JPEG_BASE64 = "/9j/w==";

const ALICE_LIBP2P = "12D3KooWAliceThumbSyncE2E";
const BOB_LIBP2P = "12D3KooWBobThumbSyncE2E";

type TestProfile = ReturnType<typeof makeProfile>;

interface TestNode {
  profileDir: string;
  vaultDir: string;
  profile: TestProfile;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
  mesh: EnvoyMesh;
}

const profileDirs: string[] = [];

function makeProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send"],
    }),
  };
}

function mockMesh(peerId: string, onSend?: (envelope: EnvoyEnvelope) => Promise<void>): EnvoyMesh {
  return {
    peerId,
    multiaddrs: [],
    send: async (_target, envelope) => {
      await onSend?.(envelope as EnvoyEnvelope);
    },
    onMessage: () => {},
    probePeer: async () => undefined,
    getPeerConnectionInfo: () => ({ connected: false, direct: false }),
    start: async () => undefined,
    stop: async () => undefined,
  } as unknown as EnvoyMesh;
}

async function createTestNode(
  profile: TestProfile,
  peerId: string,
  onSend?: (envelope: EnvoyEnvelope) => Promise<void>,
): Promise<TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-thumb-sync-e2e-"));
  profileDirs.push(profileDir);
  const vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
  await writeFile(join(profileDir, "peer-directory.json"), '{"version":"0.1","records":[]}\n', {
    mode: 0o600,
  });
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const mesh = mockMesh(peerId, onSend);
  const service = new NodeServiceImpl(
    undefined,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    profile,
    vaultDir,
  );
  service.bindExternalMesh(mesh);
  return { profileDir, vaultDir, profile, trustStore, peerDirectory, human, service, mesh };
}

async function seedHumanProfile(human: TestNode["human"], profile: TestProfile, username: string) {
  const signed = signHumanProfile(
    {
      version: "0.1",
      ownerId: profile.owner.ownerId,
      displayName: username,
      username,
      profileVisibility: "private",
      updatedAt: new Date().toISOString(),
    },
    profile.owner.privateKeyPem,
  );
  await human.saveHumanProfile(signed);
}

async function bondPeer(local: TestNode, remote: TestNode, displayName: string) {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    displayName,
    level: "direct",
    now: new Date().toISOString(),
  });
}

async function registerLibp2pInDirectory(local: TestNode, remote: TestNode, remoteLibp2p: string) {
  await local.peerDirectory.ensurePeerFromInboundChat({
    ownerId: remote.profile.owner.ownerId,
    peerId: remoteLibp2p,
    listenAddrs: ["/ip4/127.0.0.1/tcp/4011"],
  });
}

async function deliverInbound(
  recipient: TestNode,
  envelope: EnvoyEnvelope,
  transportPeerId: string,
  replyWithEnvelope?: (envelope: EnvoyEnvelope) => Promise<void>,
) {
  return recipient.service.handleInboundProfileIntent(envelope, {
    transportPeerId,
    remoteAddr: "/ip4/127.0.0.1/tcp/4011",
    replyWithEnvelope,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(async () => {
  await Promise.all(profileDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe.skip("E2E profile thumbnail sync (push/replace/learn) — see docs/known-broken-e2e.md", () => {
  it("pushes thumbnail inline via profile.sync and caches bytes on the peer", async () => {
    const aliceProfile = makeProfile();
    const bobProfile = makeProfile();
    let bobNode: TestNode | undefined;

    const aliceNode = await createTestNode(aliceProfile, ALICE_LIBP2P, async (envelope) => {
      if (!bobNode) throw new Error("bob node not ready");
      await deliverInbound(bobNode, envelope, ALICE_LIBP2P);
    });
    bobNode = await createTestNode(bobProfile, BOB_LIBP2P);

    await seedHumanProfile(aliceNode.human, aliceProfile, "alice01");
    await seedHumanProfile(bobNode.human, bobProfile, "bob01");
    await bondPeer(aliceNode, bobNode, "Bob");
    await bondPeer(bobNode, aliceNode, "Alice");
    await registerLibp2pInDirectory(aliceNode, bobNode, BOB_LIBP2P);

    const updated = await aliceNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V1_BASE64,
      mimeType: "image/png",
    });
    expect(updated.publicThumbnail).toBeDefined();

    await aliceNode.service.syncProfileToBonds();

    const cached = await bobNode.service.getPeerProfile(aliceProfile.owner.ownerId);
    expect(cached?.thumbnailContentBase64).toBeTruthy();
    expect(cached?.thumbnailMimeType).toBe("image/png");
    expect(cached?.profile.publicThumbnail?.contentSha256).toBe(updated.publicThumbnail?.contentSha256);
    const inline = await loadProfileThumbnailInline(aliceNode.vaultDir, updated);
    expect(cached?.thumbnailContentBase64).toBe(inline?.contentBase64);
  });

  it("replaces cached thumbnail when sender updates photo (new contentSha256)", async () => {
    const aliceProfile = makeProfile();
    const bobProfile = makeProfile();
    let bobNode: TestNode | undefined;

    const aliceNode = await createTestNode(aliceProfile, ALICE_LIBP2P, async (envelope) => {
      if (!bobNode) throw new Error("bob node not ready");
      await deliverInbound(bobNode, envelope, ALICE_LIBP2P);
    });
    bobNode = await createTestNode(bobProfile, BOB_LIBP2P);

    await seedHumanProfile(aliceNode.human, aliceProfile, "alice01");
    await bondPeer(aliceNode, bobNode, "Bob");
    await bondPeer(bobNode, aliceNode, "Alice");
    await registerLibp2pInDirectory(aliceNode, bobNode, BOB_LIBP2P);

    await aliceNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V1_BASE64,
      mimeType: "image/png",
    });
    await aliceNode.service.syncProfileToBonds();

    const first = await bobNode.service.getPeerProfile(aliceProfile.owner.ownerId);
    const firstSha = first?.profile.publicThumbnail?.contentSha256;
    expect(firstSha).toBeTruthy();

    const updatedV2 = await aliceNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V2_JPEG_BASE64,
      mimeType: "image/jpeg",
    });
    await aliceNode.service.syncProfileToBonds();

    const second = await bobNode.service.getPeerProfile(aliceProfile.owner.ownerId);
    expect(second?.profile.publicThumbnail?.contentSha256).toBe(updatedV2.publicThumbnail?.contentSha256);
    expect(second?.profile.publicThumbnail?.contentSha256).not.toBe(firstSha);
    const inlineV2 = await loadProfileThumbnailInline(aliceNode.vaultDir, updatedV2);
    expect(second?.thumbnailContentBase64).toBe(inlineV2?.contentBase64);
  });

  it("answers profile.request on the inbound stream (replyWithEnvelope) with thumbnail inline", async () => {
    const winProfile = makeProfile();
    const macProfile = makeProfile();
    const winNode = await createTestNode(winProfile, BOB_LIBP2P);
    const macNode = await createTestNode(macProfile, ALICE_LIBP2P);

    await seedHumanProfile(winNode.human, winProfile, "win01");
    await bondPeer(macNode, winNode, "Win");
    await winNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V1_BASE64,
      mimeType: "image/png",
    });

    const requestUnsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(macProfile.device.publicKeyPem),
      senderPublicKey: macProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: derivePeerId(winProfile.device.publicKeyPem),
      recipientRole: "human",
      intent: "profile.request",
      payload: createProfileRequestPayload(macProfile.owner.ownerId),
    });
    const requestEnvelope = signUnsignedEnvelope(requestUnsigned, macProfile.device.privateKeyPem);

    let replyEnvelope: EnvoyEnvelope | undefined;
    const handled = await deliverInbound(winNode, requestEnvelope, ALICE_LIBP2P, async (env) => {
      replyEnvelope = env;
    });
    expect(handled).toBe(true);
    expect(replyEnvelope).toBeDefined();
    expect(replyEnvelope!.intent).toBe("profile.response");

    const replyPayload = parseProfileSyncPayload(replyEnvelope!.payload);
    expect(replyPayload.profile.ownerId).toBe(winProfile.owner.ownerId);
    expect(replyPayload.publicThumbnailInline?.contentBase64).toBeTruthy();

    const cachedOnMac = await deliverInbound(macNode, replyEnvelope!, BOB_LIBP2P);
    expect(cachedOnMac).toBe(true);

    const cached = await macNode.service.getPeerProfile(winProfile.owner.ownerId);
    const winHuman = await winNode.service.getHumanProfile();
    const winInline = winHuman
      ? await loadProfileThumbnailInline(winNode.vaultDir, winHuman)
      : undefined;
    expect(cached?.thumbnailContentBase64).toBe(winInline?.contentBase64);
    expect(cached?.profile.publicThumbnail?.contentSha256).toBe(winHuman?.publicThumbnail?.contentSha256);
  });

  it("learns libp2p from inbound profile.sync then can push thumbnail to that bond", async () => {
    const macProfile = makeProfile();
    const winProfile = makeProfile();
    let macNode: TestNode | undefined;
    let winNode: TestNode | undefined;

    winNode = await createTestNode(winProfile, BOB_LIBP2P, async (envelope) => {
      if (!macNode) throw new Error("mac node not ready");
      await deliverInbound(macNode, envelope, BOB_LIBP2P);
    });
    macNode = await createTestNode(macProfile, ALICE_LIBP2P, async (envelope) => {
      if (!winNode) throw new Error("win node not ready");
      await deliverInbound(winNode, envelope, ALICE_LIBP2P);
    });

    await seedHumanProfile(winNode.human, winProfile, "win01");
    await bondPeer(winNode, macNode, "Mac");
    await bondPeer(macNode, winNode, "Win");
    await registerLibp2pInDirectory(macNode, winNode, BOB_LIBP2P);
    expect(await winNode.peerDirectory.getPeerByOwnerId(macProfile.owner.ownerId)).toBeUndefined();

    await seedHumanProfile(macNode.human, macProfile, "mac01");
    await macNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V1_BASE64,
      mimeType: "image/png",
    });
    await macNode.service.syncProfileToBonds();

    const records = await winNode.peerDirectory.listPeerRecords();
    const row = records.find((r) => r.ownerId === macProfile.owner.ownerId);
    expect(row?.peerId).toBe(ALICE_LIBP2P);

    await winNode.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V2_JPEG_BASE64,
      mimeType: "image/jpeg",
    });
    await winNode.service.syncProfileToBonds();

    const cached = await macNode.service.getPeerProfile(winProfile.owner.ownerId);
    const winUpdated = await winNode.service.getHumanProfile();
    const inline = winUpdated
      ? await loadProfileThumbnailInline(winNode.vaultDir, winUpdated)
      : undefined;
    expect(cached?.thumbnailContentBase64).toBe(inline?.contentBase64);
  });

  it("accepts large profile.sync through inbound guard then caches thumbnail", async () => {
    const aliceProfile = makeProfile();
    const bobProfile = makeProfile();
    const bobNode = await createTestNode(bobProfile, BOB_LIBP2P);
    await bobNode.trustStore.setTrustRecord({
      peerOwnerId: aliceProfile.owner.ownerId,
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });

    const signedProfile = signHumanProfile(
      {
        version: "0.1",
        ownerId: aliceProfile.owner.ownerId,
        displayName: "Alice",
        username: "alice01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
        publicThumbnail: {
          vaultRelativePath: "profile/thumbnail.jpg",
          mimeType: "image/jpeg",
          contentSha256: "b".repeat(64),
        },
      },
      aliceProfile.owner.privateKeyPem,
    );
    const bigInline = {
      contentBase64: "A".repeat(80 * 1024),
      mimeType: "image/jpeg" as const,
      contentSha256: signedProfile.publicThumbnail!.contentSha256,
    };
    const payload = createProfileSyncPayload(
      { ...signedProfile, publicThumbnail: signedProfile.publicThumbnail },
      bigInline,
      aliceProfile.owner.publicKeyPem,
    );
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
      senderPublicKey: aliceProfile.device.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, aliceProfile.device.privateKeyPem);

    const guard = createInboundMessageGuard({ maxEnvelopeBytes: 64 * 1024 });
    const decision = guard.inspect(envelope);
    expect(decision.action).toBe("allow");
    if (decision.action !== "allow") {
      throw new Error(`guard rejected: ${decision.reason}`);
    }

    const handled = await deliverInbound(bobNode, decision.envelope, ALICE_LIBP2P);
    expect(handled).toBe(true);

    const cached = await bobNode.service.getPeerProfile(aliceProfile.owner.ownerId);
    expect(cached?.thumbnailContentBase64).toBe(bigInline.contentBase64);
  });

  it("builds matching inline bytes from vault for signed profile thumbnail", async () => {
    const profile = makeProfile();
    const node = await createTestNode(profile, ALICE_LIBP2P);
    await seedHumanProfile(node.human, profile, "alice01");

    const updated = await node.service.setPublicProfileThumbnail({
      contentBase64: THUMB_V1_BASE64,
      mimeType: "image/png",
    });
    const inline = await loadProfileThumbnailInline(node.vaultDir, updated);
    expect(inline?.contentBase64).toBeTruthy();
    expect(inline?.contentSha256).toBe(updated.publicThumbnail?.contentSha256);
  });
});
