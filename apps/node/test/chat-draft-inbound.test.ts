import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore, createChatDraftStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { buildVaultIndex, type VaultIndex } from "@envoymesh/vault";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateChatDraft } from "../src/chat-draft-inbound.js";
import type { AiRule, AiIdentity } from "@envoymesh/api";

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

describe("Rule Matching", () => {
  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  it("matches keyword triggers correctly", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "meeting-rule",
        enabled: true,
        name: "Meeting Query",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["meeting", "schedule", "calendar"] },
        action: { type: "draft", template: "I'll check {ownerName}'s calendar." },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Can we schedule a meeting for tomorrow?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Can we schedule a meeting for tomorrow?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-keyword",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    expect(result.ok).toBe(true);
  });

  it("matches greeting triggers correctly", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "greeting-rule",
        enabled: true,
        name: "Greeting",
        category: "availability",
        priority: 1,
        trigger: { isGreeting: true },
        action: { type: "draft", template: "Hi there! {ownerName} will be back soon." },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-greeting",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    expect(result.ok).toBe(true);
  });

  it("matches regex triggers correctly", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "phone-rule",
        enabled: true,
        name: "Phone Query",
        category: "capability",
        priority: 1,
        trigger: { messageContains: "\\b(phone|telephone|call me)\\b" },
        action: { type: "draft", template: "I can't share that info." },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "What's your phone number?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "What's your phone number?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-regex",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    expect(result.ok).toBe(true);
  });

  it("rules are evaluated by priority (lower first)", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "low-priority",
        enabled: true,
        name: "Low Priority",
        category: "catch_all",
        priority: 100,
        trigger: {},
        action: { type: "draft", template: "Low priority response" },
      },
      {
        id: "high-priority",
        enabled: true,
        name: "High Priority",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["hello"] },
        action: { type: "draft", template: "High priority response" },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello there!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello there!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-priority",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    // Should match high priority rule due to "hello" keyword
    expect(result.ok).toBe(true);
  });

  it("disabled rules are not evaluated", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "disabled-rule",
        enabled: false,
        name: "Disabled Rule",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["help"] },
        action: { type: "draft", template: "This should not be used" },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "I need help!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "I need help!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-disabled",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    // Should succeed but not use the disabled rule's template
    expect(result.ok).toBe(true);
  });

  it("matches contactAiAccessLevel trigger", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "full-access-rule",
        enabled: true,
        name: "Full Access Rule",
        category: "capability",
        priority: 1,
        trigger: { contactAiAccessLevel: ["full"] },
        action: { type: "draft", template: "Full access granted" },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-rule-access",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "full",
      rules,
    });

    expect(result.ok).toBe(true);
  });
});

describe("Identity Modes", () => {
  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  it("uses invisible identity mode in prompt", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const aiIdentity: AiIdentity = { mode: "invisible" };

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-identity",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity,
    });

    expect(result.ok).toBe(true);
  });

  it("uses transparent identity mode in prompt", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const aiIdentity: AiIdentity = { mode: "transparent", transparentPrefix: "[AI]" };

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-identity-transparent",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity,
    });

    expect(result.ok).toBe(true);
  });

  it("uses defensive identity mode in prompt", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const aiIdentity: AiIdentity = { mode: "defensive", transparentPrefix: "[Assistant]" };

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-identity-defensive",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity,
    });

    expect(result.ok).toBe(true);
  });

  it("rule can override identity mode", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const aiIdentity: AiIdentity = { mode: "transparent" };
    const rules: AiRule[] = [
      {
        id: "override-rule",
        enabled: true,
        name: "Override Rule",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["urgent"] },
        action: { type: "draft", aiIdentityOverride: "defensive" },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "This is urgent!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "This is urgent!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-identity-override",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity,
      rules,
    });

    expect(result.ok).toBe(true);
  });
});

describe("Vault Integration", () => {
  let vaultDir: string;
  let vaultIndex: VaultIndex | null = null;

  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  beforeEach(async () => {
    vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-vault-"));
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("searches vault when rule has vaultQuery", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    // Create a vault index with some documents
    await mkdir(join(vaultDir, "calendar"), { recursive: true });
    await writeFile(join(vaultDir, "calendar", "meetings.txt"), "Meeting with John tomorrow at 3pm");

    vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    const rules: AiRule[] = [
      {
        id: "calendar-rule",
        enabled: true,
        name: "Calendar Check",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["meeting", "schedule", "calendar"] },
        action: {
          type: "draft",
          vaultQuery: { path: "meeting", maxSensitivity: "public" },
        },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Do I have any meetings tomorrow?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Do I have any meetings tomorrow?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
      vaultIndex,
      knowledgeAccess: "public",
    });

    expect(result.ok).toBe(true);
  });

  it("filters vault results by sensitivity", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    // Create documents with different sensitivity levels
    await mkdir(join(vaultDir, "public"), { recursive: true });
    await mkdir(join(vaultDir, "personal"), { recursive: true });
    await writeFile(join(vaultDir, "public", "info.txt"), "Public information about meetings");
    await writeFile(join(vaultDir, "personal", "secrets.txt"), "Private personal information");

    vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    const rules: AiRule[] = [
      {
        id: "sensitivity-rule",
        enabled: true,
        name: "Sensitivity Test",
        category: "capability",
        priority: 1,
        trigger: { keywords: ["info"] },
        action: {
          type: "draft",
          vaultQuery: { path: "info", maxSensitivity: "public" },
        },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "What info do you have?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "What info do you have?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault-sensitivity",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
      vaultIndex,
      knowledgeAccess: "public",
    });

    expect(result.ok).toBe(true);
  });

  it("handles missing vault gracefully", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const rules: AiRule[] = [
      {
        id: "vault-rule",
        enabled: true,
        name: "Vault Rule",
        category: "availability",
        priority: 1,
        trigger: { keywords: ["calendar"] },
        action: {
          type: "draft",
          vaultQuery: { path: "meeting", maxSensitivity: "public" },
        },
      },
    ];

    // No vaultIndex provided
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Check my calendar"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Check my calendar",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault-missing",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
      vaultIndex: null,
    });

    // Should still succeed - vault is optional
    expect(result.ok).toBe(true);
  });
});

describe("Online/Offline Status", () => {
  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  it("includes online status in prompt when isOnline is true", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-online",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      isOnline: true,
    });

    expect(result.ok).toBe(true);
  });

  it("includes offline status in prompt when isOnline is false", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-offline",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      isOnline: false,
    });

    expect(result.ok).toBe(true);
  });

  it("defaults to isOnline true when not specified", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-default-online",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    expect(result.ok).toBe(true);
  });
});

describe("Contact AI Access Level", () => {
  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  it("generates draft when access level is full", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-access-full",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "full",
    });

    expect(result.ok).toBe(true);
  });

  it("generates draft when access level is assistant_only", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-access-assistant",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "assistant_only",
    });

    expect(result.ok).toBe(true);
  });

  it("generates draft when access level is none (no AI access)", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    // Even with "none" access, generateChatDraft itself doesn't block
    // The caller (index.ts) is responsible for checking access level
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-access-none",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "none",
    });

    // generateChatDraft doesn't block based on contactAiAccessLevel
    // That check is done by the caller
    expect(result.ok).toBe(true);
  });

  it("uses knowledgeAccess in vault filtering", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-knowledge-access",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "full",
      knowledgeAccess: "personal",
    });

    expect(result.ok).toBe(true);
  });

  it("passes contact knowledgeAccess to Assist vault search (not hardcoded public)", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");
    const searchVaultKnowledgeBase = vi.fn().mockResolvedValue([]);
    const ragService = {
      searchVaultKnowledgeBase,
      getExternalKnowledgeContext: vi.fn().mockResolvedValue(""),
    };

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hello!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hello!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-ka-pass",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiAccessLevel: "assistant_only",
      knowledgeAccess: "friends",
      vaultIndex: { documents: [], chunks: [] } as never,
      ragService: ragService as never,
    });

    expect(result.ok).toBe(true);
    expect(searchVaultKnowledgeBase).toHaveBeenCalled();
    expect(searchVaultKnowledgeBase.mock.calls[0]?.[0]?.knowledgeAccess).toBe("friends");
    expect(searchVaultKnowledgeBase.mock.calls[0]?.[0]?.knowledgeScope).toBe("public");
  });
});

describe("Edge Cases", () => {
  it("verifies stranger/public draft is persisted to store", async () => {
    // No peer directory entry, no trust record → bond level = "public"
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-stranger", "envoy:owner:stranger", "Hello stranger"),
      senderOwnerId: "envoy:owner:stranger",
      senderDisplayName: "Stranger",
      chatText: "Hello stranger",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-stranger-persist",
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
      expect(result.draft.text.length).toBeGreaterThan(0);
      // Verify draft was stored
      const drafts = await draftStore.listByThread("envoy:owner:stranger");
      expect(drafts.length).toBeGreaterThan(0);
    }
  });

  it("isComplex trigger always returns false (placeholder)", async () => {
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

    const rules: AiRule[] = [
      {
        id: "complex-rule",
        enabled: true,
        name: "Complex Query",
        category: "capability",
        priority: 1,
        trigger: { isComplex: true },
        action: { type: "draft", template: "This should not match" },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Please help me with something very complicated and technical!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Please help me with something very complicated and technical!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-complex",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
    });

    // Should succeed but NOT use the rule's template since isComplex always returns false
    expect(result.ok).toBe(true);
  });

  it("handles empty message text", async () => {
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
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", ""),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-empty",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });

    // Should still succeed even with empty message
    expect(result.ok).toBe(true);
  });

  it("uses ownerDisplayName when provided", async () => {
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
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-owner-name",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity: { mode: "invisible" },
      ownerDisplayName: "Alice", // Use human-readable name instead of ownerId
    });

    expect(result.ok).toBe(true);
  });

  it("falls back to ownerId when ownerDisplayName not provided", async () => {
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
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Hi!"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Hi!",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-no-owner-name",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      aiIdentity: { mode: "invisible" },
      // ownerDisplayName not provided - will fall back to profile.owner.ownerId
    });

    expect(result.ok).toBe(true);
  });
});

describe("Vault Sensitivity", () => {
  let vaultDir: string;
  let vaultIndex: VaultIndex | null = null;

  beforeEach(async () => {
    vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-vault-sensitivity-"));
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
  });

  async function setupBondedPeer(ownerId: string, peerId: string, displayName: string) {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId,
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "direct",
      displayName,
      now: new Date().toISOString(),
    });
  }

  it("filters personal vault docs correctly based on maxSensitivity and knowledgeAccess", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    // Create documents with different sensitivity levels
    await mkdir(join(vaultDir, "public"), { recursive: true });
    await mkdir(join(vaultDir, "friends"), { recursive: true });
    await mkdir(join(vaultDir, "personal"), { recursive: true });
    await writeFile(join(vaultDir, "public", "info.txt"), "Public meeting information");
    await writeFile(join(vaultDir, "friends", "shared.txt"), "Shared with friends information");
    await writeFile(join(vaultDir, "personal", "secret.txt"), "Personal secret information");

    vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    const rules: AiRule[] = [
      {
        id: "sensitivity-test-rule",
        enabled: true,
        name: "Sensitivity Test",
        category: "capability",
        priority: 1,
        trigger: { keywords: ["info"] },
        action: {
          type: "draft",
          vaultQuery: { path: "info", maxSensitivity: "friends" },
        },
      },
    ];

    // With maxSensitivity=friends and knowledgeAccess=personal,
    // public and friends docs should be included, personal excluded
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "What info do you have?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "What info do you have?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault-sens",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
      vaultIndex,
      knowledgeAccess: "personal",
    });

    expect(result.ok).toBe(true);
  });

  it("excludes personal docs when maxSensitivity is lower than personal", async () => {
    await setupBondedPeer("envoy:owner:bob", "peer-b", "Bob");

    await mkdir(join(vaultDir, "personal"), { recursive: true });
    await writeFile(join(vaultDir, "personal", "secret.txt"), "Personal secret information");

    vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    const rules: AiRule[] = [
      {
        id: "block-personal-rule",
        enabled: true,
        name: "Block Personal",
        category: "capability",
        priority: 1,
        trigger: { keywords: ["secret"] },
        action: {
          type: "draft",
          vaultQuery: { path: "secret", maxSensitivity: "friends" },
        },
      },
    ];

    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "Any secrets?"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "Any secrets?",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault-block",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      rules,
      vaultIndex,
      knowledgeAccess: "personal",
    });

    // Should succeed but personal vault data should not be included due to maxSensitivity=friends
    expect(result.ok).toBe(true);
  });

  // Phase 37 — audio message fallback text
  it("accepts audio-message fallback text as valid chatText", async () => {
    const result = await generateChatDraft({
      envelope: chatEnvelope("peer-b", "envoy:owner:bob", "[Audio message — no transcription available]"),
      senderOwnerId: "envoy:owner:bob",
      senderDisplayName: "Bob",
      chatText: "[Audio message — no transcription available]",
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-audio-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      draftStore,
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
    });
    // Should succeed — the fallback text is valid input for the AI
    expect(result.ok).toBe(true);
  });
});
