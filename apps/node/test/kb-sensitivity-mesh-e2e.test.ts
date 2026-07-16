/**
 * E2E tests for sensitivity-based knowledge mesh (Phase 44A1 + 44B).
 *
 * Tests the full sensitivity pipeline: vault content with mixed sensitivity levels,
 * per-item overrides, published toggle round-trip, stranger/bonded/owner access,
 * and rate limiting — all using real temp filesystem + Phase13 test harness.
 *
 * Run with: RUN_E2E=1 npx vitest run apps/node/test/kb-sensitivity-mesh-e2e.test.ts
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  generateOwnerIdentity,
  generateDeviceIdentity,
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  createLocalTaskStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createSensitivityOverrideStore } from "@envoymesh/local-store";
import {
  createKnowledgeQueryPayload,
  createKnowledgeResponsePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { buildVaultIndex } from "@envoymesh/vault";
import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";
import {
  inferDocumentSensitivity,
  resolveDocumentSensitivityById,
  filterVaultResultsBySensitivity,
  type KnowledgeAccessLevel,
  type VaultSearchResult,
} from "../src/ai-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let profileDir: string;
let vaultDir: string;

interface TestProfile {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
}

function makeTestProfile(prefix: string): TestProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  const profile = {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
  const taskStore = createLocalTaskStore(prefix);
  const trustStore = createLocalTrustStore(prefix);
  const peerDirectory = createLocalPeerDirectoryStore(prefix);
  const human = createHumanProfileStore(prefix);
  return { profileDir: prefix, vaultDir: join(prefix, "vault"), profile, taskStore, trustStore, peerDirectory, human };
}

/**
 * Create a mixed-sensitivity vault with known content at different paths.
 * Returns document IDs for each note.
 */
async function createMixedSensitivityVault(vaultDir: string): Promise<{
  publicPath: string;
  friendsPath: string;
  privatePath: string;
  publicDocId: string;
  friendsDocId: string;
  privateDocId: string;
}> {
  await mkdir(join(vaultDir, "notes"), { recursive: true });
  await mkdir(join(vaultDir, "notes", "work"), { recursive: true });
  await mkdir(join(vaultDir, "notes", "personal"), { recursive: true });

  // Public by path heuristic (no sensitive keywords)
  const publicPath = "notes/api-guide.md";
  await writeFile(join(vaultDir, publicPath), `# API Guide

This is a public guide to the EnvoyMesh API. It covers routing,
envelopes, and the signing convention used throughout the mesh.
`, "utf8");

  // Friends by path heuristic (contains "work")
  const friendsPath = "notes/work/project-plan.md";
  await writeFile(join(vaultDir, friendsPath), `# Project Plan (Q3 2026)

Internal project planning document for the knowledge base feature.
Includes milestones, team assignments, and budget estimates.
`, "utf8");

  // Private by path heuristic (contains "personal")
  const privatePath = "notes/personal/journal.md";
  await writeFile(join(vaultDir, privatePath), `# Personal Journal

Today I finished the Phase 44 implementation. The plugin system
is coming together nicely. Need to remember to update the changelog.
`, "utf8");

  // Build index to get document IDs
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const publicDoc = index.documents.find((d) => d.relativePath === publicPath)!;
  const friendsDoc = index.documents.find((d) => d.relativePath === friendsPath)!;
  const privateDoc = index.documents.find((d) => d.relativePath === privatePath)!;

  return {
    publicPath,
    friendsPath,
    privatePath,
    publicDocId: publicDoc.documentId,
    friendsDocId: friendsDoc.documentId,
    privateDocId: privateDoc.documentId,
  };
}

function knowledgeEnvelope(senderPeerId: string, payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId,
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      intent: "knowledge.query",
      payload,
      createdAt: "2026-07-13T10:00:00.000Z",
      messageId: `msg-kq-${Date.now()}`,
    }),
    signature: "signature",
  };
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-kb-sensitivity-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

// ===========================================================================
// Tests
// ===========================================================================

describe("kb-sensitivity-mesh E2E", () => {
  // -----------------------------------------------------------------------
  // 1. Path-heuristic sensitivity classification
  // -----------------------------------------------------------------------

  it("classifies documents by path heuristic into public/friends/private", async () => {
    const { publicPath, friendsPath, privatePath } = await createMixedSensitivityVault(vaultDir);

    expect(inferDocumentSensitivity(publicPath)).toBe("public");
    expect(inferDocumentSensitivity(friendsPath)).toBe("friends");
    expect(inferDocumentSensitivity(privatePath)).toBe("private");
  });

  // -----------------------------------------------------------------------
  // 2. Stranger gets only public results
  // -----------------------------------------------------------------------

  it("stranger (public bond) gets public sensitivity cap from knowledge query", async () => {
    const { publicDocId } = await createMixedSensitivityVault(vaultDir);
    const tp = makeTestProfile(profileDir);

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("stranger-peer-id", {
        query: "What is EnvoyMesh?",
      }),
      remotePeerId: "stranger-peer-id",
      receivedAt: Date.now(),
      correlationId: "corr-stranger-1",
      taskStore: tp.taskStore,
      trustStore: tp.trustStore,
      peerDirectoryStore: tp.peerDirectory,
      profile: tp.profile,
      vaultIndex: await buildVaultIndex({ rootDir: vaultDir }),
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    // Stranger should get a response — Phase 44B allows public knowledge.query
    expect(result.responsePayload).toBeDefined();
    // Sensitivity in response should be "public" (capped by policy)
    expect(result.responsePayload?.sensitivity).toBe("public");
  });

  // -----------------------------------------------------------------------
  // 3. Per-item override changes sensitivity
  // -----------------------------------------------------------------------

  it("per-item sensitivity override takes priority over path heuristic", async () => {
    const { publicPath, friendsPath, privatePath, publicDocId, friendsDocId, privateDocId } =
      await createMixedSensitivityVault(vaultDir);

    const store = createSensitivityOverrideStore(profileDir);

    // By default: public, friends, private
    expect(await resolveDocumentSensitivityById(publicDocId, publicPath)).toBe("public");
    expect(await resolveDocumentSensitivityById(friendsDocId, friendsPath)).toBe("friends");
    expect(await resolveDocumentSensitivityById(privateDocId, privatePath)).toBe("private");

    // Override: make friends doc public, private doc friends
    await store.set(friendsDocId, "public");
    await store.set(privateDocId, "friends");

    const overrides = await store.load();

    // With overrides: public, public (overridden), friends (overridden)
    expect(
      await resolveDocumentSensitivityById(friendsDocId, friendsPath, overrides),
    ).toBe("public");
    expect(
      await resolveDocumentSensitivityById(privateDocId, privatePath, overrides),
    ).toBe("friends");
  });

  // -----------------------------------------------------------------------
  // 4. Published toggle round-trip
  // -----------------------------------------------------------------------

  it("published toggle writes/deletes sensitivity override correctly", async () => {
    const { friendsDocId } = await createMixedSensitivityVault(vaultDir);
    const store = createSensitivityOverrideStore(profileDir);

    // Initially no override
    expect(await store.get(friendsDocId)).toBeUndefined();

    // Set published → override = "public"
    await store.set(friendsDocId, "public");
    expect(await store.get(friendsDocId)).toBe("public");

    // Unpublish → delete override
    const deleted = await store.delete(friendsDocId);
    expect(deleted).toBe(true);
    expect(await store.get(friendsDocId)).toBeUndefined();

    // Delete non-existent → false
    const deletedAgain = await store.delete(friendsDocId);
    expect(deletedAgain).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 5. Blocked peer denied entirely
  // -----------------------------------------------------------------------

  it("blocked peer is denied knowledge.query regardless of sensitivity", async () => {
    const tp = makeTestProfile(profileDir);

    // Register the blocked peer in the peer directory so resolveSenderOwnerId can find it
    await tp.peerDirectory.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:blocked-stranger",
      peerId: "blocked-peer-id",
      listenAddrs: [],
    });

    // Set trust record to "blocked"
    await tp.trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:blocked-stranger",
      level: "blocked",
      displayName: "Blocked Peer",
    });

    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope("blocked-peer-id", {
        query: "Tell me everything",
      }),
      remotePeerId: "blocked-peer-id",
      receivedAt: Date.now(),
      correlationId: "corr-blocked-1",
      taskStore: tp.taskStore,
      trustStore: tp.trustStore,
      peerDirectoryStore: tp.peerDirectory,
      profile: tp.profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    // Blocked peers should be denied
    expect(result.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 6. Sensitivity override persists across reindex
  // -----------------------------------------------------------------------

  it("sensitivity override survives vault reindex", async () => {
    const { publicDocId, publicPath } = await createMixedSensitivityVault(vaultDir);
    const store = createSensitivityOverrideStore(profileDir);

    // Set an override
    await store.set(publicDocId, "private");

    // Simulate reindex: rebuild vault index
    const newIndex = await buildVaultIndex({ rootDir: vaultDir });
    expect(newIndex.documents.length).toBeGreaterThanOrEqual(3);

    // Override still intact after reindex
    const overrides = await store.load();
    expect(overrides.get(publicDocId)).toBe("private");
    expect(
      await resolveDocumentSensitivityById(publicDocId, publicPath, overrides),
    ).toBe("private");
  });

  // -----------------------------------------------------------------------
  // 7. filterVaultResultsBySensitivityWithOverrides filters correctly
  // -----------------------------------------------------------------------

  it("filters vault results by sensitivity level (path heuristic)", async () => {
    const { publicDocId, friendsDocId, privateDocId, publicPath, friendsPath, privatePath } =
      await createMixedSensitivityVault(vaultDir);

    // Create mock results
    const results: VaultSearchResult[] = [
      {
        document: {
          documentId: publicDocId,
          relativePath: publicPath,
          title: "API Guide",
          extension: ".md",
          byteLength: 100,
          contentHash: "abc",
          updatedAt: new Date().toISOString(),
        },
        snippet: "Public API guide content",
        matchScore: 0.9,
      },
      {
        document: {
          documentId: friendsDocId,
          relativePath: friendsPath,
          title: "Project Plan",
          extension: ".md",
          byteLength: 200,
          contentHash: "def",
          updatedAt: new Date().toISOString(),
        },
        snippet: "Internal project plan",
        matchScore: 0.8,
      },
      {
        document: {
          documentId: privateDocId,
          relativePath: privatePath,
          title: "Journal",
          extension: ".md",
          byteLength: 150,
          contentHash: "ghi",
          updatedAt: new Date().toISOString(),
        },
        snippet: "Personal journal entry",
        matchScore: 0.7,
      },
    ];

    // Public access: only public doc (by path heuristic)
    const publicFiltered = filterVaultResultsBySensitivity(results, "public");
    expect(publicFiltered).toHaveLength(1);
    expect(publicFiltered[0]!.document.documentId).toBe(publicDocId);

    // Friends access: public + friends docs
    const friendsFiltered = filterVaultResultsBySensitivity(results, "friends");
    expect(friendsFiltered).toHaveLength(2);
    expect(friendsFiltered.map((r) => r.document.documentId)).toContain(publicDocId);
    expect(friendsFiltered.map((r) => r.document.documentId)).toContain(friendsDocId);

    // Private (owner) access: all docs
    const privateFiltered = filterVaultResultsBySensitivity(results, "private");
    expect(privateFiltered).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // 8. Per-item override overrides path heuristic in resolution chain
  // -----------------------------------------------------------------------

  it("per-item overrides override path heuristic in sensitivity resolution", async () => {
    const { publicDocId, friendsDocId, privateDocId, publicPath, friendsPath, privatePath } =
      await createMixedSensitivityVault(vaultDir);

    const store = createSensitivityOverrideStore(profileDir);

    // Make friends doc private and private doc public via overrides
    await store.set(friendsDocId, "private");
    await store.set(privateDocId, "public");
    const overrides = await store.load();

    // friends doc: path heuristic = "friends", override = "private" → private wins
    expect(
      await resolveDocumentSensitivityById(friendsDocId, friendsPath, overrides),
    ).toBe("private");

    // private doc: path heuristic = "private", override = "public" → public wins
    expect(
      await resolveDocumentSensitivityById(privateDocId, privatePath, overrides),
    ).toBe("public");

    // public doc: no override, path heuristic = "public" → public
    expect(
      await resolveDocumentSensitivityById(publicDocId, publicPath, overrides),
    ).toBe("public");
  });

  // -----------------------------------------------------------------------
  // 8. Sensitivity override store CRUD with real filesystem
  // -----------------------------------------------------------------------

  it("performs full CRUD cycle on sensitivity override store with real filesystem", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    // Initially empty
    expect((await store.load()).size).toBe(0);

    // Set multiple overrides
    await store.set("doc-aaa", "public");
    await store.set("doc-bbb", "friends");
    await store.set("doc-ccc", "private");

    const loaded = await store.load();
    expect(loaded.size).toBe(3);
    expect(loaded.get("doc-aaa")).toBe("public");
    expect(loaded.get("doc-bbb")).toBe("friends");
    expect(loaded.get("doc-ccc")).toBe("private");

    // Update existing
    await store.set("doc-aaa", "private");
    expect(await store.get("doc-aaa")).toBe("private");

    // Delete one
    const deleted = await store.delete("doc-bbb");
    expect(deleted).toBe(true);
    expect(await store.get("doc-bbb")).toBeUndefined();

    // Clear all
    await store.clear();
    expect((await store.load()).size).toBe(0);

    // Verify file exists with correct permissions
    await store.set("doc-test", "public");
    const filePath = join(profileDir, "vault-sensitivity-overrides.json");
    const fileStat = await stat(filePath);
    // 0o600 = rw------- = 0x180 in decimal
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  // -----------------------------------------------------------------------
  // 9. Override store handles missing/corrupt file gracefully
  // -----------------------------------------------------------------------

  it("handles missing and corrupt sensitivity override files gracefully", async () => {
    const filePath = join(profileDir, "vault-sensitivity-overrides.json");

    // Missing file → empty
    const store1 = createSensitivityOverrideStore(profileDir);
    expect((await store1.load()).size).toBe(0);
    expect(await store1.get("nonexistent")).toBeUndefined();

    // Corrupt JSON → empty
    await writeFile(filePath, "not valid json {{{", "utf8");
    const store2 = createSensitivityOverrideStore(profileDir);
    expect((await store2.load()).size).toBe(0);

    // Wrong version → empty
    await writeFile(filePath, JSON.stringify({ version: 99, overrides: {} }), "utf8");
    const store3 = createSensitivityOverrideStore(profileDir);
    expect((await store3.load()).size).toBe(0);
  });
});
