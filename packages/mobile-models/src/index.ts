/**
 * Mobile Models — Lightweight local model runtime for Capacitor mobile app.
 *
 * Supports offline-first AI: draft replies, summarize documents, and answer
 * knowledge queries without internet. Falls back to home node when local
 * model is unavailable or needs stronger reasoning.
 *
 * Architecture:
 *   - ONNX Runtime or llama.cpp bindings for inference
 *   - Model selection based on device capability (RAM, CPU cores)
 *   - Quantized models (~500MB-2GB) for mobile-friendly sizes
 *   - Streaming token output for responsive UX
 */

export interface MobileModelConfig {
  /** Path to model file (ONNX or GGUF). */
  modelPath: string;
  /** Model type for inference backend selection. */
  modelType: "llama" | "mistral" | "gemma" | "phi";
  /** Maximum tokens to generate per response. */
  maxTokens: number;
  /** Temperature for generation (0.0–2.0). */
  temperature: number;
  /** Top-p sampling value. */
  topP: number;
}

export interface MobileModelInfo {
  /** Whether a local model is available and loaded. */
  available: boolean;
  /** Model name / identifier. */
  modelName: string;
  /** Estimated RAM usage in MB. */
  ramUsageMb: number;
  /** Whether the model supports streaming. */
  supportsStreaming: boolean;
}

export interface MobileModelDeps {
  /** Check device capability (RAM, CPU) for model suitability. */
  getDeviceCapability: () => Promise<{ ramMb: number; cpuCores: number }>;
  /** Check if a model file exists at the given path. */
  fileExists: (path: string) => Promise<boolean>;
  /** Download a model from a URL. */
  downloadModel: (url: string, destPath: string) => Promise<void>;
}

/** Default URLs for recommended small quantized models. */
export const DEFAULT_SMALL_MODEL_URLS: Record<string, string> = {
  "llama-3.2-1b": "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  "gemma-2b": "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf",
};

/**
 * Select the best model for the device based on available RAM.
 *
 * Tiers:
 *  - < 2 GB:   no model — fall back to home node
 *  - 2-4 GB:   TinyLlama 1.1B Q4 (≈ 600 MB)
 *  - 4 GB+:    Llama 3.2 1B Q4 (≈ 1.2 GB)
 */
export async function selectBestModel(
  deps: MobileModelDeps,
): Promise<MobileModelConfig | null> {
  const cap = await deps.getDeviceCapability();

  if (cap.ramMb < 2000) {
    // Not enough RAM for any model — fall back to home node.
    return null;
  }

  if (cap.ramMb >= 4000) {
    return {
      modelPath: "models/llama-3.2-1b-q4.gguf",
      modelType: "llama",
      maxTokens: 512,
      temperature: 0.7,
      topP: 0.9,
    };
  }

  // 2-4 GB tier: TinyLlama fits comfortably and still produces useful summaries.
  return {
    modelPath: "models/tinyllama-1.1b-q4.gguf",
    modelType: "llama",
    maxTokens: 256,
    temperature: 0.7,
    topP: 0.9,
  };
}

/**
 * Check if a local model is available and report its capabilities.
 */
export async function getMobileModelInfo(
  deps: MobileModelDeps,
  modelPath: string,
): Promise<MobileModelInfo> {
  const exists = await deps.fileExists(modelPath);
  if (!exists) {
    return { available: false, modelName: "", ramUsageMb: 0, supportsStreaming: false };
  }

  return {
    available: true,
    modelName: modelPath.includes("tinyllama")
      ? "TinyLlama 1.1B (Q4)"
      : "Llama 3.2 1B (Q4)",
    ramUsageMb: modelPath.includes("tinyllama") ? 600 : 1200,
    supportsStreaming: true,
  };
}

/**
 * Generate text using the local model.
 *
 * **Stub status:** ONNX Runtime / llama.cpp bindings are not yet integrated,
 * so this function always falls back to the home node. The signature is
 * stable; once the bindings land, only the body needs to change. Callers
 * should treat the result as best-effort local inference and expect the
 * fallback to fire until the integrations ship.
 */
export async function generateWithFallback(
  _deps: MobileModelDeps,
  config: MobileModelConfig,
  prompt: string,
  fallbackGenerate: (prompt: string) => Promise<string>,
): Promise<string> {
  const exists = await _deps.fileExists(config.modelPath);
  if (!exists) {
    // Model not downloaded yet — fall back to home node.
    return fallbackGenerate(prompt);
  }

  // TODO: Integrate ONNX Runtime / llama.cpp bindings.
  // For now, always fall back to home node even when the model is on disk.
  return fallbackGenerate(prompt);
}
