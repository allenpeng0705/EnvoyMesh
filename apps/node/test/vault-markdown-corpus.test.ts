import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectLooseMarkdownIntoNotes,
  materializeOfficeDocumentToNotes,
  needsRagReindexAfterMarkdownCollect,
} from "../src/vault-markdown-corpus.js";

let vaultDir: string;

beforeEach(async () => {
  vaultDir = await mkdtemp(join(tmpdir(), "envoymesh-md-corpus-"));
});

afterEach(async () => {
  await rm(vaultDir, { recursive: true, force: true });
});

describe("collectLooseMarkdownIntoNotes", () => {
  it("moves loose markdown into notes/ and leaves notes/blog alone", async () => {
    await mkdir(join(vaultDir, "research"), { recursive: true });
    await mkdir(join(vaultDir, "notes"), { recursive: true });
    await mkdir(join(vaultDir, "blog"), { recursive: true });
    await writeFile(join(vaultDir, "loose.md"), "# Loose\n", "utf8");
    await writeFile(join(vaultDir, "research", "topic.md"), "# Topic\n", "utf8");
    await writeFile(join(vaultDir, "notes", "keep.md"), "# Keep\n", "utf8");
    await writeFile(join(vaultDir, "blog", "index.md"), "# Blog\n", "utf8");

    const result = await collectLooseMarkdownIntoNotes(vaultDir);
    expect(result.moved.map((m) => m.from).sort()).toEqual(["loose.md", "research/topic.md"]);

    await expect(readFile(join(vaultDir, "notes", "loose.md"), "utf8")).resolves.toContain("# Loose");
    await expect(readFile(join(vaultDir, "notes", "research", "topic.md"), "utf8")).resolves.toContain(
      "# Topic",
    );
    await expect(readFile(join(vaultDir, "notes", "keep.md"), "utf8")).resolves.toContain("# Keep");
    await expect(readFile(join(vaultDir, "blog", "index.md"), "utf8")).resolves.toContain("# Blog");
  });
});

describe("needsRagReindexAfterMarkdownCollect", () => {
  it("is true only when files were moved", () => {
    expect(needsRagReindexAfterMarkdownCollect([])).toBe(false);
    expect(needsRagReindexAfterMarkdownCollect([{ from: "a.md", to: "notes/a.md" }])).toBe(true);
  });
});

describe("materializeOfficeDocumentToNotes", () => {
  it("returns not_extractable for plain text", async () => {
    await mkdir(join(vaultDir, "documents"), { recursive: true });
    await writeFile(join(vaultDir, "documents", "a.txt"), "hi", "utf8");
    const result = await materializeOfficeDocumentToNotes(vaultDir, "documents/a.txt");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not_extractable");
  });

  it("writes GFM under notes/imports for HTML with private sensitivity", async () => {
    await mkdir(join(vaultDir, "documents"), { recursive: true });
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-md-profile-"));
    await writeFile(
      join(vaultDir, "documents", "page.html"),
      "<html><body><h1>Hi</h1><p>World</p></body></html>",
      "utf8",
    );
    const result = await materializeOfficeDocumentToNotes(vaultDir, "documents/page.html", {
      profileDir,
      sensitivity: "private",
    });
    expect(result.ok).toBe(true);
    expect(result.markdownRelativePath).toBe("notes/imports/page.md");
    expect(result.documentId).toBeTruthy();
    const md = await readFile(join(vaultDir, "notes", "imports", "page.md"), "utf8");
    expect(md).toContain("source: documents/page.html");
    expect(md).toContain("sensitivity: private");
    expect(md.toLowerCase()).toMatch(/hi|world/);

    const { createSensitivityOverrideStore } = await import("@envoymesh/local-store");
    const store = createSensitivityOverrideStore(profileDir);
    const overrides = await store.load();
    expect(overrides.get(result.documentId!)).toBe("private");
    await rm(profileDir, { recursive: true, force: true });
  });
});
