/**
 * Voice note 1:1 chat — deferred vault path apply when transfer beats chat.message.
 */
import { createDeviceCertificate, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import {
  createLocalChatLogStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { deferredDirectChatAttachmentKey } from "@envoymesh/api";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-voice-chat-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("voice message 1:1 chat", () => {
  it("reconcileInboundDirectChatMessage applies deferred vault path after early transfer", async () => {
    const senderOwner = generateOwnerIdentity();
    const receiverOwner = generateOwnerIdentity();
    const receiverDevice = generateDeviceIdentity();
    const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const vaultPath = `chat/in/${senderOwner.ownerId.replace(/:/g, "_")}/voice-note.webm`;

    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const humanProfileStore = { loadHumanProfile: async () => undefined } as any;
    const chatLogStore = createLocalChatLogStore(profileDir);

    const node = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectoryStore,
      humanProfileStore,
      profileDir,
      {
        owner: receiverOwner,
        device: receiverDevice,
        deviceCertificate: createDeviceCertificate({
          owner: receiverOwner,
          device: receiverDevice,
          deviceProfile: "primary",
          capabilities: ["message.send"],
        }),
      } as any,
      vaultDir,
    );

    const inboundMsg = {
      messageId,
      sender: {
        nodeId: "12D3Sender",
        ownerId: senderOwner.ownerId,
        displayName: "Alice",
      },
      recipient: {
        nodeId: "12D3Self",
        ownerId: receiverOwner.ownerId,
        displayName: "Me",
      },
      content: {
        text: "",
        attachments: [
          {
            id: attachmentId,
            filename: "voice-note.webm",
            mimeType: "audio/webm;codecs=opus",
            sizeBytes: 4096,
            sensitivity: "friends" as const,
          },
        ],
      },
      metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "delivered" as const },
      signature: "sig",
    };

    (node as any)._transferState.deferredDirectChatAttachmentVaultPath.set(
      deferredDirectChatAttachmentKey(senderOwner.ownerId, messageId, attachmentId),
      vaultPath,
    );

    await chatLogStore.append(senderOwner.ownerId, inboundMsg);
    const reconciled = await node.reconcileInboundDirectChatMessage(
      senderOwner.ownerId,
      inboundMsg,
    );

    expect(reconciled.content.attachments?.[0]?.vaultRelativePath).toBe(vaultPath);
    expect(
      (node as any)._transferState.deferredDirectChatAttachmentVaultPath.has(
        deferredDirectChatAttachmentKey(senderOwner.ownerId, messageId, attachmentId),
      ),
    ).toBe(false);
  });
});
