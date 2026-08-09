/**
 * Pinned Envoy Local runtime channel (Phase 54).
 * Assets are never shipped in the app bundle — only downloaded after install.
 */
import type { EnvoyLocalPlatform } from "./envoy-local-platform.js";
import { buildLlamaCppAssetNames } from "./envoy-local-platform.js";

/** Pinned ggml-org/llama.cpp release. Bump intentionally with smoke tests. */
export const ENVOY_LOCAL_LLAMA_CPP_TAG = "b10331";

const RELEASE_BASE =
  `https://github.com/ggml-org/llama.cpp/releases/download/${ENVOY_LOCAL_LLAMA_CPP_TAG}`;

/**
 * Expected sha256 (hex) per asset basename — from GitHub Releases `digest`
 * for tag {@link ENVOY_LOCAL_LLAMA_CPP_TAG} (fail closed on mismatch).
 */
export const ENVOY_LOCAL_ASSET_SHA256: Record<string, string> = {
  "llama-b10331-bin-macos-arm64.tar.gz":
    "b1e0fd9895e4601e697563c5e0ac391a81910fcc7042597bb11b13a622a746af",
  "llama-b10331-bin-macos-x64.tar.gz":
    "4974283f41924d66b98b9f3a877b1b283aef007d185cccf524a4a1f22cacba3e",
  "llama-b10331-bin-ubuntu-x64.tar.gz":
    "9984060517edf7c2436991d8f635804586530b4642490fd4afc61ffad1d9f638",
  "llama-b10331-bin-ubuntu-arm64.tar.gz":
    "b4330d32023f721fa290d80f48c56b9f4691674af8712fd0ef4c93ab2e81d71b",
  "llama-b10331-bin-win-cpu-x64.zip":
    "defec84d389193c87aa3038d2bd6b8cb7ee0c2afcabfe04fcd069343f828e848",
  "llama-b10331-bin-win-cpu-arm64.zip":
    "58249dd20fe4b4bda186c17f093f45d1310ac8ce98c046fe2b8fa5c43b85f08d",
  "llama-b10331-bin-win-cuda-12.4-x64.zip":
    "77eaf749ea4af9ff72ce989e56e9df9ca173f36189ea25d9633b33998f4f1e21",
  "cudart-llama-bin-win-cuda-12.4-x64.zip":
    "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
};

export interface ResolvedEnvoyLocalRuntimeAssets {
  tag: string;
  runtimeUrl: string;
  runtimeName: string;
  runtimeSha256?: string;
  cudartUrl?: string;
  cudartName?: string;
  cudartSha256?: string;
}

export function resolveEnvoyLocalRuntimeAssets(
  platform: EnvoyLocalPlatform,
  tag: string = ENVOY_LOCAL_LLAMA_CPP_TAG,
): ResolvedEnvoyLocalRuntimeAssets {
  const names = buildLlamaCppAssetNames(tag, platform);
  const base =
    tag === ENVOY_LOCAL_LLAMA_CPP_TAG
      ? RELEASE_BASE
      : `https://github.com/ggml-org/llama.cpp/releases/download/${tag}`;
  const runtimeSha = ENVOY_LOCAL_ASSET_SHA256[names.runtimeName];
  const cudartSha = names.cudartName
    ? ENVOY_LOCAL_ASSET_SHA256[names.cudartName]
    : undefined;
  return {
    tag,
    runtimeUrl: `${base}/${names.runtimeName}`,
    runtimeName: names.runtimeName,
    ...(runtimeSha ? { runtimeSha256: runtimeSha } : {}),
    ...(names.cudartName
      ? {
          cudartUrl: `${base}/${names.cudartName}`,
          cudartName: names.cudartName,
          ...(cudartSha ? { cudartSha256: cudartSha } : {}),
        }
      : {}),
  };
}

/** Minimum free disk before starting a runtime+model download (~800 MB). */
export const ENVOY_LOCAL_MIN_FREE_BYTES = 800 * 1024 * 1024;

/** Reject tiny/corrupt archives. */
export const ENVOY_LOCAL_MIN_RUNTIME_ARCHIVE_BYTES = 1_000_000;
export const ENVOY_LOCAL_MIN_MODEL_BYTES = 50_000_000;

/** Fail closed when expected digest is set and actual differs. */
export function assertEnvoyLocalSha256(
  actualHex: string,
  expectedHex: string,
  label: string,
): void {
  const a = actualHex.trim().toLowerCase();
  const e = expectedHex.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(e)) {
    throw new Error(`Invalid expected sha256 for ${label}`);
  }
  if (a !== e) {
    throw new Error(
      `Checksum mismatch for ${label} (expected ${e.slice(0, 12)}…, got ${a.slice(0, 12)}…)`,
    );
  }
}
