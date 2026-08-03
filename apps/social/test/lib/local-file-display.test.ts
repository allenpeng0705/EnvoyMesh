import { describe, expect, it } from "vitest";
import {
  isChatAttachmentFile,
  isChatVoiceNoteFile,
  isHiddenFromLibraryList,
  isProfileMediaFile,
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
