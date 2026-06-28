/**
 * Win must learn Mac's libp2p id when Mac pushes profile.sync (bond exists but directory was empty).
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
import { createProfileSyncPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const MAC_LIBP2P = "12D3KooWMacPeerIdLearnProfileSyncTest";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoy-profile-dir-learn-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function winProfile() {
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

function mockMesh(): EnvoyMesh {
  const conn = { connected: true, direct: true };
  return {
    peerId: "12D3KooWWinNode",
    multiaddrs: [],
    send: async () => undefined,
    sendChat: async () => undefined,
    sendExpectReply: async () => {
      throw new Error("sendExpectReply not configured for this test");
    },
    onMessage: () => {},
    getPeerConnectionInfo: () => conn,
    getConnectedPeerIds: () => [],
    getPeerStoreDialHints: async () => [],
    mergePeerStoreDialHints: async () => {},
    scrubPeerStoreDialHints: async () => [],
    tagContactForPersistentReachability: async () => {},
    ensurePeerReachable: async () => conn,
    closeConnectionsToPeer: async () => 0,
    start: async () => undefined,
    stop: async () => undefined,
  } as unknown as EnvoyMesh;
}

describe("profile.sync inbound learns libp2p for bond owner", () => {
  it("persists peer directory row so outbound profile.sync can resolve", async () => {
    const macOwner = generateOwnerIdentity();
    const macDevice = generateDeviceIdentity();
    const win = winProfile();
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, win, join(profileDir, "vault"));
    svc.bindExternalMesh(mockMesh());

    await trustStore.setTrustRecord({
      peerOwnerId: macOwner.ownerId,
      displayName: "Mac",
      level: "direct",
      now: new Date().toISOString(),
    });

    expect(await peerDirectory.getPeerByOwnerId(macOwner.ownerId)).toBeUndefined();

    const macProfile = signHumanProfile(
      {
        version: "0.1",
        ownerId: macOwner.ownerId,
        displayName: "Mac",
        username: "mac01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
      },
      macOwner.privateKeyPem,
    );
    const payload = createProfileSyncPayload(macProfile, undefined, macOwner.publicKeyPem);
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(macDevice.publicKeyPem),
      senderPublicKey: macDevice.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, macDevice.privateKeyPem);

    const handled = await svc.handleInboundProfileIntent(envelope, {
      transportPeerId: MAC_LIBP2P,
      remoteAddr: "/ip4/192.168.1.10/tcp/4001",
    });
    expect(handled).toBe(true);

    const row = await peerDirectory.getPeerByOwnerId(macOwner.ownerId);
    expect(row?.peerId).toBe(MAC_LIBP2P);

    const responseUnsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(macDevice.publicKeyPem),
      senderPublicKey: macDevice.publicKeyPem,
      senderRole: "human",
      intent: "profile.response",
      payload,
    });
    const responseEnvelope = signUnsignedEnvelope(responseUnsigned, macDevice.privateKeyPem);
    const meshWithReply = {
      ...mockMesh(),
      sendChatExpectEnvelopeReply: async () => responseEnvelope,
      sendExpectReply: async () => responseEnvelope,
    } as unknown as EnvoyMesh;
    svc.bindExternalMesh(meshWithReply);

    const result = await svc.requestPeerProfile(macOwner.ownerId);
    expect(result.ok, result.reason).toBe(true);
  });
});
