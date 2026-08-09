import { describe, expect, it } from "vitest";
import {
  buildLlamaCppAssetNames,
  detectEnvoyLocalPlatform,
  llamaCppAssetSuffix,
} from "../src/envoy-local-platform.js";
import {
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  resolveEnvoyLocalRuntimeAssets,
} from "../src/envoy-local-manifest.js";

describe("envoy-local-platform", () => {
  it("maps macOS arm64 to Metal runtime asset", () => {
    const platform = { os: "darwin" as const, arch: "arm64" as const, accel: "metal" as const };
    expect(llamaCppAssetSuffix(platform)).toEqual({ runtime: "macos-arm64.tar.gz" });
    expect(buildLlamaCppAssetNames("b10331", platform).runtimeName).toBe(
      "llama-b10331-bin-macos-arm64.tar.gz",
    );
  });

  it("maps Windows CUDA to runtime + cudart zips", () => {
    const platform = { os: "win32" as const, arch: "x64" as const, accel: "cuda" as const };
    const names = buildLlamaCppAssetNames("b10331", platform);
    expect(names.runtimeName).toBe("llama-b10331-bin-win-cuda-12.4-x64.zip");
    expect(names.cudartName).toBe("cudart-llama-bin-win-cuda-12.4-x64.zip");
  });

  it("maps Linux x64 to ubuntu CPU build in v1", () => {
    const platform = { os: "linux" as const, arch: "x64" as const, accel: "cpu" as const };
    expect(buildLlamaCppAssetNames("b10331", platform).runtimeName).toBe(
      "llama-b10331-bin-ubuntu-x64.tar.gz",
    );
  });

  it("honors ENVOYMESH_ENVOY_LOCAL_FORCE_CPU", () => {
    const platform = detectEnvoyLocalPlatform(
      { ENVOYMESH_ENVOY_LOCAL_FORCE_CPU: "1" },
      { hasNvidia: true },
    );
    if (process.platform === "darwin") {
      expect(platform.accel).toBe("metal");
    } else {
      expect(platform.accel).toBe("cpu");
    }
  });

  it("resolves HTTPS download URLs for the pinned tag", () => {
    const assets = resolveEnvoyLocalRuntimeAssets({
      os: "darwin",
      arch: "arm64",
      accel: "metal",
    });
    expect(assets.tag).toBe(ENVOY_LOCAL_LLAMA_CPP_TAG);
    expect(assets.runtimeUrl).toMatch(/^https:\/\/github\.com\/ggml-org\/llama\.cpp\//);
    expect(assets.runtimeUrl).toContain(assets.runtimeName);
  });

  it("pins sha256 digests for all resolved platform assets (fail-closed)", () => {
    const platforms = [
      { os: "darwin" as const, arch: "arm64" as const, accel: "metal" as const },
      { os: "darwin" as const, arch: "x64" as const, accel: "metal" as const },
      { os: "linux" as const, arch: "x64" as const, accel: "cpu" as const },
      { os: "linux" as const, arch: "arm64" as const, accel: "cpu" as const },
      { os: "win32" as const, arch: "x64" as const, accel: "cpu" as const },
      { os: "win32" as const, arch: "x64" as const, accel: "cuda" as const },
      { os: "win32" as const, arch: "arm64" as const, accel: "cpu" as const },
    ];
    for (const platform of platforms) {
      const assets = resolveEnvoyLocalRuntimeAssets(platform);
      expect(assets.runtimeSha256, assets.runtimeName).toMatch(/^[a-f0-9]{64}$/);
      if (assets.cudartName) {
        expect(assets.cudartSha256, assets.cudartName).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });
});
