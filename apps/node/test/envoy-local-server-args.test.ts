import { describe, expect, it } from "vitest";
import {
  buildEnvoyLocalLlamaServerArgs,
  resolveEnvoyLocalLoraArg,
  resolveEnvoyLocalNgl,
} from "../src/envoy-local-server-args.js";
import type { EnvoyLocalPlatform } from "../src/envoy-local-platform.js";

const metal: EnvoyLocalPlatform = {
  accel: "metal",
  os: "darwin",
  arch: "arm64",
};

const cpu: EnvoyLocalPlatform = {
  accel: "cpu",
  os: "linux",
  arch: "x64",
};

describe("resolveEnvoyLocalNgl", () => {
  it("uses all GPU layers for auto on Metal/CUDA", () => {
    expect(resolveEnvoyLocalNgl({ nGpuLayers: "auto" }, metal)).toBe(-1);
  });

  it("uses 0 for auto on CPU", () => {
    expect(resolveEnvoyLocalNgl({ nGpuLayers: "auto" }, cpu)).toBe(0);
  });

  it("honors explicit layer counts", () => {
    expect(resolveEnvoyLocalNgl({ nGpuLayers: 0 }, metal)).toBe(0);
    expect(resolveEnvoyLocalNgl({ nGpuLayers: 24 }, metal)).toBe(24);
  });
});

describe("resolveEnvoyLocalLoraArg", () => {
  it("returns null when empty", () => {
    expect(resolveEnvoyLocalLoraArg(undefined, "/p")).toBeNull();
    expect(resolveEnvoyLocalLoraArg("  ", "/p")).toBeNull();
  });

  it("passes absolute path via --lora", () => {
    expect(resolveEnvoyLocalLoraArg("/models/lora.gguf", "/profile")).toEqual({
      flag: "--lora",
      value: "/models/lora.gguf",
    });
  });

  it("resolves relative paths under profileDir", () => {
    expect(resolveEnvoyLocalLoraArg("adapters/a.gguf", "/profile")).toEqual({
      flag: "--lora",
      value: "/profile/adapters/a.gguf",
    });
  });

  it("uses --lora-scaled for path@scale (Windows-safe)", () => {
    expect(resolveEnvoyLocalLoraArg("/a.gguf@0.5", "/p")).toEqual({
      flag: "--lora-scaled",
      value: "/a.gguf:0.5",
    });
  });
});

describe("buildEnvoyLocalLlamaServerArgs", () => {
  it("emits defaults including flash-attn, fit, and 32k context", () => {
    const args = buildEnvoyLocalLlamaServerArgs({
      modelPath: "/models/m.gguf",
      modelId: "m",
      port: 18790,
      platform: metal,
      serverParams: {},
      profileDir: "/profile",
    });
    expect(args).toEqual(
      expect.arrayContaining([
        "-m",
        "/models/m.gguf",
        "-c",
        "32768",
        "-ngl",
        "-1",
        "--parallel",
        "1",
        "-fa",
        "auto",
        "--fit",
        "on",
      ]),
    );
  });

  it("passes KV cache, batch, LoRA, and forceCpu", () => {
    const args = buildEnvoyLocalLlamaServerArgs({
      modelPath: "/models/m.gguf",
      modelId: "m",
      port: 18790,
      platform: metal,
      serverParams: {
        ctxSize: 16384,
        threads: 8,
        batchSize: 1024,
        ubatchSize: 256,
        cacheTypeK: "q8_0",
        cacheTypeV: "q4_0",
        loraPath: "/lora.gguf@0.8",
        flashAttn: "on",
        fit: "off",
        parallel: 2,
      },
      profileDir: "/profile",
      chatTemplate: "chatml",
      forceCpu: true,
    });
    expect(args).toContain("-ngl");
    expect(args[args.indexOf("-ngl") + 1]).toBe("0");
    expect(args).toEqual(
      expect.arrayContaining([
        "-c",
        "16384",
        "-t",
        "8",
        "-b",
        "1024",
        "-ub",
        "256",
        "-ctk",
        "q8_0",
        "-ctv",
        "q4_0",
        "--lora-scaled",
        "/lora.gguf:0.8",
        "-fa",
        "on",
        "--fit",
        "off",
        "--parallel",
        "2",
        "--chat-template",
        "chatml",
      ]),
    );
  });

  it("passes embedding flags with fit off, CPU device, and batch 512", () => {
    const args = buildEnvoyLocalLlamaServerArgs({
      modelPath: "/models/e.gguf",
      modelId: "embed",
      port: 18791,
      platform: metal,
      serverParams: {
        ctxSize: 2048,
        parallel: 1,
        nGpuLayers: 0,
        fit: "off",
        flashAttn: "off",
        batchSize: 512,
        ubatchSize: 512,
      },
      profileDir: "/profile",
      forceCpu: true,
      embedding: true,
      pooling: "last",
    });
    expect(args).toEqual(
      expect.arrayContaining([
        "--embedding",
        "--pooling",
        "last",
        "--fit",
        "off",
        "-fa",
        "off",
        "-dev",
        "none",
        "-b",
        "512",
        "-ub",
        "512",
        "-ngl",
        "0",
      ]),
    );
  });

  it("pins -dev none when forceCpu without embedding", () => {
    const args = buildEnvoyLocalLlamaServerArgs({
      modelPath: "/models/m.gguf",
      modelId: "m",
      port: 18790,
      platform: metal,
      serverParams: {},
      profileDir: "/profile",
      forceCpu: true,
    });
    expect(args).toEqual(expect.arrayContaining(["-dev", "none", "-ngl", "0"]));
  });
});
