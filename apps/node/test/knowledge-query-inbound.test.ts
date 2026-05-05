import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { buildVaultIndex } from "@envoymesh/vault";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let peerDirectoryStore: ReturnType<typeof createLocalPeerDirectoryStore>;

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

function knowledgeEnvelope(senderPeerId: string, payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId,
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "knowledge.query",
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "message-kq-1",
    }),
    signature: "signature",
  };
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-knowledge-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("handleInboundKnowledgeQuery", () => {
  it("returns error for invalid payload (empty query)", async () => {
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-a", { query: "" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("succeeds for valid payload from stranger (no trust record) — defaults to public", async () => {
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-a", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
    });

    // Stranger: not in peer directory → bond level = "public"
    // Public peers are denied for knowledge.query (policy check returns deny)
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("public");
    }
  });

  it("succeeds for bonded direct peer with vault index", async () => {
    // Set up a bonded contact: add to peer directory + trust store
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bonded-contact",
      peerId: "peer-b",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bonded-contact",
      level: "direct",
      displayName: "Bob",
      now: new Date().toISOString(),
    });

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-b", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-2",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.inReplyTo).toBe("message-kq-1");
      expect(result.responsePayload.answer.length).toBeGreaterThan(0);
      expect(result.responsePayload.refused).toBe(false);
      expect(result.responsePayload.sensitivity).toBe("friends"); // direct bond allows friends sensitivity
    }

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.summary?.includes("knowledge.query received"))).toBe(true);
    expect(audits.some((a) => a.type === "message.verified")).toBe(true);
    expect(audits.some((a) => a.type === "model.routed")).toBe(true);
  });

  it("denies blocked peer", async () => {
    // Set up a blocked contact in peer directory + trust store
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:blocked-contact",
      peerId: "peer-c",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:blocked-contact",
      level: "blocked",
      displayName: "Evil Bob",
      now: new Date().toISOString(),
    });

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-c", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("blocked");
    }

    const audits = await taskStore.readAuditEvents();
    const policyDenied = audits.find((a) => a.type === "policy.decided");
    expect(policyDenied?.outcome).toBe("deny");
  });

  it("uses vault content in answer when vault index is provided", async () => {
    // Set up vault directory with a document
    const vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-test-vault-"));
    await writeFile(join(vaultDir, "about.md"), "EnvoyMesh is a decentralized P2P network for AI agents.", { encoding: "utf8" });
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });
    expect(vaultIndex.documents.length).toBe(1);
    expect(vaultIndex.chunks.length).toBeGreaterThan(0);

    // Set up bonded contact
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

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-alice", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.inReplyTo).toBe("message-kq-1");
      // Answer should reference vault content
      expect(result.responsePayload.answer.length).toBeGreaterThan(0);
      expect(result.responsePayload.refused).toBe(false);
      // Match score should be > 0 since vault had relevant content
      expect(result.responsePayload.matchScore).toBeGreaterThan(0);
    }

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "vault.searched")).toBe(true);
    expect(audits.some((a) => a.summary?.includes("vault search"))).toBe(true);

    await rm(vaultDir, { recursive: true, force: true });
  });
});
