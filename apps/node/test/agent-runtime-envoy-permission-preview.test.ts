/**
 * EH permission diff previews for edit/write/bash tools.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { buildEhPermissionPreview } from "../src/agent-runtime-envoy/permission-preview.js";

describe("buildEhPermissionPreview", () => {
  it("formats edit tool diff preview", async () => {
    const preview = await buildEhPermissionPreview(
      {
        toolName: "edit",
        args: { path: "src/a.ts", oldText: "a", newText: "b" },
      },
      "/proj",
    );
    expect(preview).toContain("src/a.ts");
    expect(preview).toContain("- a");
    expect(preview).toContain("+ b");
  });

  it("formats bash command preview", async () => {
    const preview = await buildEhPermissionPreview(
      { toolName: "bash", args: { command: "npm test" } },
      "/proj",
    );
    expect(preview).toBe("$ npm test");
  });

  it("formats new write preview without cwd", async () => {
    const preview = await buildEhPermissionPreview(
      {
        toolName: "write",
        args: { path: "new.txt", content: "hello\nworld" },
      },
      undefined,
    );
    expect(preview).toContain("new file new.txt");
    expect(preview).toContain("hello");
  });

  it("bounds the write-diff read on huge files (regression)", async () => {
    const dir = await mkdtemp(
      path.join(os.tmpdir(), "eh-permission-preview-"),
    );
    try {
      // ~2 MB file — far beyond the 64 KiB bounded preview read.
      const big = "line\n".repeat(500_000);
      const target = path.join(dir, "huge.log");
      await writeFile(target, big);
      const preview = await buildEhPermissionPreview(
        {
          toolName: "write",
          args: { path: target, content: "new content" },
        },
        dir,
      );
      expect(preview).toContain("huge.log");
      // The bounded head (not the whole 2 MB file) is shown.
      expect(preview!.length).toBeLessThan(10_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
