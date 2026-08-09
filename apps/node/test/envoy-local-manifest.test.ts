import { describe, expect, it } from "vitest";
import {
  assertEnvoyLocalSha256,
  ENVOY_LOCAL_ASSET_SHA256,
  ENVOY_LOCAL_LLAMA_CPP_TAG,
  resolveEnvoyLocalRuntimeAssets,
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
});
