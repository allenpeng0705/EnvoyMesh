/**
 * Live Hugging Face Hub GGUF search for Envoy Local (Phase 54).
 * Models are never packaged — search + download are post-install only.
 */
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import type { EnvoyLocalModelRegion } from "./envoy-local-mirrors.js";
import { detectEnvoyLocalModelRegion } from "./envoy-local-mirrors.js";

const HF_API = "https://huggingface.co/api";
const HF_MIRROR_API = "https://hf-mirror.com/api";
const HF_RESOLVE = "https://huggingface.co";

/** Skip listing files larger than this (UI + disk sanity). */
export const ENVOY_LOCAL_HF_MAX_LIST_BYTES = 35 * 1024 * 1024 * 1024;

const PREFERRED_QUANT_RE =
  /-(Q4_K_M|Q5_K_M|Q4_0|Q4_K_S|Q5_K_S|Q3_K_M|Q6_K|Q8_0)\.gguf$/i;

export function hfApiBase(region: EnvoyLocalModelRegion): string {
  return region === "cn" ? HF_MIRROR_API : HF_API;
}

export function buildEnvoyLocalHfModelId(repoId: string, fileName: string): string {
  return `hf:${repoId}/${fileName}`;
}

/**
 * Parse `hf:{owner}/{repo}/{file.gguf}` into a catalog-shaped entry.
 * Returns undefined when the id is not a valid HF GGUF reference.
 */
export function parseEnvoyLocalHfModelId(
  modelId: string,
): EnvoyLocalCatalogModel | undefined {
  const raw = modelId.trim();
  if (!raw.startsWith("hf:")) return undefined;
  const rest = raw.slice(3);
  const slash = rest.indexOf("/");
  if (slash <= 0) return undefined;
  // owner/repo/file… — file may contain slashes rarely; take last segment as file
  const parts = rest.split("/");
  if (parts.length < 3) return undefined;
  const fileName = parts[parts.length - 1]!;
  const repoId = parts.slice(0, -1).join("/");
  if (!isSafeGgufFileName(fileName)) return undefined;
  if (!isSafeRepoId(repoId)) return undefined;
  return catalogFromHfFile(repoId, fileName, undefined);
}

export function isSafeRepoId(repoId: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(
    repoId,
  );
}

export function isSafeGgufFileName(fileName: string): boolean {
  if (!fileName || fileName.includes("..") || fileName.includes("\\") || fileName.includes("/")) {
    return false;
  }
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*\.gguf$/i.test(fileName);
}

/** Whether a Hub tree file should appear in search results. */
export function shouldListHfGgufFile(
  fileName: string,
  sizeBytes: number | undefined,
  opts?: { allowLargeQuants?: boolean },
): boolean {
  if (!isSafeGgufFileName(fileName)) return false;
  const lower = fileName.toLowerCase();
  if (lower.startsWith("mmproj")) return false;
  if (lower.includes("imatrix")) return false;
  if (/-\d{5}-of-\d{5}\.gguf$/i.test(fileName)) return false;
  if (!opts?.allowLargeQuants) {
    if (/-bf16\.gguf$/i.test(fileName) || /-f16\.gguf$/i.test(fileName) || /-f32\.gguf$/i.test(fileName)) {
      return false;
    }
  }
  if (typeof sizeBytes === "number" && sizeBytes > ENVOY_LOCAL_HF_MAX_LIST_BYTES) {
    return false;
  }
  return true;
}

/** Prefer common edge quants when many files exist in a repo. */
export function pickPreferredHfGgufFiles(
  files: Array<{ path: string; size?: number }>,
  opts?: { maxPerRepo?: number; allowLargeQuants?: boolean },
): Array<{ path: string; size?: number }> {
  const maxPerRepo = opts?.maxPerRepo ?? 3;
  const eligible = files.filter((f) =>
    shouldListHfGgufFile(f.path.split("/").pop() ?? f.path, f.size, opts),
  );
  const preferred = eligible.filter((f) => PREFERRED_QUANT_RE.test(f.path));
  const pool = preferred.length > 0 ? preferred : eligible;
  // Prefer Q4_K_M first
  pool.sort((a, b) => quantRank(a.path) - quantRank(b.path));
  return pool.slice(0, maxPerRepo);
}

function quantRank(path: string): number {
  const order = ["Q4_K_M", "Q5_K_M", "Q4_0", "Q4_K_S", "Q5_K_S", "Q3_K_M", "Q6_K", "Q8_0"];
  const upper = path.toUpperCase();
  const idx = order.findIndex((q) => upper.includes(`-${q}.GGUF`));
  return idx === -1 ? 50 : idx;
}

function catalogFromHfFile(
  repoId: string,
  fileName: string,
  sizeBytes: number | undefined,
): EnvoyLocalCatalogModel {
  const id = buildEnvoyLocalHfModelId(repoId, fileName);
  return {
    id,
    label: `${fileName}`,
    description: `Hugging Face · ${repoId}`,
    fileName,
    url: `${HF_RESOLVE}/${repoId}/resolve/main/${fileName}`,
    approxBytes: typeof sizeBytes === "number" && sizeBytes > 0 ? sizeBytes : 500_000_000,
    tags: ["huggingface", "gguf", ...repoId.toLowerCase().split(/[\/._-]+/).filter(Boolean)],
    source: "huggingface",
  };
}

interface HfModelHit {
  id?: string;
  modelId?: string;
}

interface HfTreeEntry {
  type?: string;
  path?: string;
  size?: number;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "EnvoyMesh-EnvoyLocal/1.0" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Hugging Face API HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * Search Hub for GGUF repos, expand preferred quant files into catalog entries.
 * Soft-fails by throwing — caller merges with curated and surfaces the error.
 */
export async function searchHuggingFaceGgufs(
  query: string,
  opts?: {
    region?: EnvoyLocalModelRegion;
    signal?: AbortSignal;
    maxRepos?: number;
    maxFiles?: number;
  },
): Promise<EnvoyLocalCatalogModel[]> {
  const q = query.trim();
  if (!q) return [];
  const region = opts?.region ?? detectEnvoyLocalModelRegion();
  const api = hfApiBase(region);
  const maxRepos = opts?.maxRepos ?? 8;
  const maxFiles = opts?.maxFiles ?? 24;
  const allowLarge = /\b(bf16|f16|f32)\b/i.test(q);

  const searchUrl =
    `${api}/models?search=${encodeURIComponent(q)}` +
    `&filter=gguf&sort=downloads&direction=-1&limit=${maxRepos}`;

  const hits = await fetchJson<HfModelHit[]>(searchUrl, opts?.signal);
  const out: EnvoyLocalCatalogModel[] = [];

  for (const hit of hits) {
    if (out.length >= maxFiles) break;
    const repoId = (hit.modelId ?? hit.id ?? "").trim();
    if (!isSafeRepoId(repoId)) continue;
    try {
      const treeUrl = `${api}/models/${repoId}/tree/main?recursive=true`;
      const tree = await fetchJson<HfTreeEntry[]>(treeUrl, opts?.signal);
      const files = tree
        .filter((e) => e.type === "file" && typeof e.path === "string")
        .map((e) => ({ path: e.path!, size: e.size }));
      const picked = pickPreferredHfGgufFiles(files, {
        maxPerRepo: 3,
        allowLargeQuants: allowLarge,
      });
      for (const f of picked) {
        if (out.length >= maxFiles) break;
        const fileName = f.path.split("/").pop()!;
        // Nested paths: only top-level / simple names for resolve/main/{fileName}
        if (f.path !== fileName) continue;
        out.push(catalogFromHfFile(repoId, fileName, f.size));
      }
    } catch {
      // Skip repos that fail tree listing; continue others.
    }
  }
  return out;
}

/** Resolve a curated or `hf:` model id into a downloadable catalog entry. */
export function resolveEnvoyLocalDownloadModel(
  modelId: string,
  curatedLookup: (id: string) => EnvoyLocalCatalogModel | undefined,
): EnvoyLocalCatalogModel | undefined {
  const curated = curatedLookup(modelId);
  if (curated) return { ...curated, source: curated.source ?? "curated" };
  return parseEnvoyLocalHfModelId(modelId);
}
