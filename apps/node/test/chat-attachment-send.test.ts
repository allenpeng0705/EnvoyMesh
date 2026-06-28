/**
 * sendChatAttachment — local-first persist for thin clients (EnvoyGo).
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

const PEER_OWNER_ID = "envoy:owner:remote-peer";
const TRANSPORT_PEER_ID = "12D3KooWRemotePeerTransportId1234567890";

let profileDir: string;
let vaultDir: string;

async function bootstrapNode() {
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
    vaultDir,
  );

  (node as any)._nodeStatus = "running";
  (node as any)._taskStore = { appendAuditEvent: vi.fn(async () => {}) };
  (node as any)._mesh = {
    peerId: "12D3KooWSelfNodeId123456789012345678901234",
    scrubPeerStoreDialHints: vi.fn(async () => {}),
  };
  (node as any)._resolvePeerTransportForOwner = async (ownerId: string) => {
    if (ownerId !== PEER_OWNER_ID) {
      throw new Error(`Peer not found for owner: ${ownerId}`);
    }
    return {
      transportPeerId: TRANSPORT_PEER_ID,
      recipientEnvelopePeerId: undefined,
      listenAddrs: [],
    };
  };
  (node as any)._dialHintsForChat = vi.fn(async () => []);
  (node as any)._tagBondedContactReachability = vi.fn(async () => {});

  return node;
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-chat-attach-send-"));
  vaultDir = join(profileDir, "vault");
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }).catch(() => {});
});

describe("sendChatAttachment local-first", () => {
  it("persists and returns before background P2P delivery completes", async () => {
    const node = await bootstrapNode();
    const audioBytes = Buffer.from("fake-audio-bytes");

    let deliverStarted = false;
    (node as any)._deliverStagedChatAttachment = vi.fn(async () => {
      deliverStarted = true;
      await new Promise((r) => setTimeout(r, 50));
    });

    const result = await node.sendChatAttachment({
      targetOwnerId: PEER_OWNER_ID,
      filename: "voice-note.m4a",
      contentBase64: audioBytes.toString("base64"),
      mimeType: "audio/mp4",
    });

    expect(result.messageId).toBeTruthy();
    expect(deliverStarted).toBe(true);

    const rows = await node.listChatHistory(PEER_OWNER_ID, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content.text).toContain("Audio message");
    expect(rows[0]?.content.attachments?.[0]?.filename).toBe("voice-note.m4a");
  });

  it("retries background chat.message delivery before share.request", async () => {
    const node = await bootstrapNode();
    const audioBytes = Buffer.from("fake-audio-bytes");
    let deliverAttempts = 0;

    (node as any)._deliverChatEnvelope = vi.fn(async () => {
      deliverAttempts += 1;
      if (deliverAttempts < 2) {
        return { delivered: false };
      }
      return { delivered: true, deliveredAt: new Date().toISOString() };
    });
    (node as any)._shareFileInternal = vi.fn(async () => undefined);

    await node.sendChatAttachment({
      targetOwnerId: PEER_OWNER_ID,
      filename: "voice-note.m4a",
      contentBase64: audioBytes.toString("base64"),
      mimeType: "audio/mp4",
    });

    await vi.waitFor(() => {
      expect(deliverAttempts).toBeGreaterThanOrEqual(2);
      expect((node as any)._shareFileInternal).toHaveBeenCalled();
    }, { timeout: 8000 });
  });

  it("sendChat persists locally when delivery throws", async () => {
    const node = await bootstrapNode();
    (node as any)._deliverChatEnvelope = vi.fn(async () => {
      throw new Error("network down");
    });
    (node as any).emit = vi.fn();

    await expect(node.sendChat(PEER_OWNER_ID, "hello offline")).resolves.toMatchObject({
      deliveryReceipt: "sent",
    });

    await vi.waitFor(async () => {
      const rows = await node.listChatHistory(PEER_OWNER_ID, 10);
      expect(rows).toHaveLength(1);
    }, { timeout: 2000 });

    const rows = await node.listChatHistory(PEER_OWNER_ID, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content.text).toBe("hello offline");
  });
});
