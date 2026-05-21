import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertPathInsideVault,
  buildVaultIndex,
  chunkDocument,
  createDeniedVaultAccessAuditEvent,
  DEFAULT_SHARED_VAULT_DIR,
  isSupportedVaultFile,
  listSupportedVaultFiles,
  searchVault,
  searchVaultWithAudit,
  shouldIncludeVaultFileInIndex,
  type VaultDocumentMetadata,
} from "../src/index.js";

let workspaceDir: string;
let vaultDir: string;

beforeEach(async () => {
  workspaceDir = join(tmpdir(), `envoymesh-vault-${randomUUID()}`);
  vaultDir = join(workspaceDir, DEFAULT_SHARED_VAULT_DIR);
  await mkdir(join(vaultDir, "notes"), { recursive: true });
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("vault", () => {
  it("marks only .txt / .md / .json as vault text-chunk formats (legacy isSupportedVaultFile helper)", () => {
    expect(isSupportedVaultFile("note.md")).toBe(true);
    expect(isSupportedVaultFile("data.json")).toBe(true);
    expect(isSupportedVaultFile("plain.txt")).toBe(true);
    expect(isSupportedVaultFile("secret.pdf")).toBe(false);
  });

  it("scopes index listing to dotfile hiding (basename starting with dot)", async () => {
    await mkdir(vaultDir, { recursive: true });
    await writeFile(join(vaultDir, "visible.txt"), "ok");
    expect(shouldIncludeVaultFileInIndex(join(vaultDir, "visible.txt"))).toBe(true);
    expect(shouldIncludeVaultFileInIndex(join(vaultDir, ".hidden"))).toBe(false);
  });

  it("lists no files when vault directory does not exist yet", async () => {
    const missing = join(workspaceDir, "nonexistent-vault");
    expect(await listSupportedVaultFiles(missing)).toEqual([]);
    const index = await buildVaultIndex({ rootDir: missing });
    expect(index.documents).toEqual([]);
    expect(index.chunks).toEqual([]);
  });

  it("lists vault files recursively including binary types", async () => {
    await writeFile(join(vaultDir, "notes", "distributed.md"), "Distributed systems notes");
    await writeFile(join(vaultDir, "profile.json"), "{\"name\":\"Alice\"}");
    await writeFile(join(vaultDir, "secret.pdf"), "fake pdf-like bytes");

    const files = await listSupportedVaultFiles(vaultDir);

    expect(files.map((file) => file.replace(`${resolve(vaultDir)}/`, ""))).toEqual([
      "notes/distributed.md",
      "profile.json",
      "secret.pdf",
    ]);
  });

  it("excludes dotfiles from vault index listings", async () => {
    await writeFile(join(vaultDir, "visible.bin"), Buffer.from([0, 1, 2]));
    await writeFile(join(vaultDir, ".secrets"), "noise");
    const files = await listSupportedVaultFiles(vaultDir);
    expect(files.map((file) => file.replace(`${resolve(vaultDir)}/`, ""))).toEqual(["visible.bin"]);
  });

  it("enforces vault root path restrictions", () => {
    expect(() => assertPathInsideVault(vaultDir, join(vaultDir, "notes", "allowed.md"))).not.toThrow();
    expect(() => assertPathInsideVault(vaultDir, join(workspaceDir, "outside.md"))).toThrow(
      "Path is outside the shared vault root",
    );
  });

  it("builds document metadata and chunks text files", async () => {
    await writeFile(
      join(vaultDir, "notes", "distributed.md"),
      "Distributed systems need consensus. Consensus needs careful protocols.",
    );

    const index = await buildVaultIndex({ rootDir: vaultDir, maxChunkChars: 32 });

    expect(index.documents).toHaveLength(1);
    expect(index.documents[0]).toMatchObject({
      relativePath: "notes/distributed.md",
      extension: ".md",
      title: "distributed",
    });
    expect(index.documents[0].contentHash).toBeTruthy();
    expect(index.chunks.length).toBeGreaterThan(1);
    expect(index.chunks[0].relativePath).toBe("notes/distributed.md");
  });

  it("indexes binary files without search chunks but with stable identities", async () => {
    const raw = Buffer.from([0xa0, 0xb0, 0xc0]);
    await writeFile(join(vaultDir, "asset.bin"), raw);

    const index = await buildVaultIndex({ rootDir: vaultDir });
    expect(index.documents).toHaveLength(1);
    expect(index.documents[0]).toMatchObject({
      relativePath: "asset.bin",
      extension: ".bin",
      byteLength: 3,
      title: "asset",
    });
    expect(index.chunks.filter((c) => c.relativePath === "asset.bin")).toHaveLength(0);
    expect(typeof index.documents[0].contentHash).toBe("string");
    expect(typeof index.documents[0].documentId).toBe("string");
  });

  it("searches chunks and returns document metadata", async () => {
    await writeFile(join(vaultDir, "books.md"), "Designing Data-Intensive Applications is a strong systems book.");
    await writeFile(join(vaultDir, "cooking.txt"), "Bread needs flour and time.");

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const results = searchVault(index, "systems book", { limit: 1 });

    expect(results).toHaveLength(1);
    expect(results[0].document.relativePath).toBe("books.md");
    expect(results[0].matches).toEqual(["systems", "book"]);
    expect(results[0].score).toBe(2);
  });

  it("searches with audit metadata and never records raw chunk text", async () => {
    await writeFile(join(vaultDir, "books.md"), "Designing Data-Intensive Applications is a strong systems book.");

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const { results, auditEvent } = searchVaultWithAudit(index, "systems book", {
      requesterOwnerId: "envoy:owner:bob",
      requesterPeerId: "peer-b",
      eventId: "vault-audit-1",
      createdAt: "2026-04-27T10:00:00.000Z",
    });

    expect(results).toHaveLength(1);
    expect(auditEvent).toEqual({
      version: "0.1",
      eventId: "vault-audit-1",
      operation: "search",
      outcome: "allow",
      createdAt: "2026-04-27T10:00:00.000Z",
      query: "systems book",
      requesterPeerId: "peer-b",
      requesterOwnerId: "envoy:owner:bob",
      reason: undefined,
      resultCount: 1,
      documentIds: [results[0].document.documentId],
      relativePaths: ["books.md"],
    });
    expect(JSON.stringify(auditEvent)).not.toContain("Designing Data-Intensive");
  });

  it("creates denied vault access audit events", () => {
    const auditEvent = createDeniedVaultAccessAuditEvent({
      operation: "search",
      query: "private note",
      requesterOwnerId: "envoy:owner:unknown",
      reason: "peer is not trusted for vault access",
      eventId: "vault-audit-denied-1",
      createdAt: "2026-04-27T10:01:00.000Z",
    });

    expect(auditEvent).toEqual({
      version: "0.1",
      eventId: "vault-audit-denied-1",
      operation: "search",
      outcome: "deny",
      createdAt: "2026-04-27T10:01:00.000Z",
      query: "private note",
      requesterPeerId: undefined,
      requesterOwnerId: "envoy:owner:unknown",
      reason: "peer is not trusted for vault access",
      resultCount: 0,
      documentIds: [],
      relativePaths: [],
    });
  });

  it("chunks empty documents into no chunks", () => {
    const metadata: VaultDocumentMetadata = {
      documentId: "doc-empty",
      relativePath: "empty.txt",
      extension: ".txt",
      title: "empty",
      byteLength: 0,
      contentHash: "hash",
      updatedAt: "2026-04-27T10:00:00.000Z",
    };

    expect(chunkDocument(metadata, "   ")).toEqual([]);
  });
});
