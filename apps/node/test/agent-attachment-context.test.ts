import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAgentAttachmentContext,
  mergeAgentPromptWithAttachments,
} from "../src/agent-attachment-context.js";

describe("agent-attachment-context", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("includes truncated text preview and absolute path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attach-ctx-"));
    dirs.push(dir);
    const filePath = join(dir, "readme.md");
    writeFileSync(filePath, "line one\nline two\n");
    const result = await buildAgentAttachmentContext([
      { path: filePath, name: "readme.md", mimeType: "text/markdown" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contextText).toContain("Attached files (on home node):");
    expect(result.contextText).toContain("--- file: readme.md");
    expect(result.contextText).toContain(`path: ${filePath}`);
    expect(result.contextText).toContain("line one");
    expect(result.contextText).toContain("line two");
  });

  it("bounded-reads large text without loading entire file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attach-ctx-"));
    dirs.push(dir);
    const filePath = join(dir, "huge.txt");
    // Write ~2 MiB — would OOM-risk if fully read into many concurrent attaches;
    // preview must only take the first 64 KiB.
    writeFileSync(filePath, "y".repeat(2 * 1024 * 1024));
    const result = await buildAgentAttachmentContext([{ path: filePath }]);
    expect(result.ok).toBe(true);
    expect(result.contextText).toContain("… [truncated");
    expect(Buffer.byteLength(result.contextText!, "utf8")).toBeLessThan(
      100 * 1024,
    );
  });

  it("uses binary placeholder for images", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attach-ctx-"));
    dirs.push(dir);
    const filePath = join(dir, "pic.png");
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]));
    const result = await buildAgentAttachmentContext([
      { path: filePath, mimeType: "image/png" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contextText).toMatch(/\[binary: image\/png, \d+ bytes\]/);
    expect(result.contextText).not.toContain("\u0089PNG");
  });

  it("extracts HTML via vault extract pipeline (Phase 57E)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "attach-ctx-"));
    dirs.push(dir);
    const filePath = join(dir, "brief.html");
    writeFileSync(
      filePath,
      "<html><body><h1>Quarterly Brief</h1><p>Revenue grew.</p></body></html>",
    );
    const result = await buildAgentAttachmentContext([
      { path: filePath, mimeType: "text/html" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.contextText).toContain("Quarterly Brief");
    expect(result.contextText).toContain("Revenue grew");
    expect(result.contextText).not.toMatch(/\[binary:/);
  });

  it("errors on missing path", async () => {
    const result = await buildAgentAttachmentContext([
      { path: join(tmpdir(), "no-such-attach-file-xyz.txt") },
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("mergeAgentPromptWithAttachments joins text and context", () => {
    expect(mergeAgentPromptWithAttachments("hi", undefined)).toBe("hi");
    expect(mergeAgentPromptWithAttachments("", "ctx")).toBe("ctx");
    expect(mergeAgentPromptWithAttachments("hi", "ctx")).toBe("hi\n\nctx");
  });
});
