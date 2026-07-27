import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  listOpenClawWorkspaceFilesFromDir,
  readOpenClawWorkspaceFileFromDir,
} from "../src/openclaw-workspace-files.js";

describe("openclaw-workspace-files", () => {
  it("lists workspace files recursively and skips dotfiles", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoymesh-ws-list-"));
    try {
      await writeFile(join(root, "IDENTITY.md"), "# me\n", "utf-8");
      await mkdir(join(root, "skills", "demo"), { recursive: true });
      await writeFile(join(root, "skills", "demo", "SKILL.md"), "# skill\n", "utf-8");
      await writeFile(join(root, ".hidden"), "secret", "utf-8");

      const items = await listOpenClawWorkspaceFilesFromDir(root);
      expect(items.map((item) => item.relativePath).sort()).toEqual([
        "IDENTITY.md",
        "skills/demo/SKILL.md",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reads workspace file content with text mime", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoymesh-ws-read-"));
    try {
      await writeFile(join(root, "notes.txt"), "hello workspace", "utf-8");
      const content = await readOpenClawWorkspaceFileFromDir(root, { relativePath: "notes.txt" });
      expect(content.mimeType).toBe("text/plain");
      expect(Buffer.from(content.contentBase64, "base64").toString("utf-8")).toBe("hello workspace");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("supports offset ranges for tunnel-safe chunked reads", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoymesh-ws-range-"));
    try {
      const bytes = Buffer.alloc(100, 0xab);
      bytes[50] = 0xcd;
      await writeFile(join(root, "big.bin"), bytes);
      await expect(
        readOpenClawWorkspaceFileFromDir(root, { relativePath: "big.bin", maxBytes: 40 }),
      ).rejects.toThrow(/too large/i);

      const first = await readOpenClawWorkspaceFileFromDir(root, {
        relativePath: "big.bin",
        maxBytes: 40,
        offset: 0,
      });
      expect(first.sizeBytes).toBe(100);
      expect(first.truncated).toBe(true);
      expect(Buffer.from(first.contentBase64, "base64").byteLength).toBe(40);

      const second = await readOpenClawWorkspaceFileFromDir(root, {
        relativePath: "big.bin",
        maxBytes: 40,
        offset: 40,
      });
      expect(second.truncated).toBe(true);
      expect(Buffer.from(second.contentBase64, "base64")[10]).toBe(0xcd);

      const last = await readOpenClawWorkspaceFileFromDir(root, {
        relativePath: "big.bin",
        maxBytes: 40,
        offset: 80,
      });
      expect(last.truncated).toBe(false);
      expect(Buffer.from(last.contentBase64, "base64").byteLength).toBe(20);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects paths outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoymesh-ws-safe-"));
    try {
      await expect(
        readOpenClawWorkspaceFileFromDir(root, { relativePath: "../outside.txt" }),
      ).rejects.toThrow(/outside|Invalid/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
