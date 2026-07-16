/**
 * Tests for normalized sensitivity levels (Phase 44A1).
 *
 * Validates:
 * - inferDocumentSensitivity returns 3-tier levels (public, friends, private)
 * - resolveDocumentSensitivityById uses overrides when available
 * - filterVaultResultsBySensitivity works with the 3-tier system
 * - Legacy names (professional, personal) are handled in normalizeLegacySensitivity
 */

import { describe, expect, it } from "vitest";
import {
  inferDocumentSensitivity,
  resolveDocumentSensitivityById,
  filterVaultResultsBySensitivity,
  type KnowledgeAccessLevel,
  type VaultSearchResult,
} from "../src/ai-context.js";

// ---------------------------------------------------------------------------
// inferDocumentSensitivity
// ---------------------------------------------------------------------------

describe("inferDocumentSensitivity (3-tier)", () => {
  it("returns 'private' for paths containing 'personal' or 'private'", () => {
    expect(inferDocumentSensitivity("notes/personal/journal.md")).toBe("private");
    expect(inferDocumentSensitivity("private/research.md")).toBe("private");
    expect(inferDocumentSensitivity("knowledge/private/notes.md")).toBe("private");
  });

  it("returns 'friends' for paths containing 'work', 'professional', 'office', 'friends', 'shared'", () => {
    expect(inferDocumentSensitivity("notes/work/project.md")).toBe("friends");
    expect(inferDocumentSensitivity("professional/report.md")).toBe("friends");
    expect(inferDocumentSensitivity("office/meeting-notes.md")).toBe("friends");
    expect(inferDocumentSensitivity("shared/bookmarks.md")).toBe("friends");
    expect(inferDocumentSensitivity("friends/list.md")).toBe("friends");
  });

  it("returns 'public' for all other paths", () => {
    expect(inferDocumentSensitivity("notes/research/llm-benchmarks.md")).toBe("public");
    expect(inferDocumentSensitivity("tutorials/setup.md")).toBe("public");
    expect(inferDocumentSensitivity("random-folder/file.md")).toBe("public");
    expect(inferDocumentSensitivity("README.md")).toBe("public");
  });

  it("is case-insensitive", () => {
    expect(inferDocumentSensitivity("Personal/Notes.md")).toBe("private");
    expect(inferDocumentSensitivity("WORK/tasks.md")).toBe("friends");
    expect(inferDocumentSensitivity("Knowledge/Public/api.md")).toBe("public");
  });
});

// ---------------------------------------------------------------------------
// resolveDocumentSensitivityById
// ---------------------------------------------------------------------------

describe("resolveDocumentSensitivityById", () => {
  const overrides = new Map<string, KnowledgeAccessLevel>([
    ["doc_override_public", "public"],
    ["doc_override_friends", "friends"],
    ["doc_override_private", "private"],
  ]);

  it("returns override when documentId is in overrides map", () => {
    expect(
      resolveDocumentSensitivityById("doc_override_public", "private/secret.md", overrides),
    ).toBe("public");
    expect(
      resolveDocumentSensitivityById("doc_override_private", "public/open.md", overrides),
    ).toBe("private");
    expect(
      resolveDocumentSensitivityById("doc_override_friends", "random/file.md", overrides),
    ).toBe("friends");
  });

  it("falls back to path heuristic when no override exists", () => {
    expect(
      resolveDocumentSensitivityById("doc_unknown", "private/notes.md", overrides),
    ).toBe("private");
    expect(
      resolveDocumentSensitivityById("doc_unknown", "public/article.md", overrides),
    ).toBe("public");
    expect(
      resolveDocumentSensitivityById("doc_unknown", "work/project.md", overrides),
    ).toBe("friends");
  });

  it("falls back to path heuristic when overrides map is undefined", () => {
    expect(
      resolveDocumentSensitivityById("doc_any", "private/notes.md", undefined),
    ).toBe("private");
    expect(
      resolveDocumentSensitivityById("doc_any", "random/file.md", undefined),
    ).toBe("public");
  });

  it("override takes priority over path heuristic", () => {
    // Path says "private" but override says "public"
    expect(
      resolveDocumentSensitivityById("doc_override_public", "private/top-secret.md", overrides),
    ).toBe("public");

    // Path says "public" but override says "private"
    expect(
      resolveDocumentSensitivityById("doc_override_private", "public/open-data.md", overrides),
    ).toBe("private");
  });
});

// ---------------------------------------------------------------------------
// filterVaultResultsBySensitivity (3-tier)
// ---------------------------------------------------------------------------

describe("filterVaultResultsBySensitivity (3-tier)", () => {
  function makeResult(relativePath: string): VaultSearchResult {
    return {
      chunk: {
        chunkId: "chunk:0",
        documentId: "doc_test",
        relativePath,
        index: 0,
        text: "content",
      },
      document: {
        documentId: "doc_test",
        relativePath,
        extension: ".md",
        title: "Test",
        byteLength: 100,
        contentHash: "hash",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      score: 1,
      matches: ["test"],
    };
  }

  it("public access returns only public documents", () => {
    const results = [
      makeResult("public/article.md"),     // public
      makeResult("work/report.md"),        // friends
      makeResult("private/diary.md"),      // private
    ];
    const filtered = filterVaultResultsBySensitivity(results, "public");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].document.relativePath).toBe("public/article.md");
  });

  it("friends access returns public + friends documents", () => {
    const results = [
      makeResult("public/article.md"),     // public
      makeResult("work/report.md"),        // friends
      makeResult("private/diary.md"),      // private
    ];
    const filtered = filterVaultResultsBySensitivity(results, "friends");
    expect(filtered).toHaveLength(2);
    const paths = filtered.map((r) => r.document.relativePath);
    expect(paths).toContain("public/article.md");
    expect(paths).toContain("work/report.md");
  });

  it("private access returns all documents", () => {
    const results = [
      makeResult("public/article.md"),     // public
      makeResult("work/report.md"),        // friends
      makeResult("private/diary.md"),      // private
    ];
    const filtered = filterVaultResultsBySensitivity(results, "private");
    expect(filtered).toHaveLength(3);
  });

  it("normalizes legacy maxSensitivity values", () => {
    const results = [
      makeResult("public/article.md"),     // public
      makeResult("work/report.md"),        // friends
      makeResult("private/diary.md"),      // private
    ];

    // Legacy "professional" should map to "friends"
    const filtered = filterVaultResultsBySensitivity(results, "private", "professional");
    expect(filtered).toHaveLength(2);
    const paths = filtered.map((r) => r.document.relativePath);
    expect(paths).toContain("public/article.md");
    expect(paths).toContain("work/report.md");

    // Legacy "personal" should map to "private"
    // But knowledgeAccess is "public" so ceiling is still public (min of both)
    const filteredAll = filterVaultResultsBySensitivity(results, "public", "personal");
    expect(filteredAll).toHaveLength(1);
    expect(filteredAll[0].document.relativePath).toBe("public/article.md");

    // With "private" access + "personal" max → should return all 3
    const filteredPrivateAll = filterVaultResultsBySensitivity(results, "private", "personal");
    expect(filteredPrivateAll).toHaveLength(3);
  });

  it("respects the stricter of access level and maxSensitivity", () => {
    const results = [
      makeResult("public/article.md"),     // public
      makeResult("work/report.md"),        // friends
      makeResult("private/diary.md"),      // private
    ];

    // Access: friends, maxSensitivity: public → should return only public
    const filtered = filterVaultResultsBySensitivity(results, "friends", "public");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].document.relativePath).toBe("public/article.md");
  });
});
