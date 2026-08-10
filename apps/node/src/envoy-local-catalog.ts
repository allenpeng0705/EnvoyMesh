/**
 * Curated Envoy Local GGUF catalog (Phase 54).
 * Models are never packaged — URLs point at post-install HTTPS downloads.
 *
 * Canonical `url` is Hugging Face. China resolves via ModelScope + hf-mirror
 * (see envoy-local-mirrors.ts). Live Hub search: envoy-local-hf.ts.
 *
 * Edge families (current):
 * - Qwen3.5 (0.8B / 2B / 4B / 9B) — first-enable pick is hardware-recommended
 * - Gemma 4 (E2B / E4B) — also recommended alongside Qwen by RAM tier
 * - Llama 3.2 dense (Llama 4 MoE is not edge-sized — labeled clearly)
 * Qwen3.6+ via Hugging Face search until promoted here with `supersedes`.
 */
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import { DEFAULT_ENVOY_LOCAL_MODEL } from "./envoy-local-platform.js";
import {
  detectEnvoyLocalModelRegion,
  withPreferredModelDownloadUrl,
} from "./envoy-local-mirrors.js";

/**
 * Edge instruct allowlist shown with empty search.
 * Non-empty search also queries Hugging Face (see envoy-local-hf.ts).
 */
export const ENVOY_LOCAL_CURATED_MODELS: readonly EnvoyLocalCatalogModel[] = [
  {
    id: DEFAULT_ENVOY_LOCAL_MODEL.id,
    label: "Qwen3.5 0.8B (Q4_K_M)",
    description:
      "Tiny Qwen3.5 — for low-RAM / CPU-only machines. First-enable usually picks a larger tier.",
    fileName: DEFAULT_ENVOY_LOCAL_MODEL.fileName,
    url: DEFAULT_ENVOY_LOCAL_MODEL.url,
    approxBytes: 532_000_000,
    tags: ["qwen", "qwen3.5", "0.8b", "instruct", "q4", "edge", "tiny"],
    source: "curated",
    family: "qwen3.5",
    sizeClass: "0.8b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-2b-q4_k_m",
    label: "Qwen3.5 2B (Q4_K_M)",
    description: "Qwen3.5 2B Q4 — good CPU / mid-RAM pick between tiny and 4B.",
    fileName: "Qwen3.5-2B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
    approxBytes: 1_280_000_000,
    tags: ["qwen", "qwen3.5", "2b", "instruct", "q4", "edge", "cpu"],
    source: "curated",
    family: "qwen3.5",
    sizeClass: "2b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-4b-q4_k_m",
    label: "Qwen3.5 4B (Q4_K_M)",
    description: "Qwen3.5 4B Q4 — typical pick for 14–24 GB Metal/CUDA and strong CPU boxes.",
    fileName: "Qwen3.5-4B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
    approxBytes: 2_740_000_000,
    tags: ["qwen", "qwen3.5", "4b", "instruct", "q4", "edge"],
    source: "curated",
    family: "qwen3.5",
    sizeClass: "4b",
    quant: "q4_k_m",
  },
  {
    id: "qwen3.5-9b-q4_k_m",
    label: "Qwen3.5 9B (Q4_K_M)",
    description:
      "Qwen3.5 9B Q4 — mid tier when you have ~24 GB+ unified/VRAM (no official 7B).",
    fileName: "Qwen3.5-9B-Q4_K_M.gguf",
    url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf",
    approxBytes: 5_500_000_000,
    tags: ["qwen", "qwen3.5", "9b", "7b", "instruct", "q4", "edge"],
    source: "curated",
    family: "qwen3.5",
    sizeClass: "9b",
    quant: "q4_k_m",
  },
  {
    id: "gemma-4-e2b-it-q4_k_m",
    label: "Gemma 4 E2B IT (Q4_K_M)",
    description:
      "Google Gemma 4 E2B instruction-tuned — compact Gemma 4 (~2B-class). Recommended alongside Qwen when RAM fits.",
    fileName: "google_gemma-4-E2B-it-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_K_M.gguf",
    approxBytes: 3_500_000_000,
    chatTemplate: "gemma",
    tags: ["gemma", "gemma4", "e2b", "2b", "instruct", "q4", "edge"],
    source: "curated",
    family: "gemma4",
    sizeClass: "e2b",
    quant: "q4_k_m",
  },
  {
    id: "gemma-4-e4b-it-q4_k_m",
    label: "Gemma 4 E4B IT (Q4_K_M)",
    description:
      "Google Gemma 4 E4B instruction-tuned — stronger Gemma 4 (~4B-class). Recommended on larger machines.",
    fileName: "google_gemma-4-E4B-it-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/google_gemma-4-E4B-it-GGUF/resolve/main/google_gemma-4-E4B-it-Q4_K_M.gguf",
    approxBytes: 5_400_000_000,
    chatTemplate: "gemma",
    tags: ["gemma", "gemma4", "e4b", "4b", "instruct", "q4", "edge"],
    source: "curated",
    family: "gemma4",
    sizeClass: "e4b",
    quant: "q4_k_m",
  },
  {
    id: "llama-3.2-3b-instruct-q4_k_m",
    label: "Llama 3.2 3B Instruct (Q4_K_M)",
    description:
      "Meta Llama 3.2 dense 3B — clear edge Llama. (Llama 4 is MoE / not edge-sized.)",
    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    approxBytes: 2_000_000_000,
    tags: ["llama", "llama3.2", "3b", "instruct", "q4", "edge"],
    source: "curated",
    family: "llama3.2",
    sizeClass: "3b",
    quant: "q4_k_m",
  },
];

export function getEnvoyLocalCatalogModel(
  modelId: string,
): EnvoyLocalCatalogModel | undefined {
  const id = modelId.trim();
  const raw = ENVOY_LOCAL_CURATED_MODELS.find((m) => m.id === id);
  if (!raw) return undefined;
  return withPreferredModelDownloadUrl(raw, detectEnvoyLocalModelRegion());
}

/** Raw catalog entry (canonical HF url) — for download failover lists. */
export function getEnvoyLocalCatalogModelRaw(
  modelId: string,
): EnvoyLocalCatalogModel | undefined {
  const id = modelId.trim();
  return ENVOY_LOCAL_CURATED_MODELS.find((m) => m.id === id);
}

/** Match a dropped/downloaded file basename to a curated catalog entry. */
export function getEnvoyLocalCatalogModelByFileName(
  fileName: string,
): EnvoyLocalCatalogModel | undefined {
  const name = fileName.trim().toLowerCase();
  if (!name) return undefined;
  return ENVOY_LOCAL_CURATED_MODELS.find((m) => m.fileName.toLowerCase() === name);
}

/**
 * First catalog entry that lists `installedId` in `supersedes`
 * (explicit succession — not Hub version guessing).
 */
export function findCuratedSuccessorIn(
  installedId: string,
  catalog: readonly EnvoyLocalCatalogModel[],
): EnvoyLocalCatalogModel | undefined {
  const id = installedId.trim();
  if (!id) return undefined;
  return catalog.find((m) => (m.supersedes ?? []).includes(id));
}

/** Successor from the shipped curated allowlist. */
export function findCuratedSuccessor(
  installedId: string,
): EnvoyLocalCatalogModel | undefined {
  return findCuratedSuccessorIn(installedId, ENVOY_LOCAL_CURATED_MODELS);
}

export function searchEnvoyLocalCatalog(
  query?: string,
): EnvoyLocalCatalogModel[] {
  const region = detectEnvoyLocalModelRegion();
  const q = (query ?? "").trim().toLowerCase();
  const list = !q
    ? [...ENVOY_LOCAL_CURATED_MODELS]
    : ENVOY_LOCAL_CURATED_MODELS.filter((m) => {
        const hay = [
          m.id,
          m.label,
          m.description,
          m.fileName,
          m.family ?? "",
          m.sizeClass ?? "",
          m.quant ?? "",
          ...m.tags,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  return list.map((m) => ({
    ...withPreferredModelDownloadUrl(m, region),
    source: "curated" as const,
  }));
}
