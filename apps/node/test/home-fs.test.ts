import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getHomeFsInfo,
  listHomeFsEntries,
  previewHomeFsFile,
  resolveHomeFsDirectory,
  resolveHomeFsFile,
  HOME_FS_PREVIEW_MAX_BYTES,
} from "../src/home-fs.js";
import {
  getExtAgentProjectPathCwd,
  setExtAgentProjectPathInStore,
  syncExtAgentProjectPathsFromAgents,
} from "../src/ext-agent-adapter/project-path-store.js";
import { extAgentUsesProjectPath } from "@envoymesh/api";
import { isOwnerOnlyRpcMethod } from "../src/json-rpc-router.js";
import { requireOwnerProfile, runWithRpcCaller } from "../src/rpc-caller-context.js";

describe("home-fs", () => {
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

  it("getHomeFsInfo returns platform, homeDir, and roots", () => {
    const info = getHomeFsInfo();
    expect(info.homeDir.length).toBeGreaterThan(0);
    expect(info.pathSep.length).toBeGreaterThan(0);
    expect(["darwin", "linux", "win32", "other"]).toContain(info.platform);
    expect(info.roots.length).toBeGreaterThan(0);
  });

  it("resolveHomeFsDirectory rejects missing and non-dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-home-fs-"));
    dirs.push(root);
    const file = join(root, "file.txt");
    writeFileSync(file, "x");
    expect(resolveHomeFsDirectory(file)).toBeNull();
    expect(resolveHomeFsDirectory(join(root, "missing"))).toBeNull();
    expect(resolveHomeFsDirectory("relative/path")).toBeNull();
    expect(resolveHomeFsDirectory(root)).toBe(root);
  });

  it("listHomeFsEntries lists dirs and files with dirsOnly filter", () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-home-fs-"));
    dirs.push(root);
    mkdirSync(join(root, "subdir"));
    writeFileSync(join(root, "a.txt"), "a");
    const all = listHomeFsEntries({ path: root });
    expect(all.path).toBe(root);
    expect(all.entries.map((e) => e.name).sort()).toEqual(["a.txt", "subdir"]);
    const dirsOnly = listHomeFsEntries({ path: root, dirsOnly: true });
    expect(dirsOnly.entries.map((e) => e.name)).toEqual(["subdir"]);
  });

  it("previewHomeFsFile returns html for text and markdown", async () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-home-fs-"));
    dirs.push(root);
    const txt = join(root, "note.txt");
    const md = join(root, "readme.md");
    writeFileSync(txt, "hello preview");
    writeFileSync(md, "# Title\n\nbody");
    expect(resolveHomeFsFile(txt)).toBe(txt);
    expect(resolveHomeFsFile(root)).toBeNull();

    const textPreview = await previewHomeFsFile({ path: txt });
    expect(textPreview.kind).toBe("text");
    expect(textPreview.html).toContain("hello preview");

    const mdPreview = await previewHomeFsFile({ path: md });
    expect(mdPreview.kind).toBe("markdown");
    expect(mdPreview.html).toContain("<h1>Title</h1>");

    const bad = await previewHomeFsFile({ path: "relative.txt" });
    expect(bad.kind).toBe("error");
  });

  it("previewHomeFsFile rejects oversized files", async () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-home-fs-"));
    dirs.push(root);
    const big = join(root, "big.bin");
    writeFileSync(big, Buffer.alloc(HOME_FS_PREVIEW_MAX_BYTES + 1));
    const preview = await previewHomeFsFile({ path: big });
    expect(preview.kind).toBe("error");
    expect(preview.error).toMatch(/too large/i);
  });
});

describe("ext agent project path store", () => {
  afterEach(() => {
    syncExtAgentProjectPathsFromAgents([]);
  });

  it("hydrates only agents that use projectPath", () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-proj-"));
    try {
      syncExtAgentProjectPathsFromAgents([
        {
          id: "codex",
          name: "Codex",
          adapter: "envoymesh-message",
          url: "http://127.0.0.1:8023/message",
          enabled: true,
          projectPath: root,
        },
        {
          id: "hermes",
          name: "Hermes",
          adapter: "envoymesh-message",
          url: "http://127.0.0.1:8020/message",
          enabled: true,
          projectPath: root,
        },
      ]);
      expect(getExtAgentProjectPathCwd("codex")).toBe(root);
      expect(getExtAgentProjectPathCwd("hermes")).toBe(root);
      expect(extAgentUsesProjectPath("codex")).toBe(true);
      expect(extAgentUsesProjectPath("hermes")).toBe(true);
      expect(extAgentUsesProjectPath("openhuman")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("setExtAgentProjectPathInStore clears and sets", () => {
    const root = mkdtempSync(join(tmpdir(), "envoy-proj-"));
    try {
      setExtAgentProjectPathInStore("cursor", root);
      expect(getExtAgentProjectPathCwd("cursor")).toBe(root);
      setExtAgentProjectPathInStore("cursor", null);
      expect(getExtAgentProjectPathCwd("cursor")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("home-fs owner-only RPC gate", () => {
  it("marks browse / project path methods as owner-only", () => {
    for (const method of [
      "getHomeFsInfo",
      "listHomeFsEntries",
      "discoverObsidianVaults",
      "getExtAgentProjectPath",
      "setExtAgentProjectPath",
      "previewHomeFsFile",
    ]) {
      expect(isOwnerOnlyRpcMethod(method), method).toBe(true);
    }
  });

  it("rejects family callers on listHomeFsEntries", async () => {
    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:x",
          profileId: "mom",
          isOwnerProfile: false,
          source: "session",
        },
        async () => {
          if (isOwnerOnlyRpcMethod("listHomeFsEntries")) {
            requireOwnerProfile("call listHomeFsEntries");
          }
        },
      ),
    ).rejects.toThrow(/Only the node owner/);
  });
});
