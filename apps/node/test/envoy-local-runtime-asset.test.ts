/**
 * Accel marker mismatch rules for Envoy Local runtime install.
 */
import { describe, expect, it } from "vitest";
import { resolveEnvoyLocalRuntimeAssets } from "../src/envoy-local-manifest.js";
import { runtimeAssetMismatch } from "../src/envoy-local-runtime.js";

describe("runtimeAssetMismatch", () => {
  const linuxCuda = { os: "linux" as const, arch: "x64" as const, accel: "cuda" as const };
  const linuxCpu = { os: "linux" as const, arch: "x64" as const, accel: "cpu" as const };
  const winCuda = { os: "win32" as const, arch: "x64" as const, accel: "cuda" as const };
  const metal = { os: "darwin" as const, arch: "arm64" as const, accel: "metal" as const };

  it("missing marker on NVIDIA is a mismatch (one-shot CPU→Vulkan/CUDA upgrade)", () => {
    expect(runtimeAssetMismatch(linuxCuda, null)).toBe(true);
    expect(runtimeAssetMismatch(winCuda, null)).toBe(true);
  });

  it("missing marker on Metal/CPU is kept (no surprise re-download)", () => {
    expect(runtimeAssetMismatch(metal, null)).toBe(false);
    expect(runtimeAssetMismatch(linuxCpu, null)).toBe(false);
  });

  it("matching marker is not a mismatch", () => {
    const want = resolveEnvoyLocalRuntimeAssets(linuxCuda);
    expect(
      runtimeAssetMismatch(linuxCuda, {
        runtimeName: want.runtimeName,
        accel: "cuda",
      }),
    ).toBe(false);
  });

  it("wrong runtimeName or accel is a mismatch", () => {
    expect(
      runtimeAssetMismatch(linuxCuda, {
        runtimeName: "llama-b10331-bin-ubuntu-x64.tar.gz",
        accel: "cuda",
      }),
    ).toBe(true);
    expect(
      runtimeAssetMismatch(linuxCuda, {
        runtimeName: resolveEnvoyLocalRuntimeAssets(linuxCuda).runtimeName,
        accel: "cpu",
      }),
    ).toBe(true);
  });

  it("FORCE_CPU-style platform vs cuda marker is a mismatch", () => {
    const cudaWant = resolveEnvoyLocalRuntimeAssets(linuxCuda);
    expect(
      runtimeAssetMismatch(linuxCpu, {
        runtimeName: cudaWant.runtimeName,
        accel: "cuda",
      }),
    ).toBe(true);
  });

  it("corrupt-shaped marker (empty runtimeName) is treated as missing", () => {
    // readRuntimeAssetMarker rejects empty runtimeName → null; mismatch then uses null rule.
    expect(runtimeAssetMismatch(linuxCuda, null)).toBe(true);
    expect(runtimeAssetMismatch(metal, null)).toBe(false);
  });
});
