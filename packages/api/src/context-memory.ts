/**
 * Phase 70 — optional Context Memory config (EnvoyAI personal long-term memory).
 * Default off; Ready-gated at runtime (see docs/context-memory-design.md).
 */

export type ContextMemoryBackendId = "native" | "openviking";

export type ContextMemoryStatus =
  | "off"
  | "installing"
  | "needs_models"
  | "error"
  | "ready";

/** Managed OpenViking install phase (Wave OV-DL). */
export type ContextMemoryInstallPhase = "download" | "unpack" | "start" | "health";

export interface ContextMemorySettings {
  /** Master switch. Default false — today’s EnvoyAI path unchanged. */
  enabled?: boolean;
  /**
   * Default "native". OpenViking: blank `endpoint` → managed download-on-enable;
   * set `endpoint` → BYO probe only.
   */
  backend?: ContextMemoryBackendId;
  /**
   * Named fact bank under context-memory/ns/<name>/ (default bank when omitted).
   * Safe charset: [a-z0-9_-], max 48. Invalid values are dropped.
   */
  namespace?: string;
  /** Loopback OV base URL override (e.g. http://127.0.0.1:1933). */
  endpoint?: string;
  /** Optional OpenViking API key (X-API-Key). Never log this. */
  apiKey?: string;
  /**
   * ISO time when MEMORY.md was one-shot seeded into the default bank.
   * Prefer {@link memorySeededAtByNamespace} for named banks.
   */
  memorySeededAt?: string;
  /** Per-namespace MEMORY.md seed markers (key = normalized namespace). */
  memorySeededAtByNamespace?: Record<string, string>;
  /** End-user last error copy (persisted for Settings). */
  lastError?: string;
}

export interface ContextMemoryFact {
  id: string;
  text: string;
  tags: string[];
  /** 0..1; >= 1 treated as pinned (no decay). */
  importance: number;
  createdAt: string;
  updatedAt: string;
  source?: string;
}

export interface ContextMemoryStatusSnapshot {
  status: ContextMemoryStatus;
  backend: ContextMemoryBackendId;
  enabled: boolean;
  factCount?: number;
  lastError?: string;
  /** End-user plain-language status line. */
  summary: string;
  /** True when Envoy owns the local OpenViking sidecar (managed mode). */
  managed?: boolean;
  /** Present while status is `installing`. */
  installPhase?: ContextMemoryInstallPhase;
  /** Optional 0..1 download/start progress. */
  installProgress?: number;
}

export const DEFAULT_CONTEXT_MEMORY_SETTINGS: Required<
  Pick<ContextMemorySettings, "enabled" | "backend">
> = {
  enabled: false,
  backend: "native",
};

export function resolveContextMemorySettings(
  input?: ContextMemorySettings | null,
): Required<Pick<ContextMemorySettings, "enabled" | "backend">> & ContextMemorySettings {
  const enabled = input?.enabled === true;
  const backend: ContextMemoryBackendId =
    input?.backend === "openviking" ? "openviking" : "native";
  const namespaceRaw =
    typeof input?.namespace === "string" ? input.namespace.trim().toLowerCase() : "";
  const namespace =
    namespaceRaw && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(namespaceRaw)
      ? namespaceRaw
      : undefined;
  const seededByNs: Record<string, string> = {};
  if (input?.memorySeededAtByNamespace && typeof input.memorySeededAtByNamespace === "object") {
    for (const [k, v] of Object.entries(input.memorySeededAtByNamespace)) {
      if (typeof k !== "string" || typeof v !== "string" || !v) continue;
      const nk = k.trim().toLowerCase();
      if (!nk || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(nk)) continue;
      seededByNs[nk] = v;
    }
  }
  return {
    enabled,
    backend,
    namespace,
    endpoint: typeof input?.endpoint === "string" ? input.endpoint.trim() || undefined : undefined,
    apiKey: typeof input?.apiKey === "string" ? input.apiKey.trim() || undefined : undefined,
    memorySeededAt:
      typeof input?.memorySeededAt === "string" ? input.memorySeededAt : undefined,
    memorySeededAtByNamespace:
      Object.keys(seededByNs).length > 0 ? seededByNs : undefined,
    lastError: typeof input?.lastError === "string" ? input.lastError : undefined,
  };
}
