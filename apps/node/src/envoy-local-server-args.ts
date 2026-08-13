/**
 * Build llama-server argv from Envoy Local server params (Phase 54).
 * Kept pure for unit tests — no process spawn here.
 */
import {
  DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
  type EnvoyLocalServerParams,
} from "@envoymesh/api";
import { isAbsolute, resolve } from "node:path";
import type { EnvoyLocalPlatform } from "./envoy-local-platform.js";

export function resolveEnvoyLocalNgl(
  params: EnvoyLocalServerParams,
  platform: EnvoyLocalPlatform,
): number {
  const raw = params.nGpuLayers ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.nGpuLayers;
  if (raw === 0) return 0;
  if (typeof raw === "number" && raw > 0) return raw;
  return platform.accel === "cpu" ? 0 : -1;
}

/**
 * LoRA path(s). Use `path@scale` (not `:`) so Windows drive letters stay intact.
 * Multiple adapters: comma-separated.
 */
export function resolveEnvoyLocalLoraArg(
  loraPath: string | undefined,
  profileDir: string,
): { flag: "--lora" | "--lora-scaled"; value: string } | null {
  const raw = loraPath?.trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  let anyScaled = false;
  const values = parts.map((part) => {
    const at = part.lastIndexOf("@");
    let pathPart = part;
    let scale = "";
    if (at > 0 && /^\d+(\.\d+)?$/.test(part.slice(at + 1))) {
      pathPart = part.slice(0, at);
      scale = part.slice(at + 1);
      anyScaled = true;
    }
    const abs = isAbsolute(pathPart) ? pathPart : resolve(profileDir, pathPart);
    return scale ? `${abs}:${scale}` : abs;
  });

  return anyScaled
    ? { flag: "--lora-scaled", value: values.join(",") }
    : { flag: "--lora", value: values.join(",") };
}

export function buildEnvoyLocalLlamaServerArgs(opts: {
  modelPath: string;
  modelId: string;
  port: number;
  platform: EnvoyLocalPlatform;
  serverParams: EnvoyLocalServerParams;
  profileDir: string;
  chatTemplate?: string;
  forceCpu?: boolean;
  /** When true, pass `--embedding` (dedicated embed GGUF sidecar). */
  embedding?: boolean;
  /** Optional `--pooling` (e.g. `mean` for nomic-embed). */
  pooling?: string;
}): string[] {
  const sp = {
    ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
    ...opts.serverParams,
  };
  const ngl = opts.forceCpu ? 0 : resolveEnvoyLocalNgl(sp, opts.platform);
  const args = [
    "-m",
    opts.modelPath,
    "-a",
    opts.modelId,
    "--host",
    "127.0.0.1",
    "--port",
    String(opts.port),
    "-c",
    String(sp.ctxSize ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.ctxSize),
    "-ngl",
    String(ngl),
    "--parallel",
    String(sp.parallel ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.parallel),
    "-fa",
    sp.flashAttn ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.flashAttn,
    "--fit",
    sp.fit ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.fit,
  ];
  if (opts.embedding) {
    args.push("--embedding");
  }
  if (opts.pooling?.trim()) {
    args.push("--pooling", opts.pooling.trim());
  }
  if (typeof sp.threads === "number" && sp.threads > 0) {
    args.push("-t", String(sp.threads));
  }
  if (typeof sp.batchSize === "number" && sp.batchSize > 0) {
    args.push("-b", String(sp.batchSize));
  }
  if (typeof sp.ubatchSize === "number" && sp.ubatchSize > 0) {
    args.push("-ub", String(sp.ubatchSize));
  }
  if (sp.cacheTypeK) {
    args.push("-ctk", sp.cacheTypeK);
  }
  if (sp.cacheTypeV) {
    args.push("-ctv", sp.cacheTypeV);
  }
  const lora = resolveEnvoyLocalLoraArg(sp.loraPath, opts.profileDir);
  if (lora) {
    args.push(lora.flag, lora.value);
  }
  if (opts.chatTemplate) {
    args.push("--chat-template", opts.chatTemplate);
  }
  return args;
}
