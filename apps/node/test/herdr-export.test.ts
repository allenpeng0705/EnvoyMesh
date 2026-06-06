import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeHerdrExportFile } from "../src/herdr-export.js";

describe("herdr-export", () => {
  let profileDir: string;
  const originalHerdrSocket = process.env.HERDR_SOCKET;

  afterEach(() => {
    if (originalHerdrSocket === undefined) {
      delete process.env.HERDR_SOCKET;
    } else {
      process.env.HERDR_SOCKET = originalHerdrSocket;
    }
  });

  it("writes scrollback export file with header and preview", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-herdr-export-"));
    const result = await writeHerdrExportFile(profileDir, "sess-1", "Build shell", "line one\nline two\n");
    expect(result.exportPath).toContain("herdr-export/sess-1.txt");
    expect(result.preview).toContain("line two");
    expect(result.socketNote).toContain("HERDR_SOCKET");

    const raw = await readFile(result.exportPath, "utf8");
    expect(raw).toContain("Build shell");
    expect(raw).toContain("line one");
  });

  it("notes when HERDR_SOCKET is unset", async () => {
    delete process.env.HERDR_SOCKET;
    profileDir = await mkdtemp(join(tmpdir(), "envoy-herdr-export-"));
    const result = await writeHerdrExportFile(profileDir, "sess-2", "T", "body");
    expect(result.socketNote).toContain("Optional: set HERDR_SOCKET");
  });
});
