import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { readLibraryItemContentViaRuntime, type FileShareContext } from "../src/node-service-fileshare.js";

function minimalCtx(vaultDir: string): FileShareContext {
  return {
    getVaultDir: () => vaultDir,
  } as FileShareContext;
}

describe("readLibraryItemContentViaRuntime range reads", () => {
  it("rejects oversized full reads but serves offset chunks", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoy-vault-range-"));
    try {
      await mkdir(join(root, "profile"), { recursive: true });
      const bytes = Buffer.alloc(100, 0x11);
      bytes[50] = 0x22;
      await writeFile(join(root, "profile", "thumb.jpg"), bytes);

      await expect(
        readLibraryItemContentViaRuntime(minimalCtx(root), {
          relativePath: "profile/thumb.jpg",
          maxBytes: 40,
        }),
      ).rejects.toThrow(/too large/i);

      const first = await readLibraryItemContentViaRuntime(minimalCtx(root), {
        relativePath: "profile/thumb.jpg",
        maxBytes: 40,
        offset: 0,
      });
      expect(first.sizeBytes).toBe(100);
      expect(first.truncated).toBe(true);
      expect(Buffer.from(first.contentBase64, "base64").byteLength).toBe(40);
      expect(first.mimeType).toMatch(/jpeg|octet-stream/);

      const mid = await readLibraryItemContentViaRuntime(minimalCtx(root), {
        relativePath: "profile/thumb.jpg",
        maxBytes: 40,
        offset: 40,
      });
      expect(mid.truncated).toBe(true);
      expect(Buffer.from(mid.contentBase64, "base64")[10]).toBe(0x22);

      const last = await readLibraryItemContentViaRuntime(minimalCtx(root), {
        relativePath: "profile/thumb.jpg",
        maxBytes: 40,
        offset: 80,
      });
      expect(last.truncated).toBe(false);
      expect(Buffer.from(last.contentBase64, "base64").byteLength).toBe(20);

      const pastEnd = await readLibraryItemContentViaRuntime(minimalCtx(root), {
        relativePath: "profile/thumb.jpg",
        maxBytes: 40,
        offset: 100,
      });
      expect(pastEnd.contentBase64).toBe("");
      expect(pastEnd.truncated).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects path traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "envoy-vault-safe-"));
    try {
      await expect(
        readLibraryItemContentViaRuntime(minimalCtx(root), {
          relativePath: "../outside.bin",
          maxBytes: 10,
          offset: 0,
        }),
      ).rejects.toThrow(/Invalid|outside/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
