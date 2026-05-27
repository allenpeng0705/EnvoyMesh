import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore, createChatDraftStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalQueue } from "../src/approval-queue.js";
import { runInboundChatAssist } from "../src/inbound-chat-assist.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let peerDirectoryStore: ReturnType<typeof createLocalPeerDirectoryStore>;
let draftStore: ReturnType<typeof createChatDraftStore>;

function makeTestProfile() {
  return {
    owner: {
      ownerId: "envoy:owner:test123",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    },
    device: {
      deviceId: "envoy:device:test456",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    },
    deviceCertificate: {
      version: "0.1" as const,
      deviceId: "envoy:device:test456",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      capabilities: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      signature: "sig",
    },
  };
}

function chatEnvelope(senderPeerId: string, senderOwnerId: string, text: string): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId,
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "chat.message",
      payload: { senderOwnerId, text },
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "msg-chat-1",
    }),
    signature: "signature",
  };
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-chat-assist-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
  draftStore = createChatDraftStore(profileDir);
  await trustStore.setTrustRecord({
    peerOwnerId: "envoy:owner:bob",
    level: "direct",
    displayName: "Bob",
  });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("runInboundChatAssist approval queue", () => {
  it("queues send_chat when auto-send policy denies but draft is generated", async () => {
    const approvalQueue = new ApprovalQueue();
    const sendChat = vi.fn();
    const emitDraft = vi.fn();

    await runInboundChatAssist({
      envelope: chatEnvelope("peer-a", "envoy:owner:bob", "Can you help?"),
      senderOwnerId: "envoy:owner:bob",
      chatText: "Can you help?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      config: {
        chatAssistEnabled: true,
        autonomousKillSwitch: true,
        autonomousPolicies: [{ domain: "social", maxSensitivity: "friends", autoAnswer: true, autoSendChat: true }],
        contactAiPreferences: [{ peerOwnerId: "envoy:owner:bob", aiAccessLevel: "full" }],
        aiSettings: {
          status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
          identity: { mode: "transparent" },
          defaultModeForNewContacts: "manual",
          rules: [
            {
              id: "greet",
              enabled: true,
              name: "Greet",
              category: "availability",
              priority: 1,
              trigger: { isGreeting: true },
              action: { type: "draft", template: "Hi {ownerName}, thanks for reaching out!" },
            },
          ],
        },
        modelProviders: { mode: "mock" },
      },
      modelProviders: { mode: "mock" },
      profile: makeTestProfile(),
      taskStore,
      trustStore,
      peerDirectoryStore,
      draftStore,
      chatLogStore: null,
      humanProfileStore: { loadHumanProfile: async () => null } as never,
      vaultDir: profileDir,
      styleAdapter: null,
      sendChat,
      emitDraft,
      approvalQueue,
    });

    expect(sendChat).not.toHaveBeenCalled();
    expect(emitDraft).toHaveBeenCalled();
    const pending = approvalQueue.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.actionType).toBe("send_chat");
    expect(pending[0]?.context.contactOwnerId).toBe("envoy:owner:bob");
  });
});
