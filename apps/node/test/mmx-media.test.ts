import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildMmxMediaArgs,
  ensureMmxOutputDir,
  mmxOutputDir,
  plannedOutputPath,
} from "../src/mmx-media.js";
import { buildMmxMediaSlashCommands } from "../src/mmx-media-slash.js";

describe("mmx-media", () => {
  it("writes under profileDir/mmx-output", () => {
    const dir = mkdtempSync(join(tmpdir(), "mmx-media-"));
    try {
      expect(mmxOutputDir(dir)).toBe(join(dir, "mmx-output"));
      expect(ensureMmxOutputDir(dir)).toBe(join(dir, "mmx-output"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds image / video / speech / music args with output paths", () => {
    const out = "/tmp/mmx-output/x.png";
    expect(buildMmxMediaArgs({ kind: "image", prompt: "a cat" }, out)).toEqual({
      args: ["image", "generate", "--prompt", "a cat", "--out", out],
      timeoutMs: 180_000,
      expectsFile: true,
    });
    expect(buildMmxMediaArgs({ kind: "video", prompt: "waves" }, "/tmp/v.mp4").args).toEqual([
      "video",
      "generate",
      "--prompt",
      "waves",
      "--download",
      "/tmp/v.mp4",
    ]);
    expect(
      buildMmxMediaArgs({ kind: "speech", prompt: "hello" }, "/tmp/s.mp3").args,
    ).toEqual(["speech", "synthesize", "--text", "hello", "--out", "/tmp/s.mp3"]);
    expect(
      buildMmxMediaArgs({ kind: "music", prompt: "lofi" }, "/tmp/m.mp3").args,
    ).toEqual(["music", "generate", "--prompt", "lofi", "--out", "/tmp/m.mp3"]);
  });

  it("builds text-only vision / search / quota / auth args", () => {
    expect(
      buildMmxMediaArgs({ kind: "vision", target: "/img.png", prompt: "what?" }, undefined)
        .expectsFile,
    ).toBe(false);
    expect(
      buildMmxMediaArgs({ kind: "vision", target: "https://x/y.png" }, undefined).args,
    ).toEqual(["vision", "describe", "--image", "https://x/y.png"]);
    expect(buildMmxMediaArgs({ kind: "search", prompt: "news" }, undefined).args).toEqual([
      "search",
      "query",
      "--q",
      "news",
    ]);
    expect(buildMmxMediaArgs({ kind: "quota" }, undefined).args).toEqual(["quota"]);
    expect(buildMmxMediaArgs({ kind: "auth" }, undefined).args).toEqual(["auth", "status"]);
  });

  it("plans stamped output paths per kind", () => {
    const dir = mkdtempSync(join(tmpdir(), "mmx-plan-"));
    try {
      expect(plannedOutputPath(dir, "image")).toMatch(/mmx-output[/\\].+-image\.png$/);
      expect(plannedOutputPath(dir, "video")).toMatch(/\.mp4$/);
      expect(plannedOutputPath(dir, "speech")).toMatch(/\.mp3$/);
      expect(plannedOutputPath(dir, "quota")).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ships envoy-intercept media slash descriptors", () => {
    const cmds = buildMmxMediaSlashCommands();
    const image = cmds.find((c) => c.slash === "/image");
    expect(image?.intercept).toBe("envoy");
    expect(cmds.map((c) => c.slash)).toEqual(
      expect.arrayContaining([
        "/image",
        "/video",
        "/speech",
        "/music",
        "/vision",
        "/search",
        "/quota",
        "/mmx-auth",
      ]),
    );
  });
});
