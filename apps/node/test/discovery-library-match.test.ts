import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildVaultIndex } from "@envoymesh/vault";
import { matchPublishedLibraryDocuments } from "../src/discovery-library-match.js";

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
