/**
 * Chat attachments (deliveryChannel=chat) should auto-accept without Inbox.
 */
import { createDeviceCertificate, derivePeerId, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import {
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { createShareRequestPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInboundShareRequest } from "../src/share-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const PEER_DIRECTORY_JSON = "peer-directory.json";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-chat-attach-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("chat attachment auto-accept", () => {
  it("share.request with deliveryChannel chat returns preview without requiresApproval", async () => {
    const senderOwner = generateOwnerIdentity();
    const senderDevice = generateDeviceIdentity();
    const receiverOwner = generateOwnerIdentity();
    const receiverDevice = generateDeviceIdentity();
    const SENDER = "12D3KooChatAttachSender";

    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await trustStore.setTrustRecord({
      peerOwnerId: senderOwner.ownerId,
      level: "referred",
      displayName: "Alice",
    });

    await writeFile(
      join(profileDir, PEER_DIRECTORY_JSON),
      JSON.stringify({
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: senderOwner.ownerId,
            peerId: SENDER,
            deviceId: senderDevice.deviceId,
            devicePublicKeyPem: senderDevice.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: [],
          },
        ],
      }),
      { mode: 0o600 },
    );

    const profile = {
      owner: receiverOwner,
      device: receiverDevice,
      deviceCertificate: createDeviceCertificate({
        owner: receiverOwner,
        device: receiverDevice,
        deviceProfile: "primary",
        capabilities: ["message.send", "mesh.listen"],
      }),
    };

    const envelope = createUnsignedEnvelope({
      senderPeerId: derivePeerId(senderDevice.publicKeyPem),
      senderPublicKey: senderDevice.publicKeyPem,
      intent: "share.request",
      payload: createShareRequestPayload({
        requestType: "file",
        relativePath: "chat/out/id/photo.jpg",
        requestedSensitivity: "friends",
        fileOrigin: "sender",
        deliveryChannel: "chat",
      }),
    });

    const result = await handleInboundShareRequest({
      envelope: envelope as any,
      remotePeerId: SENDER,
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      vaultDir,
      modelProviders: { mode: "disabled" },
      capabilityManifest: undefined,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.requiresApproval).toBe(false);
      expect(result.responsePayload.isFileTransfer).toBe(true);
    }
  });

  it("maybeAutoAcceptChatShare accepts after recordInboundPushShareOffer (no race)", async () => {
    const aliceOwner = generateOwnerIdentity();
    const aliceDevice = generateDeviceIdentity();
    const SENDER = "12D3KooChatAttachRace";

    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const humanProfileStore = { loadHumanProfile: async () => undefined } as any;

    await trustStore.setTrustRecord({
      peerOwnerId: aliceOwner.ownerId,
      level: "direct",
    });

    const node = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      profileDir,
      {
        owner: generateOwnerIdentity(),
        device: generateDeviceIdentity(),
        deviceCertificate: createDeviceCertificate({
          owner: generateOwnerIdentity(),
          device: generateDeviceIdentity(),
          deviceProfile: "primary",
          capabilities: ["message.send"],
        }),
      } as any,
      vaultDir,
    );

    const shareId = "preview-msg-id-123";
    await node.recordInboundPushShareOffer({
      shareId,
      senderPeerId: SENDER,
      senderOwnerId: aliceOwner.ownerId,
      previewText: "chat file",
      sensitivity: "friends",
      relativePath: "chat/out/x/photo.jpg",
      deliveryChannel: "chat",
    });

    const offers = await node.listPendingShareOffers();
    expect(offers.some((o) => o.shareId === shareId)).toBe(true);

    const acceptSpy = vi.spyOn(node, "acceptShare").mockResolvedValue(undefined);
    await node.maybeAutoAcceptChatShare({
      shareId,
      senderOwnerId: aliceOwner.ownerId,
      senderRelativePath: "chat/out/x/photo.jpg",
      requiresApproval: false,
    });

    expect(acceptSpy).toHaveBeenCalledWith(
      shareId,
      expect.stringMatching(/^chat\/in\//),
    );
  });
});
