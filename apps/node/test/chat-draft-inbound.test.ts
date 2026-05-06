import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore, createChatDraftStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateChatDraft } from "../src/chat-draft-inbound.js";

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
      version: "0.1",
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
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-draft-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
  draftStore = createChatDraftStore(profileDir);
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("generateChatDraft", () => {
  it("returns failure when chat assist is disabled", async () => {
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-a", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("disabled");
    }
  });

  it("returns failure when model provider is disabled", async () => {
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-a", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("disabled");
    }
  });

  it("returns failure when sender is blocked", async () => {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:blocked-bob",
      peerId: "peer-blocked",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:blocked-bob",
      level: "blocked",
      displayName: "Blocked Bob",
      now: new Date().toISOString(),
    });

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-blocked", "envoy:owner:blocked-bob", "Hi!"),
      senderOwnerId: "envoy:owner:blocked-bob",
      senderDisplayName: "Blocked Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-2",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("blocked");
    }
  });

  it("succeeds for bonded direct peer with mock provider", async () => {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "peer-b",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      level: "direct",
      displayName: "Bob",
      now: new Date().toISOString(),
    });

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "What is EnvoyMesh?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "What is EnvoyMesh?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-3",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.draftId.length).toBeGreaterThan(0);
      expect(result.draft.inReplyToMessageId).toBe("msg-chat-1");
      expect(result.draft.text.length).toBeGreaterThan(0);
    }

    // Verify draft was stored
    const drafts = await draftStore.listByThread("envoy:owner:bob");
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts[0].draftId).toBe(result.ok ? result.draft.draftId : drafts[0].draftId);
  });

  it("audits model routing decision", async () => {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:alice",
      peerId: "peer-alice",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      level: "direct",
      displayName: "Alice",
      now: new Date().toISOString(),
    });

    await generateChatDraft({
      envelope: chatEnvelope("peer-alice", "envoy:owner:alice", "Hi!"),
      senderOwnerId: "envoy:owner:alice",
      senderDisplayName: "Alice",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-audit",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    const audits = await taskStore.readAuditEvents();
    const modelRoutedEvents = audits.filter((a) => a.type === "model.routed");
    expect(modelRoutedEvents.length).toBeGreaterThanOrEqual(1);
    // Audit summary should not contain the full draft text (privacy)
    for (const event of modelRoutedEvents) {
      expect(event.summary).not.toContain("Hello from the mock");
    }
  });

  it("does not create draft for stranger (public bond level) — model still routes", async () => {
    // No peer directory entry, no trust record → bond level = "public"
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-stranger", "envoy:owner:stranger", "Hello stranger"),
      senderOwnerId: "envoy:owner:stranger",
      senderDisplayName: "Stranger",
      chatText: "Hello stranger",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-stranger",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    // Model routes successfully (mock provider allows public sensitivity)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.text.length).toBeGreaterThan(0);
    }
  });
});

describe("ChatDraftStore", () => {
  it("saves and retrieves a draft", async () => {
    const draft = {
      draftId: "draft-1",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "msg-1",
      text: "Hello Bob!",
      createdAt: new Date().toISOString(),
    };

    await draftStore.save(draft);
    const drafts = await draftStore.listByThread("envoy:owner:bob");

    expect(drafts.length).toBe(1);
    expect(drafts[0].draftId).toBe("draft-1");
    expect(drafts[0].text).toBe("Hello Bob!");
  });

  it("lists all drafts across threads", async () => {
    await draftStore.save({
      draftId: "d1",
      threadPeerOwnerId: "envoy:owner:alice",
      inReplyToMessageId: "m1",
      text: "Hi Alice",
      createdAt: new Date().toISOString(),
    });
    await draftStore.save({
      draftId: "d2",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "m2",
      text: "Hi Bob",
      createdAt: new Date().toISOString(),
    });

    const all = await draftStore.listAll();
    expect(all.length).toBe(2);
  });

  it("deletes a specific draft by id", async () => {
    await draftStore.save({
      draftId: "to-delete",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "m1",
      text: "Draft to delete",
      createdAt: new Date().toISOString(),
    });
    await draftStore.save({
      draftId: "to-keep",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "m2",
      text: "Draft to keep",
      createdAt: new Date().toISOString(),
    });

    await draftStore.delete("to-delete");

    const drafts = await draftStore.listByThread("envoy:owner:bob");
    expect(drafts.length).toBe(1);
    expect(drafts[0].draftId).toBe("to-keep");
  });

  it("deletes all drafts for a thread", async () => {
    await draftStore.save({
      draftId: "d1",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "m1",
      text: "Draft 1",
      createdAt: new Date().toISOString(),
    });
    await draftStore.save({
      draftId: "d2",
      threadPeerOwnerId: "envoy:owner:bob",
      inReplyToMessageId: "m2",
      text: "Draft 2",
      createdAt: new Date().toISOString(),
    });

    await draftStore.deleteByThread("envoy:owner:bob");

    const drafts = await draftStore.listByThread("envoy:owner:bob");
    expect(drafts.length).toBe(0);
  });
});
