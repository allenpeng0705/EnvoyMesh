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
