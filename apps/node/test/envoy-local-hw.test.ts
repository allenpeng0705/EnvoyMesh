import { describe, expect, it } from "vitest";
import {
  detectEnvoyLocalHardware,
  ENVOY_LOCAL_MODEL_TIER_IDS,
  recommendEnvoyLocalModel,
} from "../src/envoy-local-hw.js";

const GB = 1024 * 1024 * 1024;

describe("envoy-local-hw", () => {
  it("uses unified RAM on Metal and recommends 4B around 16 GB with Gemma options", () => {
    const hw = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 16 * GB },
    );
    expect(hw.summary).toMatch(/Metal/);
    const rec = recommendEnvoyLocalModel(hw);
    expect(rec.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE2b);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE4b);
  });

  it("recommends 9B on large Metal machines and includes Gemma E4B", () => {
    const hw = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 36 * GB },
    );
    const rec = recommendEnvoyLocalModel(hw);
    expect(rec.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE4b);
  });

  it("recommends 2B on mid-low Metal and tiny when very tight", () => {
    const mid = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 6 * GB },
    );
    expect(recommendEnvoyLocalModel(mid).modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.qwen2b);
    const tinyHw = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 4 * GB },
    );
    expect(recommendEnvoyLocalModel(tinyHw).modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.tiny);
  });

  it("uses CUDA VRAM when provided", () => {
    const hw = detectEnvoyLocalHardware(
      { os: "win32", arch: "x64", accel: "cuda" },
      { systemRamBytes: 32 * GB, gpuVramBytes: 12 * GB },
    );
    expect(hw.effectiveMemoryBytes).toBe(12 * GB);
    expect(recommendEnvoyLocalModel(hw).modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
  });

  it("recommends 2B or 4B on CPU with enough RAM (not only 0.8B)", () => {
    const sixteen = detectEnvoyLocalHardware(
      { os: "linux", arch: "x64", accel: "cpu" },
      { systemRamBytes: 16 * GB },
    );
    // effective ≈ 0.75 * 16 = 12 GB → 2B primary
    const rec16 = recommendEnvoyLocalModel(sixteen);
    expect(rec16.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.qwen2b);
    expect(rec16.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.small);
    expect(rec16.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE2b);

    const thirtyTwo = detectEnvoyLocalHardware(
      { os: "linux", arch: "x64", accel: "cpu" },
      { systemRamBytes: 32 * GB },
    );
    const rec32 = recommendEnvoyLocalModel(thirtyTwo);
    expect(rec32.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
    expect(rec32.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE4b);
  });
});
