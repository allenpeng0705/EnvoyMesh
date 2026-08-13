import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseObsidianJsonVaultPaths,
  scanForObsidianVaultMarkers,
} from "../src/discover-obsidian-vaults.js";

describe("parseObsidianJsonVaultPaths", () => {
  it("reads vault paths from Obsidian registry JSON", () => {
    const raw = JSON.stringify({
      vaults: {
        a1: { path: "/Users/me/Notes", ts: 1 },
        a2: { path: "/Users/me/Work", open: true },
        bad: { ts: 2 },
      },
    });
    expect(parseObsidianJsonVaultPaths(raw)).toEqual([
      "/Users/me/Notes",
      "/Users/me/Work",
    ]);
  });

  it("returns empty on malformed JSON", () => {
    expect(parseObsidianJsonVaultPaths("{")).toEqual([]);
    expect(parseObsidianJsonVaultPaths("{}")).toEqual([]);
  });
});

describe("scanForObsidianVaultMarkers", () => {
  it("finds directories that contain .obsidian", () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-obsidian-scan-"));
    const vault = join(root, "Documents", "MyVault");
    mkdirSync(join(vault, ".obsidian"), { recursive: true });
    writeFileSync(join(vault, "note.md"), "# hi");
    mkdirSync(join(root, "Documents", "NotAVault"), { recursive: true });

    const found = scanForObsidianVaultMarkers([root], { maxDepth: 3, maxDirs: 50 });
    expect(found).toContain(vault);
    expect(found.some((p) => p.endsWith("NotAVault"))).toBe(false);
  });
});
