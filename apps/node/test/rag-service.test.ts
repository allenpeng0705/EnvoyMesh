import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildVaultIndex } from "@envoymesh/vault";
import { createRagService } from "../src/rag-service.js";

let workspaceDir: string;
let vaultDir: string;
let profileDir: string;

beforeEach(async () => {
  workspaceDir = join(tmpdir(), `envoymesh-rag-service-${randomUUID()}`);
  vaultDir = join(workspaceDir, "shared");
  profileDir = join(workspaceDir, "profile");
  await mkdir(join(vaultDir, "knowledge"), { recursive: true });
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("createRagService", () => {
  it("retrieves semantically related chat history via vector search", async () => {
    const rag = await createRagService({
      profileDir,
      knowledgeBase: { ragMode: "vector", embedding: { mode: "mock" } },
    });

    await rag.indexChatMessage("envoy:owner:alice", {
      messageId: "old-plan",
      sender: "Alice",
      text: "Remember the EnvoyMesh relay deployment plan?",
      timestamp: "2025-01-01T00:00:00.000Z",
    });

    const filler = Array.from({ length: 22 }, (_, i) => ({
      messageId: `msg-${i}`,
      sender: "Alice",
      text: `filler ${i}`,
      timestamp: new Date(Date.now() - i * 60_000).toISOString(),
    }));

    const hits = await rag.searchChatHistoryRag({
      threadOwnerId: "envoy:owner:alice",
      query: "EnvoyMesh relay deployment",
      messages: filler,
      recentLimit: 20,
      ragLimit: 3,
    });

    expect(hits.some((m) => m.messageId === "old-plan")).toBe(true);
  });

  it("retrieves vault knowledge via vector search", async () => {
    await writeFile(
      join(vaultDir, "knowledge", "product.md"),
      "EnvoyMesh is a decentralized P2P mesh for autonomous AI agents.",
    );
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });
    const rag = await createRagService({
      profileDir,
      knowledgeBase: {
        enabled: true,
        ragMode: "vector",
        embedding: { mode: "mock" },
        publicVaultPaths: ["knowledge/"],
      },
    });
    await rag.reindexVault({ vaultIndex });

    const hits = await rag.searchVaultKnowledgeBase({
      vaultIndex,
      query: "decentralized autonomous agents",
      knowledgeAccess: "public",
      knowledgeScope: "public",
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.document.relativePath.startsWith("knowledge/")).toBe(true);
  });

  it("skips unchanged vault files on subsequent reindex", async () => {
    await writeFile(
      join(vaultDir, "knowledge", "product.md"),
      "EnvoyMesh is a decentralized P2P mesh for autonomous AI agents.",
    );
    const vaultIndex = await buildVaultIndex({ rootDir: vaultDir });
    const rag = await createRagService({
      profileDir,
      knowledgeBase: {
        enabled: true,
        ragMode: "vector",
        embedding: { mode: "mock" },
        publicVaultPaths: ["knowledge/"],
      },
    });

    await rag.reindexVault({ vaultIndex });
    expect(rag.getIndexStatus().progress.indexed).toBeGreaterThan(0);

    await rag.reindexVault({ vaultIndex });
    expect(rag.getIndexStatus().progress.skipped).toBeGreaterThan(0);
    expect(rag.getIndexStatus().progress.indexed).toBe(0);
  });

  it("probeEmbedding confirms mock provider without rebuilding", async () => {
    const rag = await createRagService({
      profileDir,
      knowledgeBase: { ragMode: "vector", embedding: { mode: "mock" } },
    });
    const result = await rag.probeEmbedding();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dimensions).toBeGreaterThan(0);
    expect(result.mode).toBe("mock");
    expect(result.modelKey.length).toBeGreaterThan(0);
    expect(rag.getIndexStatus().lastEmbedError).toBeUndefined();
  });
});
