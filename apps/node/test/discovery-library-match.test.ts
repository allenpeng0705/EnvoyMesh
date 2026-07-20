import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVaultIndex } from "@envoymesh/vault";
import { matchPublishedLibraryDocuments, matchWebContentEntries } from "../src/discovery-library-match.js";
import type { WebContentEntry } from "../src/web-content-store.js";

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-lib-match-"));
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(vaultDir, { recursive: true, force: true });
});

describe("matchPublishedLibraryDocuments", () => {
  it("includes cid when export contentHash matches current vault bytes", async () => {
    await writeFile(join(vaultDir, "paper.md"), "# Paper\n");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;

    const matches = await matchPublishedLibraryDocuments({
      vaultDir,
      publishedIds: new Set([doc.documentId]),
      maxResults: 5,
      externalExports: new Map([
        [
          doc.documentId,
          {
            exportRevision: 1,
            exportedAt: new Date().toISOString(),
            cid: "bafybeigdyrzt5sfp7ud17ehd8yfg4dpfyfm5dqn7q",
            ipfsInteropRecipe: "kubo-ipfs-export-v1",
            kuboVersion: "0.24.0",
            contentHash: doc.contentHash,
          },
        ],
      ]),
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.cid).toBe("bafybeigdyrzt5sfp7ud17ehd8yfg4dpfyfm5dqn7q");
  });

  it("omits cid when export contentHash is stale", async () => {
    await writeFile(join(vaultDir, "paper.md"), "# Paper\n");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;

    const matches = await matchPublishedLibraryDocuments({
      vaultDir,
      publishedIds: new Set([doc.documentId]),
      maxResults: 5,
      externalExports: new Map([
        [
          doc.documentId,
          {
            exportRevision: 1,
            exportedAt: new Date().toISOString(),
            cid: "bafystalecid",
            ipfsInteropRecipe: "kubo-ipfs-export-v1",
            kuboVersion: "0.24.0",
            contentHash: "stale-hash",
          },
        ],
      ]),
    });

    expect(matches[0]?.cid).toBeUndefined();
  });
});

describe("matchWebContentEntries", () => {
  const entries: WebContentEntry[] = [
    {
      path: "hello.md",
      contentHash: "abc123",
      byteLength: 10,
      title: "Hello World",
      kind: "article",
      mimeType: "text/markdown",
      visibility: "public",
      updatedAt: "2026-07-20T00:00:00.000Z",
      urlSlug: "hello",
      tags: ["intro"],
    },
    {
      path: "friends-only.md",
      contentHash: "def456",
      byteLength: 20,
      title: "Friends Only",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "bonded",
      updatedAt: "2026-07-20T00:00:00.000Z",
    },
    {
      path: "secret.md",
      contentHash: "ghi789",
      byteLength: 5,
      title: "Secret",
      kind: "note",
      mimeType: "text/markdown",
      visibility: "contacts",
      contactIds: ["envoy:owner:alice"],
      updatedAt: "2026-07-20T00:00:00.000Z",
    },
  ];

  it("returns only public entries for strangers", () => {
    const matches = matchWebContentEntries({
      entries,
      maxResults: 10,
      allowedVisibility: ["public"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.relativePath).toBe("hello.md");
    expect(matches[0]?.visibility).toBe("public");
    expect(matches[0]?.kind).toBe("article");
  });

  it("matches title, urlSlug, kind, and tags", () => {
    const bySlug = matchWebContentEntries({
      entries,
      fileTitleQuery: "hello",
      maxResults: 10,
      allowedVisibility: ["public", "bonded"],
    });
    expect(bySlug.map((m) => m.relativePath)).toEqual(["hello.md"]);

    const byKind = matchWebContentEntries({
      entries,
      fileTitleQuery: "note",
      maxResults: 10,
      allowedVisibility: ["public", "bonded"],
    });
    expect(byKind.map((m) => m.relativePath)).toEqual(["friends-only.md"]);

    const byTag = matchWebContentEntries({
      entries,
      fileTitleQuery: "intro",
      maxResults: 10,
      allowedVisibility: ["public"],
    });
    expect(byTag).toHaveLength(1);
  });

  it("filters contacts-visibility by requesterOwnerId ACL", () => {
    const allowed = matchWebContentEntries({
      entries,
      maxResults: 10,
      allowedVisibility: ["public", "bonded", "contacts"],
      requesterOwnerId: "envoy:owner:alice",
    });
    expect(allowed.map((m) => m.relativePath).sort()).toEqual([
      "friends-only.md",
      "hello.md",
      "secret.md",
    ]);

    const denied = matchWebContentEntries({
      entries,
      maxResults: 10,
      allowedVisibility: ["public", "bonded", "contacts"],
      requesterOwnerId: "envoy:owner:bob",
    });
    expect(denied.map((m) => m.relativePath).sort()).toEqual([
      "friends-only.md",
      "hello.md",
    ]);
  });
});
