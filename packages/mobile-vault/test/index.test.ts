import { describe, expect, it, beforeEach } from "vitest";
import {
  createMobileVault,
  type MobileVault,
} from "../src/index.js";

describe("mobile-vault", () => {
  let vault: MobileVault;

  beforeEach(() => {
    vault = createMobileVault();
  });

  // -----------------------------------------------------------------------
  // writeFile / readFile
  // -----------------------------------------------------------------------

  describe("writeFile / readFile", () => {
    it("writes and reads a file", async () => {
      const content = new TextEncoder().encode("hello world");
      await vault.writeFile("/test/hello.txt", content);

      const entry = await vault.readFile("/test/hello.txt");
      expect(entry.path).toBe("/test/hello.txt");
      expect(entry.sizeBytes).toBe(11);
      expect(entry.content).toEqual(content);
    });

    it("overwrites an existing file", async () => {
      await vault.writeFile("/test/foo.txt", new TextEncoder().encode("v1"));
      await vault.writeFile("/test/foo.txt", new TextEncoder().encode("v2"));

      const entry = await vault.readFile("/test/foo.txt");
      expect(new TextDecoder().decode(entry.content)).toBe("v2");
    });

    it("throws on read of nonexistent file", async () => {
      await expect(vault.readFile("/nonexistent.txt")).rejects.toThrow("File not found");
    });

    it("stores mime type when provided", async () => {
      await vault.writeFile("/test/data.json", new TextEncoder().encode("{}"), "application/json");
      const entry = await vault.readFile("/test/data.json");
      expect(entry.mimeType).toBe("application/json");
    });

    it("handles empty file", async () => {
      const content = new Uint8Array(0);
      await vault.writeFile("/test/empty.txt", content);
      const entry = await vault.readFile("/test/empty.txt");
      expect(entry.sizeBytes).toBe(0);
      expect(entry.content).toEqual(content);
    });

    it("handles binary data", async () => {
      const content = new Uint8Array([0x00, 0xFF, 0x42, 0x80, 0x7F]);
      await vault.writeFile("/test/binary.bin", content);
      const entry = await vault.readFile("/test/binary.bin");
      expect(entry.content).toEqual(content);
    });
  });

  // -----------------------------------------------------------------------
  // deleteFile
  // -----------------------------------------------------------------------

  describe("deleteFile", () => {
    it("deletes an existing file", async () => {
      await vault.writeFile("/test/todelete.txt", new TextEncoder().encode("data"));
      await vault.deleteFile("/test/todelete.txt");

      await expect(vault.readFile("/test/todelete.txt")).rejects.toThrow("File not found");
    });

    it("does not throw when deleting nonexistent file", async () => {
      await expect(vault.deleteFile("/nonexistent.txt")).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // listFiles
  // -----------------------------------------------------------------------

  describe("listFiles", () => {
    it("lists files in a directory", async () => {
      await vault.writeFile("/test/a.txt", new TextEncoder().encode("a"));
      await vault.writeFile("/test/b.txt", new TextEncoder().encode("b"));
      await vault.writeFile("/other/c.txt", new TextEncoder().encode("c"));

      const files = await vault.listFiles("/test");
      expect(files).toHaveLength(2);
      expect(files).toContain("/test/a.txt");
      expect(files).toContain("/test/b.txt");
    });

    it("defaults to listing root files", async () => {
      await vault.writeFile("/a.txt", new TextEncoder().encode("a"));
      await vault.writeFile("/sub/b.txt", new TextEncoder().encode("b"));

      const files = await vault.listFiles();
      expect(files).toHaveLength(2);
    });

    it("returns empty array for empty directory", async () => {
      const files = await vault.listFiles("/empty");
      expect(files).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  describe("search", () => {
    it("finds files containing a query string", async () => {
      await vault.writeFile("/test/hello.txt", new TextEncoder().encode("hello world"));
      await vault.writeFile("/test/goodbye.txt", new TextEncoder().encode("goodbye world"));
      await vault.writeFile("/test/unrelated.txt", new TextEncoder().encode("nothing here"));

      const results = await vault.search("hello");
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("/test/hello.txt");
    });

    it("search is case insensitive", async () => {
      await vault.writeFile("/test/upper.txt", new TextEncoder().encode("HELLO WORLD"));
      const results = await vault.search("hello");
      expect(results).toHaveLength(1);
    });

    it("returns matched chunk context", async () => {
      const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.";
      await vault.writeFile("/test/lorem.txt", new TextEncoder().encode(text));

      const results = await vault.search("consectetur");
      expect(results).toHaveLength(1);
      expect(results[0].matchedChunk).toBeDefined();
      expect(results[0].matchedChunk!.toLowerCase()).toContain("consectetur");
    });

    it("respects maxResults", async () => {
      for (let i = 0; i < 10; i++) {
        await vault.writeFile(`/test/file${i}.txt`, new TextEncoder().encode(`match ${i}`));
      }

      const results = await vault.search("match", 3);
      expect(results).toHaveLength(3);
    });

    it("returns empty array for no matches", async () => {
      await vault.writeFile("/test/data.txt", new TextEncoder().encode("some content"));
      const results = await vault.search("nonexistent");
      expect(results).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Path safety
  // -----------------------------------------------------------------------

  describe("path safety", () => {
    it("rejects paths with '..'", async () => {
      await expect(vault.writeFile("../escape.txt", new TextEncoder().encode("bad"))).rejects.toThrow("Invalid vault path");
    });

    it("rejects paths with '~'", async () => {
      await expect(vault.writeFile("~/home.txt", new TextEncoder().encode("bad"))).rejects.toThrow("Invalid vault path");
    });

    it("rejects empty path", async () => {
      await expect(vault.writeFile("", new TextEncoder().encode("bad"))).rejects.toThrow("Invalid vault path");
    });

    it("rejects path traversal in readFile", async () => {
      await expect(vault.readFile("../etc/passwd")).rejects.toThrow("Invalid vault path");
    });

    it("rejects path traversal in deleteFile", async () => {
      await expect(vault.deleteFile("../../../etc/critical")).rejects.toThrow("Invalid vault path");
    });
  });
});
