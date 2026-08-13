/**
 * Curated embedding GGUFs for Envoy Local embed sidecar.
 *
 * Default: Qwen3-Embedding-4B Q4_K_M — strong multilingual text retrieval,
 * official GGUF, llama.cpp `--embedding --pooling last`.
 * @see https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF
 */
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import { DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID } from "@envoymesh/api";

/**
 * Default embed model (~2.5 GB). Auto-downloaded on launch when missing.
 * Use `--pooling last` with llama-server (see envoy-local-embed-runtime).
 */
export const DEFAULT_ENVOY_LOCAL_EMBED_MODEL: EnvoyLocalCatalogModel = {
  id: DEFAULT_ENVOY_LOCAL_EMBED_MODEL_ID,
  label: "Qwen3 Embedding 4B (Q4_K_M)",
  description:
    "Default local text embedding for Knowledge RAG (multilingual, 32k ctx). Independent of chat. ~2.5 GB download.",
  fileName: "Qwen3-Embedding-4B-Q4_K_M.gguf",
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-4B-GGUF/resolve/main/Qwen3-Embedding-4B-Q4_K_M.gguf",
  approxBytes: 2_500_000_000,
  tags: ["embedding", "qwen", "qwen3", "rag", "q4", "multilingual"],
  source: "curated",
  family: "qwen3-embedding",
  sizeClass: "4b",
  quant: "q4_k_m",
};

/** Optional lighter alternate (not default) — keep catalogable for later Settings picker. */
export const QWEN3_EMBEDDING_0_6B_MODEL: EnvoyLocalCatalogModel = {
  id: "qwen3-embedding-0.6b-q4_k_m",
  label: "Qwen3 Embedding 0.6B (Q4_K_M)",
  description: "Smaller Qwen3 embedder — faster download, slightly weaker retrieval than 4B.",
  fileName: "Qwen3-Embedding-0.6B-Q4_K_M.gguf",
  url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q4_K_M.gguf",
  approxBytes: 500_000_000,
  tags: ["embedding", "qwen", "qwen3", "rag", "q4", "tiny"],
  source: "curated",
  family: "qwen3-embedding",
  sizeClass: "0.6b",
  quant: "q4_k_m",
};

export const ENVOY_LOCAL_EMBED_CURATED_MODELS: readonly EnvoyLocalCatalogModel[] = [
  DEFAULT_ENVOY_LOCAL_EMBED_MODEL,
  QWEN3_EMBEDDING_0_6B_MODEL,
];

export function getEnvoyLocalEmbedCatalogModel(
  id: string | undefined,
): EnvoyLocalCatalogModel | undefined {
  if (!id) return undefined;
  return ENVOY_LOCAL_EMBED_CURATED_MODELS.find((m) => m.id === id);
}

/** llama.cpp pooling for Qwen3-Embedding GGUFs (official docs: `--pooling last`). */
export function embedPoolingForModel(modelId: string | undefined): string {
  if (!modelId) return "last";
  if (modelId.includes("jina")) return "mean";
  if (modelId.includes("nomic")) return "mean";
  return "last";
}
