/**
 * Thin OpenViking HTTP client for Context Memory (no AGPL SDK).
 * Session reuse + richer search/find/fs mapping.
 */

export const DEFAULT_OV_ENDPOINT = "http://127.0.0.1:1933";
const SESSION_IDLE_MS = 30 * 60 * 1000;

export interface OvMemoryFact {
  /** Viking URI used as stable id for forget. */
  id: string;
  text: string;
  tags: string[];
  importance: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
}

export interface OvClient {
  probeReady(): Promise<{ ok: boolean; needsModels?: boolean; error?: string }>;
  searchContext(query: string): Promise<string>;
  rememberTurn(input: { userText: string; assistantText?: string }): Promise<void>;
  listMemories(limit?: number): Promise<OvMemoryFact[]>;
  forgetMemory(uri: string): Promise<boolean>;
  /** OV has no pin API — always false. */
  pinMemory(_uri: string, _pinned: boolean): Promise<boolean>;
  resetSession(): void;
  getSessionId(): string | undefined;
  /** Effective base URL (no trailing slash). */
  getEndpoint(): string;
}

export type OvFetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

function ovHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  return headers;
}

function unwrapResult(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const o = body as Record<string, unknown>;
  if ("result" in o) return o.result;
  return body;
}

export function extractOvSessionId(body: unknown): string | undefined {
  const root = unwrapResult(body);
  if (!root || typeof root !== "object") return undefined;
  const o = root as Record<string, unknown>;
  if (typeof o.session_id === "string" && o.session_id) return o.session_id;
  if (typeof o.sessionId === "string" && o.sessionId) return o.sessionId;
  if (typeof o.id === "string" && o.id) return o.id;
  return undefined;
}

/** Prefer assembled context string; else format memory hits as bullets. */
export function extractOvContextText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const o = body as Record<string, unknown>;
  const result = unwrapResult(body);
  const candidates: unknown[] = [o, result];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    for (const key of ["context", "text", "rendered", "digest"] as const) {
      if (typeof r[key] === "string" && String(r[key]).trim()) {
        return String(r[key]).trim();
      }
    }
  }
  const memories = collectMemoryHits(body);
  if (memories.length === 0) return "";
  return memories
    .slice(0, 12)
    .map((m) => `- ${m.text}`)
    .join("\n");
}

function hitText(hit: Record<string, unknown>): string {
  for (const key of ["abstract", "overview", "text", "content", "summary"] as const) {
    const v = hit[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (typeof hit.uri === "string" && hit.uri.trim()) return hit.uri.trim();
  return "";
}

export function collectOvMemoryHits(body: unknown): OvMemoryFact[] {
  return collectMemoryHits(body);
}

function collectMemoryHits(body: unknown): OvMemoryFact[] {
  const result = unwrapResult(body);
  const buckets: unknown[] = [];
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.memories)) buckets.push(...r.memories);
    if (Array.isArray(r.results)) buckets.push(...r.results);
    if (Array.isArray(r.items)) buckets.push(...r.items);
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.memories)) buckets.push(...o.memories);
  }
  const now = new Date().toISOString();
  const out: OvMemoryFact[] = [];
  const seen = new Set<string>();
  for (const raw of buckets) {
    if (!raw || typeof raw !== "object") continue;
    const hit = raw as Record<string, unknown>;
    const uri = typeof hit.uri === "string" ? hit.uri.trim() : "";
    const text = hitText(hit);
    if (!text) continue;
    const id = uri || `ov:${text.slice(0, 64)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const score = Number(hit.score);
    out.push({
      id,
      text: text.slice(0, 2000),
      tags: typeof hit.category === "string" ? [hit.category] : [],
      importance: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.6,
      createdAt: now,
      updatedAt: now,
      source: "openviking",
    });
  }
  return out;
}

function isHttp404(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\bHTTP 404\b/.test(msg);
}

async function fetchJson(
  doFetch: OvFetchLike,
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 4000);
  try {
    const { timeoutMs: _t, ...rest } = init;
    const res = await doFetch(url, { ...rest, signal: ctrl.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

export function createOvClient(input: {
  endpoint: string;
  apiKey?: string;
  sessionIdleMs?: number;
  fetchImpl?: OvFetchLike;
}): OvClient {
  const base = (input.endpoint || DEFAULT_OV_ENDPOINT).replace(/\/$/, "");
  const headers = ovHeaders(input.apiKey);
  const idleMs = input.sessionIdleMs ?? SESSION_IDLE_MS;
  const doFetch: OvFetchLike = input.fetchImpl ?? fetch;

  let sessionId: string | undefined;
  let lastUsedAt = 0;
  let sessionCreateInFlight: Promise<string> | null = null;

  const touch = () => {
    lastUsedAt = Date.now();
  };

  const resetSession = () => {
    sessionId = undefined;
    lastUsedAt = 0;
    sessionCreateInFlight = null;
  };

  async function createSession(): Promise<string> {
    if (sessionCreateInFlight) return sessionCreateInFlight;
    sessionCreateInFlight = (async () => {
      const res = await fetchJson(doFetch, `${base}/api/v1/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        timeoutMs: 5000,
      });
      if (!res.ok) throw new Error(`OpenViking session HTTP ${res.status}`);
      const id = extractOvSessionId(res.body);
      if (!id) throw new Error("OpenViking session id missing");
      sessionId = id;
      touch();
      return id;
    })();
    try {
      return await sessionCreateInFlight;
    } finally {
      sessionCreateInFlight = null;
    }
  }

  async function ensureSession(): Promise<string> {
    if (sessionId && Date.now() - lastUsedAt < idleMs) {
      touch();
      return sessionId;
    }
    if (sessionId && Date.now() - lastUsedAt >= idleMs) {
      sessionId = undefined;
      lastUsedAt = 0;
    }
    return createSession();
  }

  async function withSessionRetry<T>(fn: (sid: string) => Promise<T>): Promise<T> {
    const sid = await ensureSession();
    try {
      return await fn(sid);
    } catch (err) {
      if (!isHttp404(err)) throw err;
      sessionId = undefined;
      lastUsedAt = 0;
      const again = await createSession();
      return fn(again);
    }
  }

  return {
    resetSession,
    getSessionId: () => sessionId,
    getEndpoint: () => base,

    async probeReady() {
      const tryPath = async (path: string): Promise<Response | null> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2500);
        try {
          const getHeaders: Record<string, string> = {};
          if (input.apiKey) getHeaders["X-API-Key"] = input.apiKey;
          return await doFetch(`${base}${path}`, { signal: ctrl.signal, headers: getHeaders });
        } catch {
          return null;
        } finally {
          clearTimeout(timer);
        }
      };
      try {
        let res = await tryPath("/ready");
        if (!res || res.status === 404) res = await tryPath("/health");
        if (!res) return { ok: false, error: "OpenViking is not reachable" };
        if (res.status === 503) return { ok: false, needsModels: true };
        if (!res.ok) return { ok: false, error: `OpenViking ready HTTP ${res.status}` };
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* plain 200 is enough */
        }
        if (typeof body === "object" && body !== null) {
          const o = body as Record<string, unknown>;
          if (o.ready === false || o.status === "not_ready") {
            return { ok: false, needsModels: true };
          }
          if (o.needs_models === true || o.needsModels === true) {
            return { ok: false, needsModels: true };
          }
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async searchContext(query: string) {
      const sid = sessionId && Date.now() - lastUsedAt < idleMs ? sessionId : undefined;
      const payload: Record<string, unknown> = {
        query,
        mode: "context",
        purpose: "chat",
        limit: 12,
      };
      if (sid) payload.session_id = sid;
      const res = await fetchJson(doFetch, `${base}/api/v1/search/search`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        timeoutMs: 5000,
      });
      if (!res.ok) throw new Error(`OpenViking search HTTP ${res.status}`);
      if (sid) touch();
      const text = extractOvContextText(res.body);
      return text ? `### Context memory\n${text}` : "";
    },

    async rememberTurn(inputTurn) {
      await withSessionRetry(async (sid) => {
        const postMessage = async (role: string, content: string) => {
          const res = await fetchJson(
            doFetch,
            `${base}/api/v1/sessions/${encodeURIComponent(sid)}/messages`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({ role, content }),
              timeoutMs: 5000,
            },
          );
          if (!res.ok) throw new Error(`OpenViking message HTTP ${res.status}`);
        };
        await postMessage("user", inputTurn.userText);
        if (inputTurn.assistantText?.trim()) {
          await postMessage("assistant", inputTurn.assistantText);
        }
        const commit = await fetchJson(
          doFetch,
          `${base}/api/v1/sessions/${encodeURIComponent(sid)}/commit`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({}),
            timeoutMs: 8000,
          },
        );
        if (!commit.ok) throw new Error(`OpenViking commit HTTP ${commit.status}`);
        touch();
      });
    },

    async listMemories(limit = 40) {
      const res = await fetchJson(doFetch, `${base}/api/v1/search/find`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: "preferences facts decisions",
          context_type: "memory",
          limit: Math.max(1, Math.min(100, limit)),
        }),
        timeoutMs: 5000,
      });
      if (!res.ok) throw new Error(`OpenViking find HTTP ${res.status}`);
      return collectMemoryHits(res.body).slice(0, limit);
    },

    async forgetMemory(uri: string) {
      const id = String(uri ?? "").trim();
      if (!id) return false;
      const url = `${base}/api/v1/fs?uri=${encodeURIComponent(id)}&recursive=false&wait=true`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      try {
        const getHeaders: Record<string, string> = {};
        if (input.apiKey) getHeaders["X-API-Key"] = input.apiKey;
        const res = await doFetch(url, {
          method: "DELETE",
          headers: getHeaders,
          signal: ctrl.signal,
        });
        return res.ok || res.status === 404;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    },

    async pinMemory() {
      return false;
    },
  };
}
