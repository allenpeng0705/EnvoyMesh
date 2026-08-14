import { describe, expect, it } from "vitest";
import { buildAllLocalFilesList, vaultLibraryItemFromLocalFile } from "../src/local-files.js";

describe("local-files", () => {
  it("buildAllLocalFilesList merges vault and workspace sorted by path", () => {
    const result = buildAllLocalFilesList({
      vaultItems: [
        {
          documentId: "v1",
          relativePath: "vault/z.txt",
          title: "z.txt",
          extension: "txt",
          byteLength: 1,
          contentHash: "hash",
          updatedAt: "2026-01-01T00:00:00.000Z",
          published: false,
        },
      ],
      workspaceItems: [
        {
          relativePath: "IDENTITY.md",
          title: "IDENTITY.md",
          extension: "md",
          byteLength: 2,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      knowledgeSyncCaps: {
        linkedObsidianMaxFiles: 400,
        mcpRebuildMaxCards: 100,
      },
    });
    expect(result.vaultCount).toBe(1);
    expect(result.workspaceCount).toBe(1);
    expect(result.knowledgeSyncCaps?.linkedObsidianMaxFiles).toBe(400);
    expect(result.items.map((item) => `${item.source}:${item.relativePath}`)).toEqual([
      "workspace:IDENTITY.md",
      "vault:vault/z.txt",
    ]);
  });

  it("vaultLibraryItemFromLocalFile returns null for workspace rows", () => {
    expect(
      vaultLibraryItemFromLocalFile({
        source: "workspace",
        relativePath: "SOUL.md",
        title: "SOUL.md",
        extension: "md",
        byteLength: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBeNull();
  });
});
