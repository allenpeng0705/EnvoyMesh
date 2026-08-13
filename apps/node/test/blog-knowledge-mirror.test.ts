import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { materializeBlogPostToNotes } from "../src/vault-markdown-corpus.js";

describe("materializeBlogPostToNotes", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("writes a private knowledge mirror under notes/imports/blog/", async () => {
    root = await mkdtemp(join(tmpdir(), "envoy-blog-kb-"));
    const vaultDir = join(root, "vault");
    await mkdir(vaultDir, { recursive: true });

    const result = await materializeBlogPostToNotes(vaultDir, {
      webRelativePath: "blog/posts/hello-world.md",
      title: "Hello World",
      markdown: "# Hello World\n\nBody text.\n",
      sensitivity: "private",
    });

    expect(result.ok).toBe(true);
    expect(result.markdownRelativePath).toBe("notes/imports/blog/hello-world.md");
    const text = await readFile(join(vaultDir, result.markdownRelativePath!), "utf8");
    expect(text).toMatch(/source:\s*"?web:blog\/posts\/hello-world\.md"?/);
    expect(text).toContain("extractor: blog");
    expect(text).toContain("sensitivity: private");
    expect(text).toContain("Body text.");
  });
});
