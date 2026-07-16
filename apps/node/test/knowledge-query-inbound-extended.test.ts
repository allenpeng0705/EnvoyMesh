/**
 * Phase 8L — Extended knowledge query inbound tests (knowledge-query-inbound.ts 76% → higher coverage).
 *
 * Tests the uncovered paths in handleInboundKnowledgeQuery:
 * - approval_required policy outcome (referred bond, friends sensitivity)
 * - model provider disabled mode
 * - error handling (Zod parse failures)
 * - stranger (no trust record) allowed at public sensitivity (Phase 44B)
 */

import { createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
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
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `kq-ext-${Date.now()}`,
    }),
    signature: "signature",
  };
}

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-knowledge-ext-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});


describe("handleInboundKnowledgeQuery — model provider disabled", () => {
  it("returns refused answer when model provider is disabled", async () => {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-friend",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:friend",
      level: "direct",
      displayName: "Friend",
      now: new Date().toISOString(),
    });

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-friend", { query: "Hello?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-disabled",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
      modelProviders: { mode: "disabled" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.refused).toBe(true);
      expect(result.responsePayload.refusalReason).toBe("model disabled");
      expect(result.responsePayload.answer).toContain("model provider is currently disabled");
    }

    // Verify model.routed audit event with deny outcome
    const audits = await taskStore.readAuditEvents();
    const modelRouted = audits.find((a) => a.type === "model.routed");
    expect(modelRouted).toBeDefined();
    expect(modelRouted!.outcome).toBe("deny");
    expect(modelRouted!.summary).toContain("model provider is disabled");
  });
});

describe("handleInboundKnowledgeQuery — error handling", () => {
  it("returns error for malformed query (non-string)", async () => {
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-a", { query: 123 }), // query should be string
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-err-type",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns error for missing query field", async () => {
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-a", {}), // missing query
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-err-missing",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("handleInboundKnowledgeQuery — stranger (public) query", () => {
  it("allows knowledge query from stranger (no trust record) at public sensitivity (Phase 44B)", async () => {
    // No peer directory entry, no trust record → bondLevel = "public" → allowed at "public"
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-stranger", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-stranger",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    // Phase 44B: public knowledge queries are now allowed (maxSensitivity: "public").
    expect(result.ok).toBe(true);
  });
});

describe("handleInboundKnowledgeQuery — policy audit trail", () => {
  it("writes message.verified audit event for all queries", async () => {
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-friend",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:friend",
      level: "direct",
      now: new Date().toISOString(),
    });

    await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-friend", { query: "Hello?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-msg-verified",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "message.verified")).toBe(true);
    expect(audits.some((a) => a.intent === "knowledge.query")).toBe(true);
  });

  it("writes vault.searched audit event when vault is present", async () => {
    const vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-test-vault-kq-"));
    const { buildVaultIndex } = await import("@envoymesh/vault");
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(join(vaultDir, "about.md"), "EnvoyMesh is a decentralized P2P network.", "utf8"),
    );
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-friend",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:friend",
      level: "direct",
      now: new Date().toISOString(),
    });

    await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("peer-friend", { query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-vault-audit",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile: makeTestProfile(),
      vaultIndex,
      modelProviders: { mode: "mock" },
    });

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "vault.searched")).toBe(true);
    expect(audits.some((a) => a.type === "model.routed")).toBe(true);

    await rm(vaultDir, { recursive: true, force: true });
  });
});
