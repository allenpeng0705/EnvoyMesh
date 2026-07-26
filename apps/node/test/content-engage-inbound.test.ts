import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createFeedEngagePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundFeedEngage } from "../src/content-engage-inbound.js";
import {
  addContentCommentInStore,
  loadContentEngagement,
  toggleContentStarInStore,
} from "../src/content-engagement-store.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let peerDirectoryStore: ReturnType<typeof createLocalPeerDirectoryStore>;
let authorProfile: NodeProfile;
let viewerDevice: ReturnType<typeof generateDeviceIdentity>;
let viewerOwnerId: string;
let viewerPeerId: string;

const REMOTE_PEER = "12D3KooWviewerpeer";

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "content-engage-inbound-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  authorProfile = {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
    }),
  };

  viewerDevice = generateDeviceIdentity();
  viewerOwnerId = "envoy:owner:viewerengage01";
  viewerPeerId = derivePeerId(viewerDevice.publicKeyPem);

  await peerDirectoryStore.ensurePeerFromInboundChat({
    ownerId: viewerOwnerId,
    peerId: REMOTE_PEER,
    listenAddrs: [],
  });
  await peerDirectoryStore.mergeInboundDeviceBinding({
    peerId: REMOTE_PEER,
    devicePublicKeyPem: viewerDevice.publicKeyPem,
    ownerId: viewerOwnerId,
  });
  await trustStore.setTrustRecord({
    peerOwnerId: viewerOwnerId,
    level: "direct",
    displayName: "Viewer",
  });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function authorUrl(path = "feeds/hello.md"): string {
  return `envoy://${authorProfile.owner.ownerId}/${path}`;
}

function makeEngageEnvelope(payload: ReturnType<typeof createFeedEngagePayload>) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: viewerPeerId,
      senderPublicKey: viewerDevice.publicKeyPem,
      senderRole: "human",
      recipientRole: "human",
      intent: "feed.engage",
      payload,
    }),
    signature: "test-signature",
  };
}

describe("handleInboundFeedEngage", () => {
  it("rejects snapshot when sender is not the content author", async () => {
    const url = authorUrl();
    await toggleContentStarInStore(profileDir, url, authorProfile.owner.ownerId);

    const result = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "snapshot",
          starOwnerIds: [viewerOwnerId],
          comments: [],
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/not content author/i);

    const rec = await loadContentEngagement(profileDir, url);
    expect(rec.stars).toEqual([authorProfile.owner.ownerId]);
  });

  it("applies snapshot when sender owns the URL", async () => {
    const authorLibp2p = "12D3KooWauthorpeer";
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: authorProfile.owner.ownerId,
      peerId: authorLibp2p,
      listenAddrs: [],
    });
    await peerDirectoryStore.mergeInboundDeviceBinding({
      peerId: authorLibp2p,
      devicePublicKeyPem: authorProfile.device.publicKeyPem,
      ownerId: authorProfile.owner.ownerId,
    });
    await trustStore.setTrustRecord({
      peerOwnerId: authorProfile.owner.ownerId,
      level: "direct",
      displayName: "Author",
    });

    // Local node is the viewer; URL belongs to author.
    const viewerOwner = generateOwnerIdentity();
    const viewerLocalDevice = generateDeviceIdentity();
    const viewerLocalProfile: NodeProfile = {
      owner: viewerOwner,
      device: viewerLocalDevice,
      deviceCertificate: createDeviceCertificate({
        owner: viewerOwner,
        device: viewerLocalDevice,
        deviceProfile: "primary",
        capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
      }),
    };

    const url = `envoy://${authorProfile.owner.ownerId}/feeds/hello.md`;
    const envelope = {
      ...createUnsignedEnvelope({
        senderPeerId: derivePeerId(authorProfile.device.publicKeyPem),
        senderPublicKey: authorProfile.device.publicKeyPem,
        senderRole: "human",
        recipientRole: "human",
        intent: "feed.engage",
        payload: createFeedEngagePayload({
          url,
          action: "snapshot",
          starOwnerIds: [viewerOwnerId, authorProfile.owner.ownerId],
          comments: [
            {
              id: "c1",
              authorOwnerId: viewerOwnerId,
              text: "Synced",
              createdAt: "2026-07-20T12:00:00.000Z",
            },
          ],
        }),
      }),
      signature: "test-signature",
    };

    const result = await handleInboundFeedEngage({
      envelope,
      profileDir,
      profile: viewerLocalProfile,
      remotePeerId: authorLibp2p,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshotApplied).toBe(true);
    const rec = await loadContentEngagement(profileDir, url);
    expect(rec.stars).toEqual([viewerOwnerId, authorProfile.owner.ownerId]);
    expect(rec.comments).toHaveLength(1);
    expect(rec.comments[0]?.id).toBe("c1");
  });

  it("preserves viewer commentId on inbound comment so uncomment can match", async () => {
    const url = authorUrl();
    const sharedId = "viewer-uuid-abc";

    const commentResult = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "comment",
          text: "Hello from viewer",
          commentId: sharedId,
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(commentResult.ok).toBe(true);
    if (!commentResult.ok) return;
    expect(commentResult.notification?.action).toBe("comment");

    let rec = await loadContentEngagement(profileDir, url);
    expect(rec.comments).toHaveLength(1);
    expect(rec.comments[0]?.id).toBe(sharedId);

    const unResult = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "uncomment",
          commentId: sharedId,
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(unResult.ok).toBe(true);
    rec = await loadContentEngagement(profileDir, url);
    expect(rec.comments).toHaveLength(0);
  });

  it("toggles like for bonded viewer", async () => {
    const url = authorUrl();
    const star = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "star",
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(star.ok).toBe(true);
    if (!star.ok) return;
    expect(star.notification?.action).toBe("star");
    expect(star.summary?.starredByMe).toBe(true);

    const unstar = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "unstar",
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(unstar.ok).toBe(true);
    const rec = await loadContentEngagement(profileDir, url);
    expect(rec.stars).toEqual([]);
  });

  it("denies public strangers", async () => {
    await trustStore.setTrustRecord({
      peerOwnerId: viewerOwnerId,
      level: "public",
      displayName: "Stranger",
    });
    const result = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url: authorUrl(),
          action: "star",
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(result.ok).toBe(false);
  });

  it("idempotent comment with same commentId", async () => {
    const url = authorUrl();
    const sharedId = "same-id";
    await addContentCommentInStore(profileDir, url, viewerOwnerId, "once", sharedId);

    const result = await handleInboundFeedEngage({
      envelope: makeEngageEnvelope(
        createFeedEngagePayload({
          url,
          action: "comment",
          text: "once",
          commentId: sharedId,
          actorOwnerId: viewerOwnerId,
        }),
      ),
      profileDir,
      profile: authorProfile,
      remotePeerId: REMOTE_PEER,
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(result.ok).toBe(true);
    const rec = await loadContentEngagement(profileDir, url);
    expect(rec.comments).toHaveLength(1);
  });
});
