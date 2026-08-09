/**
 * Platform / accelerator detection and llama.cpp release asset naming (Phase 54).
 */
import { execFileSync } from "node:child_process";
import type { EnvoyLocalAccel } from "@envoymesh/api";

export type EnvoyLocalOs = "darwin" | "win32" | "linux";
export type EnvoyLocalArch = "x64" | "arm64";

export interface EnvoyLocalPlatform {
  os: EnvoyLocalOs;
  arch: EnvoyLocalArch;
  accel: EnvoyLocalAccel;
}

export function detectEnvoyLocalPlatform(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { hasNvidia?: boolean },
): EnvoyLocalPlatform {
  const osRaw = process.platform;
  const os: EnvoyLocalOs =
    osRaw === "darwin" || osRaw === "win32" || osRaw === "linux" ? osRaw : "linux";
  const arch: EnvoyLocalArch = process.arch === "arm64" ? "arm64" : "x64";

  if (os === "darwin") {
    return { os, arch, accel: "metal" };
  }

  const forceCpu = env.ENVOYMESH_ENVOY_LOCAL_FORCE_CPU === "1";
  if (forceCpu) {
    return { os, arch, accel: "cpu" };
  }

  const hasNvidia = opts?.hasNvidia ?? detectNvidiaGpu();
  if (hasNvidia && (os === "win32" || os === "linux") && arch === "x64") {
    return { os, arch, accel: "cuda" };
  }
  return { os, arch, accel: "cpu" };
}

export function detectNvidiaGpu(): boolean {
  try {
    execFileSync("nvidia-smi", ["-L"], {
      stdio: "ignore",
      timeout: 3_000,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Map platform → ggml-org/llama.cpp release asset basename (without tag prefix).
 * Full name: `llama-${tag}-bin-${suffix}` or cudart companion.
 */
export function llamaCppAssetSuffix(platform: EnvoyLocalPlatform): {
  runtime: string;
  cudart?: string;
} {
  const { os, arch, accel } = platform;
  if (os === "darwin" && arch === "arm64") {
    return { runtime: "macos-arm64.tar.gz" };
  }
  if (os === "darwin" && arch === "x64") {
    return { runtime: "macos-x64.tar.gz" };
  }
  if (os === "win32" && arch === "x64" && accel === "cuda") {
    return {
      runtime: "win-cuda-12.4-x64.zip",
      cudart: "cudart-llama-bin-win-cuda-12.4-x64.zip",
    };
  }
  if (os === "win32" && arch === "x64") {
    return { runtime: "win-cpu-x64.zip" };
  }
  if (os === "win32" && arch === "arm64") {
    return { runtime: "win-cpu-arm64.zip" };
  }
  if (os === "linux" && arch === "x64") {
    // Official CUDA linux zips vary; ship CPU ubuntu build for v1 (reliable).
    return { runtime: "ubuntu-x64.tar.gz" };
  }
  if (os === "linux" && arch === "arm64") {
    return { runtime: "ubuntu-arm64.tar.gz" };
  }
  return { runtime: "ubuntu-x64.tar.gz" };
}

export function buildLlamaCppAssetNames(
  tag: string,
  platform: EnvoyLocalPlatform,
): { runtimeName: string; cudartName?: string } {
  const suffix = llamaCppAssetSuffix(platform);
  const runtimeName = `llama-${tag}-bin-${suffix.runtime}`;
  return {
    runtimeName,
    ...(suffix.cudart ? { cudartName: suffix.cudart } : {}),
  };
}

/**
 * Fallback tiny GGUF when hardware budget is low.
 * First-enable normally uses {@link recommendEnvoyLocalModel} (often 4B/9B).
 */
export const DEFAULT_ENVOY_LOCAL_MODEL = {
  id: "qwen3.5-0.8b-q4_k_m",
  fileName: "Qwen3.5-0.8B-Q4_K_M.gguf",
  /** Canonical Hugging Face resolve URL — China uses ModelScope / hf-mirror. */
  url: "https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf",
} as const;
