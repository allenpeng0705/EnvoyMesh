/**
 * OpenAI-compatible `GET /v1/models` fetch with a short in-memory TTL
 * for Ext Agent command catalogs (Hermes / OpenHuman).
 */

export type ExtAgentModelListEntry = { id: string; label?: string };

type CacheEntry = {
  fetchedAt: number;
  models: ExtAgentModelListEntry[];
};

const cache = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60_000;

export function parseOpenAiModelsResponse(body: unknown): ExtAgentModelListEntry[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: ExtAgentModelListEntry[] = [];
  const seen = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const id = typeof (row as { id?: unknown }).id === "string"
      ? (row as { id: string }).id.trim()
      : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id });
  }
  return out;
}

export async function fetchOpenAiCompatibleModels(params: {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  cacheKey?: string;
  ttlMs?: number;
}): Promise<ExtAgentModelListEntry[]> {
  const cacheKey = params.cacheKey ?? params.url;
  const ttlMs = params.ttlMs ?? DEFAULT_TTL_MS;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < ttlMs) {
    return hit.models;
  }

  try {
    const res = await fetch(params.url, {
      headers: params.headers,
      signal: AbortSignal.timeout(params.timeoutMs ?? 3_000),
    });
    if (!res.ok) return hit?.models ?? [];
    const json = (await res.json()) as unknown;
    const models = parseOpenAiModelsResponse(json);
    cache.set(cacheKey, { fetchedAt: Date.now(), models });
    return models;
  } catch {
    return hit?.models ?? [];
  }
}

/** @internal tests */
export function _resetExtAgentModelListCacheForTests(): void {
  cache.clear();
}
