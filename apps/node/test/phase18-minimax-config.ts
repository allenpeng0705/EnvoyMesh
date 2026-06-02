/**
 * Resolve live MiniMax (openai-compatible) model config for Phase 18 E2E tests.
 * Precedence: process.env ENVOY_MODEL_* → repo .env → apps/node/data/default/node-config.json
 */
import type { ModelProviderConfig } from "@envoymesh/api";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripJsonComments } from "../src/node-config-store.js";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TEST_DIR, "../../..");
const DOT_ENV_PATH = join(REPO_ROOT, ".env");
const DEFAULT_NODE_CONFIG = join(REPO_ROOT, "apps/node/data/default/node-config.json");

let dotEnvLoaded = false;

function loadDotEnvOnce(): void {
  if (dotEnvLoaded) return;
  dotEnvLoaded = true;
  if (!existsSync(DOT_ENV_PATH)) return;
  try {
    const text = readFileSync(DOT_ENV_PATH, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!key.startsWith("ENVOY_MODEL_")) continue;
      if (process.env[key] !== undefined) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    /* ignore */
  }
}

function isUsableApiKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  return trimmed.length > 0 && trimmed !== "YOUR_API_KEY_HERE";
}

function fromEnv(): ModelProviderConfig | null {
  loadDotEnvOnce();
  const apiKey = process.env.ENVOY_MODEL_API_KEY?.trim();
  if (!isUsableApiKey(apiKey)) return null;
  const mode = (process.env.ENVOY_MODEL_MODE ?? "openai-compatible") as ModelProviderConfig["mode"];
  if (mode === "mock" || mode === "disabled") return null;
  return {
    mode,
    endpoint: process.env.ENVOY_MODEL_ENDPOINT ?? "https://api.minimaxi.com/v1",
    modelName: process.env.ENVOY_MODEL_NAME ?? "MiniMax-M2.7",
    apiKey,
    requireApprovalForCloud: false,
  };
}

function fromNodeConfigFile(): ModelProviderConfig | null {
  if (!existsSync(DEFAULT_NODE_CONFIG)) return null;
  try {
    const raw = readFileSync(DEFAULT_NODE_CONFIG, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw)) as {
      modelProviders?: ModelProviderConfig;
    };
    const mp = parsed.modelProviders;
    if (!mp || !isUsableApiKey(mp.apiKey)) return null;
    if (mp.mode === "mock" || mp.mode === "disabled") return null;
    return {
      ...mp,
      requireApprovalForCloud: false,
    };
  } catch {
    return null;
  }
}

let cached: ModelProviderConfig | null | undefined;

/** True when a live chat model (typically MiniMax openai-compatible) is configured. */
export function isPhase18LiveModelConfigured(): boolean {
  return tryGetPhase18ModelProviders() !== null;
}

export function tryGetPhase18ModelProviders(): ModelProviderConfig | null {
  if (cached !== undefined) return cached;
  cached = fromEnv() ?? fromNodeConfigFile();
  return cached;
}

export function getPhase18ModelProviders(): ModelProviderConfig {
  const providers = tryGetPhase18ModelProviders();
  if (!providers) {
    throw new Error(
      "Phase 18 live model not configured. Set ENVOY_MODEL_API_KEY (and optional ENVOY_MODEL_*) in .env, " +
        "or configure modelProviders in apps/node/data/default/node-config.json (openai-compatible MiniMax).",
    );
  }
  return providers;
}

export function phase18MinimaxSkipMessage(): string {
  return "requires ENVOY_MODEL_API_KEY or node-config.json openai-compatible model";
}
