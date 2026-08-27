import { describe, expect, it } from "vitest";
import {
  isChatAttachmentFile,
  isChatVoiceNoteFile,
  isHiddenFromLibraryList,
  isKnowledgeDocumentsPath,
  isKnowledgeNotesPath,
  isKnowledgeNotionPath,
  isKnowledgeObsidianPath,
  isProfileMediaFile,
  knowledgeBrowseSource,
  knowledgeBrowseDisplayPath,
  knowledgeObsidianOrigin,
  matchesKnowledgeBrowseFilter,
} from "../../src/lib/local-file-display.js";

describe("isChatAttachmentFile", () => {
  it("matches chat out/in attachment paths", () => {
    expect(isChatAttachmentFile("chat/out/att-1/voice-note.webm")).toBe(true);
    expect(isChatAttachmentFile("chat/out/att-1/Allen_Peng_resume_en.pdf")).toBe(true);
    expect(isChatAttachmentFile("chat/in/envoy_owner_bob/IMG_3118.jpeg")).toBe(true);
    expect(isChatAttachmentFile("chat/")).toBe(true);
  });

  it("does not match library or workspace files", () => {
    expect(isChatAttachmentFile("imports/photo.jpg")).toBe(false);
    expect(isChatAttachmentFile("notes/hello.md")).toBe(false);
    expect(isChatAttachmentFile("skills/tavily/SKILL.md")).toBe(false);
    expect(isChatAttachmentFile("SOUL.md")).toBe(false);
  });
});

describe("isProfileMediaFile", () => {
  it("matches profile thumbnail and gallery blobs", () => {
    expect(isProfileMediaFile("profile/thumbnail.jpg")).toBe(true);
    expect(isProfileMediaFile("profile/gallery/0fd7139a-9596-43fa-8733-401496c7dc98.jpg")).toBe(true);
    expect(isProfileMediaFile("profile/")).toBe(true);
  });

  it("does not match PhotoWall or imports", () => {
    expect(isProfileMediaFile("photos/wall/lake.jpg")).toBe(false);
    expect(isProfileMediaFile("imports/avatar.jpg")).toBe(false);
  });
});

describe("isHiddenFromLibraryList", () => {
  it("hides chat and profile media", () => {
    expect(isHiddenFromLibraryList("chat/out/a/x.pdf")).toBe(true);
    expect(isHiddenFromLibraryList("profile/thumbnail.jpg")).toBe(true);
    expect(isHiddenFromLibraryList("notes/hello.md")).toBe(false);
  });
});

describe("isChatVoiceNoteFile", () => {
  it("matches voice-note filenames under chat only", () => {
    expect(isChatVoiceNoteFile("chat/out/a1/voice-note.webm")).toBe(true);
    expect(isChatVoiceNoteFile("chat/out/a1/voice-note.wav")).toBe(true);
    expect(isChatVoiceNoteFile("chat/out/a1/photo.jpg")).toBe(false);
  });
});

describe("knowledge browse filters", () => {
  it("classifies notes vs documents paths", () => {
    expect(isKnowledgeNotesPath("notes/hello.md")).toBe(true);
    expect(isKnowledgeNotesPath("notes/imports/x.md")).toBe(true);
    expect(isKnowledgeNotesPath("documents/resume.pdf")).toBe(false);
    expect(isKnowledgeDocumentsPath("documents/resume.pdf")).toBe(true);
    expect(isKnowledgeDocumentsPath("notes/hello.md")).toBe(false);
  });

  it("matches KnowledgeBrowseFilter", () => {
    const note = { relativePath: "notes/a.md", published: false };
    const mcp = { relativePath: "notes/mcp/notion-hit.md", published: false };
    const blog = { relativePath: "notes/imports/blog/hello.md", published: false };
    const linked = { relativePath: "linked-obsidian/Vault/x.md", published: false };
    const doc = { relativePath: "documents/a.pdf", published: false };
    const pub = { relativePath: "notes/b.md", published: true };
    expect(matchesKnowledgeBrowseFilter(note, "all")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(note, "notes")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(note, "documents")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(doc, "documents")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(pub, "published")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(note, "published")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(note, "obsidian")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(mcp, "obsidian")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(mcp, "notion")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(note, "notion")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(blog, "notes")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(blog, "obsidian")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(blog, "blog")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(note, "blog")).toBe(false);
    expect(matchesKnowledgeBrowseFilter(linked, "obsidian")).toBe(true);
    const remote = {
      relativePath: "mcp-remote/abc-card.md",
      published: false,
      source: "mcp-remote" as const,
    };
    expect(matchesKnowledgeBrowseFilter(remote, "notion")).toBe(true);
    expect(matchesKnowledgeBrowseFilter(remote, "obsidian")).toBe(false);
  });

  it("classifies Obsidian vs Notion note paths", () => {
    expect(isKnowledgeObsidianPath("notes/hello.md")).toBe(true);
    expect(isKnowledgeNotionPath("notes/mcp/x.md")).toBe(true);
    expect(isKnowledgeObsidianPath("notes/mcp/x.md")).toBe(false);
    expect(isKnowledgeNotionPath("mcp-remote/x.md")).toBe(true);
    expect(isKnowledgeObsidianPath("linked-obsidian/V/a.md")).toBe(true);
    expect(knowledgeBrowseSource("notes/hello.md")).toBe("note");
    expect(knowledgeBrowseSource("linked-obsidian/V/a.md")).toBe("obsidian");
    expect(knowledgeBrowseSource("notes/imports/obsidian/x.md")).toBe("obsidian");
    expect(knowledgeBrowseSource("notes/mcp/x.md")).toBe("notion");
    expect(knowledgeBrowseSource("mcp-remote/x.md")).toBe("notion");
    expect(knowledgeBrowseSource("notes/imports/blog/hello.md")).toBe("blog");
    expect(knowledgeBrowseSource("documents/a.pdf")).toBe("document");
    expect(knowledgeObsidianOrigin("linked-obsidian/V/a.md")).toBe("linked");
    expect(knowledgeObsidianOrigin("notes/imports/obsidian/x.md")).toBe("imported");
    expect(knowledgeObsidianOrigin("notes/hello.md")).toBeNull();
    expect(knowledgeBrowseDisplayPath("linked-obsidian/Vault/note.md")).toBe(
      "note.md",
    );
    expect(
      knowledgeBrowseDisplayPath("linked-obsidian/Obsidian vault/Inbox/a.md"),
    ).toBe("Inbox/a.md");
    expect(knowledgeBrowseDisplayPath("notes/imports/obsidian/Vault/a.md")).toBe(
      "a.md",
    );
    expect(knowledgeBrowseDisplayPath("notes/hello.md")).toBe("notes/hello.md");
  });
});
