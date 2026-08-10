import { describe, expect, it } from "vitest";
import {
  detectEnvoyLocalHardware,
  ENVOY_LOCAL_MODEL_TIER_IDS,
  recommendEnvoyLocalModel,
} from "../src/envoy-local-hw.js";

const GB = 1024 * 1024 * 1024;

describe("envoy-local-hw", () => {
  it("uses unified RAM on Metal and recommends 4B around 16 GB with Gemma options", () => {
    // 16 GB unified is in the 14 GB+ tier → 4B primary, 9B listed as
    // tight (not a free fit). The previous 24 GB threshold was unsafe
    // because 9B working set + KV cache + OS overhead needs > 20 GB.
    const hw = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 16 * GB },
    );
    expect(hw.summary).toMatch(/Metal/);
    const rec = recommendEnvoyLocalModel(hw);
    expect(rec.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
    expect(rec.reason).toMatch(/9B.*may be tight/i);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE2b);
    expect(rec.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE4b);
  });

  it("recommends 9B on 32+ GB Metal/CUDA (refined from the old 24 GB threshold)", () => {
    const metal = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 36 * GB },
    );
    const recMetal = recommendEnvoyLocalModel(metal);
    expect(recMetal.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
    expect(recMetal.alsoRecommendedModelIds).toContain(ENVOY_LOCAL_MODEL_TIER_IDS.gemmaE4b);

    // 24 GB unified is no longer enough for 9B as primary (was the old
    // pre-fix threshold). This is the regression guard — 24 GB M2 Max with
    // other apps open would OOM with 9B as primary.
    const mid = detectEnvoyLocalHardware(
      { os: "darwin", arch: "arm64", accel: "metal" },
      { systemRamBytes: 24 * GB },
    );
    const recMid = recommendEnvoyLocalModel(mid);
    expect(recMid.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
    expect(recMid.modelId).not.toBe(ENVOY_LOCAL_MODEL_TIER_IDS.medium);

    // CUDA dedicated VRAM: 24 GB is fine (no OS overhead). RTX 4090.
    const cuda = detectEnvoyLocalHardware(
      { os: "win32", arch: "x64", accel: "cuda" },
      { systemRamBytes: 64 * GB, gpuVramBytes: 24 * GB },
    );
    expect(recommendEnvoyLocalModel(cuda).modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
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

  it("never recommends 9B on CPU regardless of RAM (interactive chat too slow)", () => {
    // Even 64 GB of RAM shouldn't push 9B on CPU as primary — the bottleneck
    // is compute, not memory. Users on CPU get 4B max.
    const huge = detectEnvoyLocalHardware(
      { os: "linux", arch: "x64", accel: "cpu" },
      { systemRamBytes: 128 * GB },
    );
    const rec = recommendEnvoyLocalModel(huge);
    expect(rec.modelId).not.toBe(ENVOY_LOCAL_MODEL_TIER_IDS.medium);
    expect(rec.modelId).toBe(ENVOY_LOCAL_MODEL_TIER_IDS.small);
  });
});
