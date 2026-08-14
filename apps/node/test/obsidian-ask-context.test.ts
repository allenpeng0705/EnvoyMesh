import { describe, expect, it } from "vitest";
import {
  boostResultsByTagOverlap,
  buildTitleToVaultPathMap,
  formatWikiLinkNeighborSection,
  type AskContextHit,
} from "../src/obsidian-ask-context.js";

describe("obsidian-ask-context", () => {
  it("buildTitleToVaultPathMap prefers imports/obsidian paths", () => {
    const map = buildTitleToVaultPathMap([
      {
        documentId: "a",
        relativePath: "notes/plain.md",
        title: "plain",
        extension: ".md",
        byteLength: 1,
        contentHash: "h1",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        documentId: "b",
        relativePath: "notes/imports/obsidian/v/plain.md",
        title: "plain",
        extension: ".md",
        byteLength: 1,
        contentHash: "h2",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(map.get("plain")).toBe("notes/imports/obsidian/v/plain.md");
  });

  it("boostResultsByTagOverlap lifts matching tags", () => {
    const hits: AskContextHit[] = [
      {
        documentId: "1",
        path: "notes/a.md",
        title: "a",
        score: 0.2,
        snippet: "x",
        sensitivity: "private",
      },
      {
        documentId: "2",
        path: "notes/b.md",
        title: "b",
        score: 0.21,
        snippet: "y",
        sensitivity: "private",
      },
    ];
    const tags = new Map<string, string[]>([["notes/a.md", ["deployment", "ops"]]]);
    const boosted = boostResultsByTagOverlap(hits, "deployment checklist", tags);
    expect(boosted[0]!.path).toBe("notes/a.md");
    expect(boosted[0]!.score).toBeGreaterThan(0.2);
  });

  it("formatWikiLinkNeighborSection labels neighbors", () => {
    const section = formatWikiLinkNeighborSection([
      {
        documentId: "n",
        path: "notes/imports/obsidian/v/Neighbor.md",
        title: "Neighbor",
        score: 0.1,
        snippet: "Hello neighbor",
        sensitivity: "private",
      },
    ]);
    expect(section).toContain("wiki-link neighbor");
    expect(section).toContain("Neighbor.md");
  });
});
