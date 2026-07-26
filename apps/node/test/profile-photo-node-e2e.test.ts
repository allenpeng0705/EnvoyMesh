/**
 * E2E: NodeServiceImpl profile photos — thumbnail, gallery (public), peer cache via inbound sync.
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
  createProfileSyncPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-profile-photo-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function nodeProfile() {
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

function mockMesh(peerId = "12D3KooWProfilePhotoTest"): EnvoyMesh {
  return {
    peerId,
    multiaddrs: [],
    send: async () => undefined,
    onMessage: () => {},
    probePeer: async () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
  } as unknown as EnvoyMesh;
}

function createService(profile = nodeProfile(), dir = profileDir) {
  const vault = join(dir, "vault");
  const trustStore = createLocalTrustStore(dir);
  const peerDirectory = createLocalPeerDirectoryStore(dir);
  const human = createHumanProfileStore(dir);
  const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, dir, profile, vault);
  svc.bindExternalMesh(mockMesh());
  return {
    profile,
    profileDir: dir,
    vaultDir: vault,
    human,
    svc,
  };
}

async function seedProfile(
  human: ReturnType<typeof createHumanProfileStore>,
  profile: ReturnType<typeof nodeProfile>,
  displayName: string,
  username: string,
) {
  const signed = signHumanProfile(
    {
      version: "0.1",
      ownerId: profile.owner.ownerId,
      displayName,
      username,
      profileVisibility: "private",
      updatedAt: new Date().toISOString(),
    },
    profile.owner.privateKeyPem,
  );
  await human.saveHumanProfile(signed);
}

describe("E2E NodeServiceImpl profile photos", () => {
  it("setPublicProfileThumbnail writes vault file and updates signed profile", async () => {
    const { svc, human, profile } = createService();
    await seedProfile(human, profile, "Alice", "alice01");

    const updated = await svc.setPublicProfileThumbnail({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
    });

    expect(updated.publicThumbnail?.vaultRelativePath).toMatch(/^profile\/thumbnail\.png$/);
    const onDisk = await readFile(join(vaultDir, updated.publicThumbnail!.vaultRelativePath));
    expect(onDisk.length).toBeGreaterThan(0);

    const loaded = await svc.getHumanProfile();
    expect(loaded?.publicThumbnail?.contentSha256).toBe(updated.publicThumbnail?.contentSha256);
  });

  it("upsertProfileGalleryPhoto defaults visibility to public when requested", async () => {
    const { svc, human, profile } = createService();
    await seedProfile(human, profile, "Alice", "alice01");

    const updated = await svc.upsertProfileGalleryPhoto({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      visibility: "public",
      label: "Trip",
    });

    expect(updated.galleryPhotos).toHaveLength(1);
    expect(updated.galleryPhotos![0]!.visibility).toBe("public");
    expect(updated.galleryPhotos![0]!.label).toBe("Trip");
  });

  it("upsertProfileGalleryPhoto mirrors the photo onto PhotoWall", async () => {
    const { svc, human, profile, profileDir: dir } = createService();
    await seedProfile(human, profile, "Alice", "alice01");

    const updated = await svc.upsertProfileGalleryPhoto({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
      visibility: "public",
      label: "Trip",
    });
    const photoId = updated.galleryPhotos![0]!.photoId;

    const { readdir } = await import("node:fs/promises");
    const wallDir = join(dir, "web", "photos", "wall");
    const wallFiles = await readdir(wallDir);
    expect(wallFiles.some((f) => f.includes(`gallery-${photoId}`))).toBe(true);
    const wallIndex = await readFile(join(wallDir, "index.md"), "utf8");
    expect(wallIndex).toContain("Trip");

    await svc.removeProfileGalleryPhoto({
      vaultRelativePath: updated.galleryPhotos![0]!.vaultRelativePath,
    });
    const after = await readdir(wallDir);
    expect(after.some((f) => f.includes(`gallery-${photoId}`))).toBe(false);
  });

  it("accepts profile.sync when ownerPublicKeyPem is included in payload", async () => {
    const { svc, profile } = createService();
    const unsignedProfile = signHumanProfile(
      {
        version: "0.1",
        ownerId: profile.owner.ownerId,
        displayName: "Mac",
        username: "mac01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
      },
      profile.owner.privateKeyPem,
    );
    const payload = createProfileSyncPayload(
      unsignedProfile,
      undefined,
      profile.owner.publicKeyPem,
    );
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
    expect(await svc.handleInboundProfileIntent(envelope)).toBe(true);
    const cached = await svc.getPeerProfile(profile.owner.ownerId);
    expect(cached?.profile.displayName).toBe("Mac");
  });

  it("rejects profile.sync when owner public key is unknown", async () => {
    const { svc, profile } = createService();
    const unsignedProfile = signHumanProfile(
      {
        version: "0.1",
        ownerId: profile.owner.ownerId,
        displayName: "Ghost",
        username: "ghost01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
      },
      profile.owner.privateKeyPem,
    );
    const payload = createProfileSyncPayload(unsignedProfile);
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
    expect(await svc.handleInboundProfileIntent(envelope)).toBe(false);
  });
});
