import { describe, expect, it } from "vitest";
import {
  assertEnvoyLocalSha256,
  ENVOY_LOCAL_ASSET_SHA256,
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  resolveEnvoyLocalRuntimeAssets,
  resolveStartupTimeoutMs,
} from "../src/envoy-local-manifest.js";

describe("envoy-local-manifest", () => {
  it("fail-closes on checksum mismatch", () => {
    expect(() =>
      assertEnvoyLocalSha256(
        "a".repeat(64),
        "b".repeat(64),
        "test.bin",
      ),
    ).toThrow(/Checksum mismatch/);
  });

  it("accepts matching digests", () => {
    const dig = "c".repeat(64);
    expect(() => assertEnvoyLocalSha256(dig, dig, "ok.bin")).not.toThrow();
  });

  it("pins sha256 for the Windows CUDA + cudart pair", () => {
    const assets = resolveEnvoyLocalRuntimeAssets({
      os: "win32",
      arch: "x64",
      accel: "cuda",
    });
    expect(assets.tag).toBe(ENVOY_LOCAL_LLAMA_CPP_TAG);
    expect(assets.runtimeSha256).toBe(
      ENVOY_LOCAL_ASSET_SHA256[assets.runtimeName],
    );
    expect(assets.cudartSha256).toBe(
      ENVOY_LOCAL_ASSET_SHA256[assets.cudartName!],
    );
  });

  describe("resolveStartupTimeoutMs", () => {
    it("uses 30s for tiny models (0.8B Q4_K_M ≈ 500 MB)", () => {
      expect(resolveStartupTimeoutMs(undefined, 532_000_000)).toBe(30_000);
      expect(resolveStartupTimeoutMs({}, 100_000_000)).toBe(30_000);
    });

    it("uses 60s for small models (2B-3B Q4_K_M, 1.3-2.0 GB)", () => {
      expect(resolveStartupTimeoutMs(undefined, 1_280_000_000)).toBe(60_000);
      expect(resolveStartupTimeoutMs(undefined, 2_000_000_000)).toBe(60_000);
    });

    it("uses 120s for medium models (4B Q4_K_M ≈ 2.7 GB; Gemma E2B ≈ 3.5 GB)", () => {
      expect(resolveStartupTimeoutMs(undefined, 2_740_000_000)).toBe(120_000);
      expect(resolveStartupTimeoutMs(undefined, 3_500_000_000)).toBe(120_000);
    });

    it("uses 480s for large models (9B ≈ 5.5–5.7 GB; Gemma E4B ≈ 5.4 GB)", () => {
      expect(resolveStartupTimeoutMs(undefined, 5_400_000_000)).toBe(480_000);
      expect(resolveStartupTimeoutMs(undefined, 5_500_000_000)).toBe(480_000);
      expect(resolveStartupTimeoutMs(undefined, 5_700_000_000)).toBe(480_000);
      expect(resolveStartupTimeoutMs(undefined, 7_000_000_000)).toBe(480_000);
    });

    it("uses 600s for very large models (≥ 8 GB)", () => {
      expect(resolveStartupTimeoutMs(undefined, 8_000_000_000)).toBe(600_000);
    });

    it("user override beats the size-based default", () => {
      // Tiny model, but user wants the full 240s for slow disks
      expect(
        resolveStartupTimeoutMs({ startupTimeoutMs: 240_000 }, 100_000_000),
      ).toBe(240_000);
      // Large model, user tightens to 30s
      expect(
        resolveStartupTimeoutMs({ startupTimeoutMs: 30_000 }, 5_500_000_000),
      ).toBe(30_000);
    });

    it("ignores non-positive user values (falls back to size default)", () => {
      expect(resolveStartupTimeoutMs({ startupTimeoutMs: 0 }, 5_500_000_000)).toBe(480_000);
      expect(resolveStartupTimeoutMs({ startupTimeoutMs: -1 }, 2_740_000_000)).toBe(120_000);
    });
  });
});
