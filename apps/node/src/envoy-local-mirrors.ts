/**
 * Region-aware download mirrors for Envoy Local (Phase 54).
 *
 * Models (GGUF):
 * - China: ModelScope (when listed) → hf-mirror.com (no direct huggingface.co)
 * - Elsewhere: huggingface.co
 *
 * Runtime (llama.cpp GitHub Releases):
 * - China: optional operator CDN → ghproxy-style wrappers → direct GitHub last
 * - Elsewhere: direct GitHub (optional CDN first when configured)
 *
 * Region override (models + runtime):
 *   ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION=cn|global
 *   ENVOYMESH_ENVOY_LOCAL_MODEL_REGION=cn|global  (legacy alias)
 *
 * Runtime URL overrides:
 *   ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL — full URL for the primary runtime archive
 *   ENVOYMESH_ENVOY_LOCAL_RUNTIME_MIRROR_BASE — CDN/proxy base (see resolveEnvoyLocalRuntimeDownloadUrls)
 */
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";

export type EnvoyLocalModelRegion = "cn" | "global";

const HF_HOST = "https://huggingface.co";
const HF_MIRROR_HOST = "https://hf-mirror.com";

/**
 * Public GitHub-release proxies commonly reachable from China.
 * They wrap the full canonical URL: `${proxy}/${https://github.com/...}`.
 * Proxies are best-effort; sha256 still fail-closes after download.
 */
export const ENVOY_LOCAL_GITHUB_RELEASE_PROXIES = [
  "https://ghfast.top",
  "https://ghproxy.net",
  "https://mirror.ghproxy.com",
] as const;

export function detectEnvoyLocalModelRegion(
  env: NodeJS.ProcessEnv = process.env,
): EnvoyLocalModelRegion {
  const forced = (
    env.ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION ??
    env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION ??
    ""
  )
    .trim()
    .toLowerCase();
  if (forced === "cn" || forced === "china") return "cn";
  if (forced === "global" || forced === "intl" || forced === "hf") return "global";

  const localeHints = [env.LC_ALL, env.LC_MESSAGES, env.LANG, env.LANGUAGE]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().toLowerCase().replace(/-/g, "_"));
  if (localeHints.some((v) => v.startsWith("zh_cn") || v === "zh" || v.startsWith("zh_hans"))) {
    return "cn";
  }

  const tz = (env.TZ ?? "").trim();
  const cnTimezones = new Set([
    "Asia/Shanghai",
    "Asia/Chongqing",
    "Asia/Harbin",
    "Asia/Urumqi",
    "Asia/Kashgar",
    "Asia/Beijing",
  ]);
  if (cnTimezones.has(tz)) return "cn";

  return "global";
}

/** Rewrite a Hugging Face resolve URL onto hf-mirror.com. */
export function toHfMirrorUrl(huggingfaceUrl: string): string {
  if (huggingfaceUrl.startsWith(`${HF_HOST}/`)) {
    return `${HF_MIRROR_HOST}/${huggingfaceUrl.slice(HF_HOST.length + 1)}`;
  }
  if (huggingfaceUrl.startsWith("https://huggingface.co")) {
    return huggingfaceUrl.replace("https://huggingface.co", HF_MIRROR_HOST);
  }
  return huggingfaceUrl;
}

/**
 * Ordered download candidates for a catalog entry.
 * First URL is preferred; callers should fail over on network/HTTP errors.
 */
export function resolveEnvoyLocalModelDownloadUrls(
  model: Pick<EnvoyLocalCatalogModel, "url" | "modelScopeUrl">,
  region: EnvoyLocalModelRegion = detectEnvoyLocalModelRegion(),
): string[] {
  if (region === "cn") {
    const out: string[] = [];
    if (model.modelScopeUrl?.trim()) out.push(model.modelScopeUrl.trim());
    out.push(toHfMirrorUrl(model.url));
    return [...new Set(out)];
  }
  return [model.url];
}

/** Catalog entry with `url` set to the preferred mirror for the region (UI/status). */
export function withPreferredModelDownloadUrl(
  model: EnvoyLocalCatalogModel,
  region: EnvoyLocalModelRegion = detectEnvoyLocalModelRegion(),
): EnvoyLocalCatalogModel {
  const urls = resolveEnvoyLocalModelDownloadUrls(model, region);
  return { ...model, url: urls[0] ?? model.url };
}

/** Wrap a GitHub Releases URL with a proxy that expects the full URL as a path suffix. */
export function wrapGithubUrlWithProxy(proxyBase: string, githubUrl: string): string {
  const base = proxyBase.replace(/\/+$/, "");
  return `${base}/${githubUrl}`;
}

/**
 * Ordered candidates for a llama.cpp GitHub Releases asset.
 *
 * - `ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL` (when `assetKind === "runtime"`) → single override
 * - `ENVOYMESH_ENVOY_LOCAL_RUNTIME_MIRROR_BASE`:
 *   - if it contains `{url}` → substitute the GitHub URL
 *   - if it contains `{name}` → substitute the asset basename
 *   - else if base looks like a proxy host → `${base}/${githubUrl}`
 *   - else → `${base}/${assetName}` (CDN hosting identical filenames)
 * - China: proxy wrappers, then direct GitHub last
 * - Global: direct GitHub first (CDN/override still first when set)
 */
export function resolveEnvoyLocalRuntimeDownloadUrls(
  githubUrl: string,
  opts?: {
    region?: EnvoyLocalModelRegion;
    env?: NodeJS.ProcessEnv;
    /** When "runtime", honor ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL full override. */
    assetKind?: "runtime" | "cudart";
  },
): string[] {
  const env = opts?.env ?? process.env;
  const region = opts?.region ?? detectEnvoyLocalModelRegion(env);
  const assetKind = opts?.assetKind ?? "runtime";

  if (assetKind === "runtime") {
    const fullOverride = (env.ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL ?? "").trim();
    if (fullOverride) return [fullOverride];
  }

  const assetName = githubUrl.split("/").pop() ?? "";
  const out: string[] = [];

  const mirrorBase = (env.ENVOYMESH_ENVOY_LOCAL_RUNTIME_MIRROR_BASE ?? "").trim();
  if (mirrorBase) {
    if (mirrorBase.includes("{url}")) {
      out.push(mirrorBase.replaceAll("{url}", githubUrl));
    } else if (mirrorBase.includes("{name}")) {
      out.push(mirrorBase.replaceAll("{name}", assetName));
    } else if (/^https?:\/\/[^/]+$/i.test(mirrorBase.replace(/\/+$/, ""))) {
      // Host-only base → treat as GitHub URL proxy.
      out.push(wrapGithubUrlWithProxy(mirrorBase, githubUrl));
    } else {
      out.push(`${mirrorBase.replace(/\/+$/, "")}/${assetName}`);
    }
  }

  if (region === "cn") {
    for (const proxy of ENVOY_LOCAL_GITHUB_RELEASE_PROXIES) {
      out.push(wrapGithubUrlWithProxy(proxy, githubUrl));
    }
    out.push(githubUrl);
  } else {
    out.push(githubUrl);
  }

  return [...new Set(out.filter((u) => u.length > 0))];
}
