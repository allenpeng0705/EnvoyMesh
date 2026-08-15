/**
 * Curated embedding GGUFs for Envoy Local embed sidecar.
 *
 * Default: Qwen3-Embedding-0.6B Q8_0 — small enough to keep warm on a home
 * node without multi-core idle cost; optional 4B for higher retrieval quality.
 * @see https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF
 */
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import {
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  QWEN3_EMBEDDING_4B_MODEL_ID,
} from "@envoymesh/api";

/**
 * Default embed model (~0.6 GB Q8_0). Auto-downloaded on launch when missing.
 * Use `--pooling last` with llama-server (see envoy-local-embed-runtime).
 *
 * Note: Qwen removed Q4_K_M from the official 0.6B-GGUF repo; only Q8_0 / f16 remain.
 */
export const DEFAULT_ENVOY_LOCAL_EMBED_MODEL: EnvoyLocalCatalogModel = {
  id: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  label: "Qwen3 Embedding 0.6B (Q8_0)",
  description:
    "Default local text embedding for Knowledge RAG — small, keep-warm friendly (~0.6 GB). Independent of chat.",
  fileName: "Qwen3-Embedding-0.6B-Q8_0.gguf",
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf",
  approxBytes: 639_150_592,
  tags: ["embedding", "qwen", "qwen3", "rag", "q8", "tiny", "default"],
  source: "curated",
  family: "qwen3-embedding",
  sizeClass: "0.6b",
  quant: "q8_0",
};

/** Optional larger alternate — stronger retrieval, heavier CPU/RAM when warm. */
export const QWEN3_EMBEDDING_4B_MODEL: EnvoyLocalCatalogModel = {
  id: QWEN3_EMBEDDING_4B_MODEL_ID,
  label: "Qwen3 Embedding 4B (Q4_K_M)",
  description:
    "Higher-quality multilingual embedder (~2.5 GB). Prefer when you need stronger retrieval and can spare CPU/RAM.",
  fileName: "Qwen3-Embedding-4B-Q4_K_M.gguf",
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF/resolve/main/Qwen3-Embedding-4B-Q4_K_M.gguf",
  approxBytes: 2_500_000_000,
  tags: ["embedding", "qwen", "qwen3", "rag", "q4", "multilingual"],
  source: "curated",
  family: "qwen3-embedding",
  sizeClass: "4b",
  quant: "q4_k_m",
};

export const ENVOY_LOCAL_EMBED_CURATED_MODELS: readonly EnvoyLocalCatalogModel[] = [
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL,
  QWEN3_EMBEDDING_4B_MODEL,
];

export function getEnvoyLocalEmbedCatalogModel(
  id: string | undefined,
): EnvoyLocalCatalogModel | undefined {
  if (!id) return undefined;
  return ENVOY_LOCAL_EMBED_CURATED_MODELS.find((m) => m.id === id);
}

export function getEnvoyLocalEmbedCatalogModelByFileName(
  fileName: string | undefined,
): EnvoyLocalCatalogModel | undefined {
  if (!fileName) return undefined;
  const lower = fileName.toLowerCase();
  return ENVOY_LOCAL_EMBED_CURATED_MODELS.find((m) => m.fileName.toLowerCase() === lower);
}

/** llama.cpp pooling for Qwen3-Embedding GGUFs (official docs: `--pooling last`). */
export function embedPoolingForModel(modelId: string | undefined): string {
  if (!modelId) return "last";
  if (modelId.includes("jina")) return "mean";
  if (modelId.includes("nomic")) return "mean";
  return "last";
}
