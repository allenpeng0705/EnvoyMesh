import { describe, expect, it } from "vitest";
import {
  collectMarkdownDestinationPath,
  isMarkdownCollectCandidate,
  isUnderNotesImportsObsidian,
  notesImportsBlogPathForWebPost,
  notesImportsObsidianPathForLinked,
  notesImportsPathForSource,
  resolveImportDestinationPath,
  uniqueRelativePath,
  wrapMaterializedMarkdown,
} from "../src/markdown-corpus.js";

describe("resolveImportDestinationPath", () => {
  it("rewrites legacy imports/ to documents/ for office files", () => {
    expect(resolveImportDestinationPath("imports/report.docx")).toBe("documents/report.docx");
  });

  it("places markdown under notes/imports/", () => {
    expect(resolveImportDestinationPath("imports/note.md")).toBe("notes/imports/note.md");
    expect(resolveImportDestinationPath("loose.md")).toBe("notes/imports/loose.md");
  });

  it("keeps paths already under notes/", () => {
    expect(resolveImportDestinationPath("notes/projects/a.md")).toBe("notes/projects/a.md");
  });

  it("preserves chat attachment paths (voice notes / file send)", () => {
    expect(resolveImportDestinationPath("chat/out/att-1/voice-note.webm")).toBe(
      "chat/out/att-1/voice-note.webm",
    );
    expect(resolveImportDestinationPath("chat/out/att-1/photo.jpg")).toBe(
      "chat/out/att-1/photo.jpg",
    );
  });

  it("preserves profile media paths", () => {
    expect(resolveImportDestinationPath("profile/gallery/p1.jpg")).toBe("profile/gallery/p1.jpg");
  });

  it("still nests unknown folders under documents/", () => {
    expect(resolveImportDestinationPath("scratch/a.bin")).toBe("documents/scratch/a.bin");
  });
});

describe("notesImportsBlogPathForWebPost", () => {
  it("maps blog/posts slug under notes/imports/blog/", () => {
    expect(notesImportsBlogPathForWebPost("blog/posts/hello.md")).toBe(
      "notes/imports/blog/hello.md",
    );
  });
});

describe("notesImportsObsidianPathForLinked", () => {
  it("maps linked browse path under notes/imports/obsidian/", () => {
    expect(notesImportsObsidianPathForLinked("linked-obsidian/MyVault/a/b.md")).toBe(
      "notes/imports/obsidian/MyVault/a/b.md",
    );
    expect(isUnderNotesImportsObsidian("notes/imports/obsidian/MyVault/a/b.md")).toBe(true);
  });
});

describe("notesImportsPathForSource", () => {
  it("maps document stem to notes/imports/*.md", () => {
    expect(notesImportsPathForSource("documents/report.docx")).toBe("notes/imports/report.md");
  });
});

describe("collectMarkdownDestinationPath", () => {
  it("moves loose md under notes/", () => {
    expect(collectMarkdownDestinationPath("research/foo.md")).toBe("notes/research/foo.md");
    expect(collectMarkdownDestinationPath("foo.md")).toBe("notes/foo.md");
  });

  it("moves documents/*.md into notes/imports/", () => {
    expect(collectMarkdownDestinationPath("documents/x.md")).toBe("notes/imports/x.md");
  });

  it("rejects notes/ and blog/", () => {
    expect(isMarkdownCollectCandidate("notes/a.md")).toBe(false);
    expect(isMarkdownCollectCandidate("blog/index.md")).toBe(false);
    expect(() => collectMarkdownDestinationPath("notes/a.md")).toThrow();
  });
});

describe("uniqueRelativePath", () => {
  it("allocates -2 suffix when taken", () => {
    const existing = new Set(["notes/imports/a.md"]);
    expect(uniqueRelativePath(existing, "notes/imports/a.md")).toBe("notes/imports/a-2.md");
  });
});

describe("wrapMaterializedMarkdown", () => {
  it("prepends source frontmatter with private sensitivity by default", () => {
    const out = wrapMaterializedMarkdown("# Hello\n", {
      source: "documents/report.docx",
      title: "report",
      importedAt: "2026-08-13T00:00:00.000Z",
      extractor: "anydoc-v1+legacy-fallback",
    });
    expect(out).toContain("source: documents/report.docx");
    expect(out).toContain("extractor: anydoc-v1+legacy-fallback");
    expect(out).toContain("sensitivity: private");
    expect(out).toContain("# Hello");
  });
});
