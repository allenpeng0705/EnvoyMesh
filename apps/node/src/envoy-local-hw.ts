/**
 * Hardware probe + model recommendation for Envoy Local (Phase 54).
 * Picks a curated edge GGUF from RAM / GPU rather than always using the tiny default.
 * Also surfaces size-matched Gemma 4 options alongside Qwen3.5.
 */
import { execFileSync } from "node:child_process";
import { totalmem } from "node:os";
import type { EnvoyLocalAccel } from "@envoymesh/api";
import type { EnvoyLocalPlatform } from "./envoy-local-platform.js";
import { DEFAULT_ENVOY_LOCAL_MODEL } from "./envoy-local-platform.js";

/** Curated model ids used by the recommender (must exist in the catalog). */
export const ENVOY_LOCAL_MODEL_TIER_IDS = {
  tiny: DEFAULT_ENVOY_LOCAL_MODEL.id, // Qwen3.5 0.8B
  qwen2b: "qwen3.5-2b-q4_k_m",
  small: "qwen3.5-4b-q4_k_m",
  medium: "qwen3.5-9b-q4_k_m",
  gemmaE2b: "gemma-4-e2b-it-q4_k_m",
  gemmaE4b: "gemma-4-e4b-it-q4_k_m",
} as const;

export interface EnvoyLocalHardwareInfo {
  accel: EnvoyLocalAccel;
  /** System RAM bytes (`os.totalmem`). */
  systemRamBytes: number;
  /** NVIDIA VRAM bytes when detectable; else undefined. */
  gpuVramBytes?: number;
  /**
   * Memory budget used for sizing (unified RAM on Metal; VRAM on CUDA when known;
   * otherwise a large fraction of system RAM on CPU).
   */
  effectiveMemoryBytes: number;
  /** Short label for Settings, e.g. "Metal · 36 GB unified". */
  summary: string;
}

export interface EnvoyLocalModelRecommendation {
  /** Primary model to download on first enable (Qwen tier). */
  modelId: string;
  /** Other curated ids that also fit (Qwen alternates + Gemma). */
  alsoRecommendedModelIds: string[];
  reason: string;
  hardware: EnvoyLocalHardwareInfo;
}

export function detectNvidiaVramBytes(): number | undefined {
  try {
    const out = execFileSync(
      "nvidia-smi",
      ["--query-gpu=memory.total", "--format=csv,noheader,nounits"],
      { encoding: "utf8", timeout: 3_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    const first = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!first) return undefined;
    const mib = Number(first);
    if (!Number.isFinite(mib) || mib <= 0) return undefined;
    return Math.round(mib * 1024 * 1024);
  } catch {
    return undefined;
  }
}

export function detectEnvoyLocalHardware(
  platform: EnvoyLocalPlatform,
  opts?: { systemRamBytes?: number; gpuVramBytes?: number | null },
): EnvoyLocalHardwareInfo {
  const systemRamBytes = opts?.systemRamBytes ?? totalmem();
  const gpuVramBytes =
    opts?.gpuVramBytes === null
      ? undefined
      : (opts?.gpuVramBytes ??
        (platform.accel === "cuda" ? detectNvidiaVramBytes() : undefined));

  let effectiveMemoryBytes: number;
  let summary: string;
  const ramGb = formatGb(systemRamBytes);

  if (platform.accel === "metal") {
    effectiveMemoryBytes = systemRamBytes;
    summary = `Metal · ${ramGb} GB unified`;
  } else if (platform.accel === "cuda") {
    if (gpuVramBytes && gpuVramBytes > 0) {
      effectiveMemoryBytes = gpuVramBytes;
      summary = `CUDA · ${formatGb(gpuVramBytes)} GB VRAM · ${ramGb} GB RAM`;
    } else {
      effectiveMemoryBytes = Math.min(systemRamBytes, 8 * GB);
      summary = `CUDA · VRAM unknown · ${ramGb} GB RAM`;
    }
  } else {
    // CPU: most of RAM is usable; leave ~25% for OS + EnvoyMesh.
    effectiveMemoryBytes = Math.floor(systemRamBytes * 0.75);
    summary = `CPU · ${ramGb} GB RAM`;
  }

  return {
    accel: platform.accel,
    systemRamBytes,
    ...(gpuVramBytes != null ? { gpuVramBytes } : {}),
    effectiveMemoryBytes,
    summary,
  };
}

const GB = 1024 * 1024 * 1024;

function formatGb(bytes: number): string {
  return String(Math.round((bytes / GB) * 10) / 10);
}

function also(...ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Pick curated edge models from effective memory.
 *
 * Primary download stays Qwen3.5; Gemma 4 E2B/E4B are listed as also-fits
 * (need `--chat-template gemma` — already set on catalog entries).
 *
 * Rough Q4_K_M working set:
 * - 0.8B ≈ 2–3 GB · 2B ≈ 4–5 GB · 4B ≈ 6–8 GB · 9B / Gemma E4B ≈ 12–14 GB
 */
export function recommendEnvoyLocalModel(
  hardware: EnvoyLocalHardwareInfo,
): EnvoyLocalModelRecommendation {
  const mem = hardware.effectiveMemoryBytes;
  const { tiny, qwen2b, small, medium, gemmaE2b, gemmaE4b } = ENVOY_LOCAL_MODEL_TIER_IDS;
  const isAccel = hardware.accel === "metal" || hardware.accel === "cuda";

  if (isAccel) {
    if (mem >= 24 * GB) {
      return {
        modelId: medium,
        alsoRecommendedModelIds: also(small, gemmaE4b, gemmaE2b),
        reason: `${hardware.summary} — recommending Qwen3.5 9B; 4B and Gemma 4 also fit.`,
        hardware,
      };
    }
    if (mem >= 14 * GB) {
      return {
        modelId: small,
        alsoRecommendedModelIds: also(medium, gemmaE4b, gemmaE2b, qwen2b),
        reason: `${hardware.summary} — recommending Qwen3.5 4B; 9B and Gemma 4 E2B/E4B also fit.`,
        hardware,
      };
    }
    if (mem >= 8 * GB) {
      return {
        modelId: small,
        alsoRecommendedModelIds: also(qwen2b, gemmaE2b, tiny),
        reason: `${hardware.summary} — recommending Qwen3.5 4B; 2B and Gemma 4 E2B also fit.`,
        hardware,
      };
    }
    if (mem >= 5 * GB) {
      return {
        modelId: qwen2b,
        alsoRecommendedModelIds: also(tiny, gemmaE2b),
        reason: `${hardware.summary} — recommending Qwen3.5 2B; tiny and Gemma 4 E2B also fit.`,
        hardware,
      };
    }
    return {
      modelId: tiny,
      alsoRecommendedModelIds: also(qwen2b),
      reason: `${hardware.summary} — recommending tiny Qwen3.5 0.8B.`,
      hardware,
    };
  }

  // CPU-only — 2B / 4B are fine when RAM allows (slower, still usable).
  if (mem >= 18 * GB) {
    return {
      modelId: small,
      alsoRecommendedModelIds: also(qwen2b, gemmaE2b, gemmaE4b, tiny),
      reason: `${hardware.summary} — recommending Qwen3.5 4B on CPU; 2B and Gemma 4 also fit.`,
      hardware,
    };
  }
  if (mem >= 10 * GB) {
    return {
      modelId: qwen2b,
      alsoRecommendedModelIds: also(small, gemmaE2b, tiny),
      reason: `${hardware.summary} — recommending Qwen3.5 2B on CPU; 4B and Gemma 4 E2B also fit.`,
      hardware,
    };
  }
  if (mem >= 6 * GB) {
    return {
      modelId: qwen2b,
      alsoRecommendedModelIds: also(tiny, gemmaE2b),
      reason: `${hardware.summary} — recommending Qwen3.5 2B on CPU.`,
      hardware,
    };
  }
  return {
    modelId: tiny,
    alsoRecommendedModelIds: also(qwen2b),
    reason: `${hardware.summary} — recommending tiny Qwen3.5 0.8B on CPU.`,
    hardware,
  };
}
