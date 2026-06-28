import { z } from "zod";

export const ExtAgentAdapterSchema = z.enum(["envoymesh-message", "openclaw-webhook"]).or(z.string().min(1));

export const ExtAgentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapter: ExtAgentAdapterSchema.default("envoymesh-message"),
  url: z.string().url(),
  inboundSecret: z.string().optional(),
  enabled: z.boolean().default(true),
  vendor: z.string().optional(),
  notes: z.string().optional(),
});

export type ExtAgentEntry = z.infer<typeof ExtAgentEntrySchema>;

export const BridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Ext Agent URL (HomeClaw, etc.) — P2P bridge async path only. Legacy; derived from active registry entry when set. */
  agentUrl: z.string().url().default("http://127.0.0.1:18789/webhook/envoymesh"),
  /** Built-in OpenClaw webhook for EnvoyAI / H2A. Defaults to local gateway. */
  assistantAgentUrl: z.string().url().optional(),
  listenPort: z.number().int().min(1024).max(65535).default(3031),
  /** Optional. When set, `POST /bridge/send` requires `Authorization: Bearer <secret>`. Omit for local-only use (bridge binds to 127.0.0.1). */
  secret: z.string().optional(),
  agentName: z.string().default(""),
  /** Phase 44 — id of the active entry in `extAgents`. */
  activeExtAgent: z.string().optional(),
  /** Phase 44 — registry of local agent backends. */
  extAgents: z.array(ExtAgentEntrySchema).optional(),
  /** ClawHub API token for skill marketplace access. */
  clawhubToken: z.string().optional(),
  /** API keys for installed ClawHub skills, keyed by skill slug. */
  skillApiKeys: z.record(z.string(), z.string()).optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export interface ResolvedActiveExtAgent {
  id: string | null;
  name: string;
  adapter: string;
  url: string;
  inboundSecret?: string;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: false,
  agentUrl: "http://127.0.0.1:8080/webhook/homeclaw",
  assistantAgentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
  listenPort: 3031,
  agentName: "",
};

/** Built-in OpenClaw webhook URL for EnvoyAI / H2A turns. */
export function resolveAssistantAgentUrl(cfg: {
  assistantAgentUrl?: string;
  agentUrl?: string;
}): string {
  const explicit = cfg.assistantAgentUrl?.trim();
  if (explicit) return explicit;
  const agentUrl = cfg.agentUrl?.trim();
  if (agentUrl?.includes("/webhook/envoymesh")) return agentUrl;
  return DEFAULT_BRIDGE_CONFIG.assistantAgentUrl ?? "http://127.0.0.1:18789/webhook/envoymesh";
}

/**
 * Resolve which backend the bridge forwards to.
 * When `extAgents` is present, picks `activeExtAgent` (with fallbacks).
 * Otherwise uses legacy `agentUrl` / `agentName`.
 */
export function resolveActiveExtAgent(cfg: BridgeConfig): ResolvedActiveExtAgent {
  const registry = cfg.extAgents ?? [];
  if (registry.length === 0) {
    return {
      id: null,
      name: cfg.agentName?.trim() ?? "",
      adapter: cfg.agentUrl.includes("/webhook/envoymesh") ? "openclaw-webhook" : "envoymesh-message",
      url: cfg.agentUrl,
      inboundSecret: undefined,
    };
  }

  const enabled = registry.filter((e) => e.enabled);
  const pick = (id: string | undefined): ExtAgentEntry | undefined => {
    if (!id?.trim()) return undefined;
    const entry = registry.find((e) => e.id === id.trim());
    return entry?.enabled ? entry : undefined;
  };

  let active = pick(cfg.activeExtAgent) ?? enabled[0] ?? registry[0];

  if (!active) {
    return {
      id: null,
      name: cfg.agentName?.trim() ?? "",
      adapter: "envoymesh-message",
      url: cfg.agentUrl,
    };
  }

  return {
    id: active.id,
    name: active.name,
    adapter: active.adapter,
    url: active.url,
    inboundSecret: active.inboundSecret?.trim() || undefined,
  };
}

/** Merge registry resolution into config so runtime always uses derived agentUrl/agentName. */
export function applyBridgeConfigResolution(cfg: BridgeConfig): BridgeConfig & {
  resolvedActiveExtAgentId: string | null;
  resolvedAdapter: string;
  resolvedInboundSecret?: string;
} {
  const resolved = resolveActiveExtAgent(cfg);
  return {
    ...cfg,
    agentUrl: resolved.url,
    agentName: resolved.name || cfg.agentName,
    resolvedActiveExtAgentId: resolved.id,
    resolvedAdapter: resolved.adapter,
    resolvedInboundSecret: resolved.inboundSecret,
  };
}

/** Bridge status always describes the Ext Agent HTTP pipe (not built-in EnvoyAI / OpenClaw). */
export function resolveBridgeStatusAgentType(): "external" {
  return "external";
}

/** Bearer token for bridge → agent POST (per-agent inboundSecret overrides global secret). */
export function bridgeForwardAuthSecret(
  cfg: Pick<BridgeConfig, "secret"> & { resolvedInboundSecret?: string },
): string | undefined {
  const perAgent = cfg.resolvedInboundSecret?.trim();
  if (perAgent) return perAgent;
  const global = cfg.secret?.trim();
  return global || undefined;
}

export type ResolvedBridgeConfig = ReturnType<typeof applyBridgeConfigResolution>;

export type ExtAgentReachability = "running" | "stopped" | "disabled" | "unknown";

export interface ExtAgentProbeResult {
  id: string;
  name: string;
  adapter: string;
  url: string;
  enabled: boolean;
  healthy: boolean;
  reachability: ExtAgentReachability;
}

function reachabilityForEntry(
  enabled: boolean,
  healthy: boolean | undefined,
): ExtAgentReachability {
  if (!enabled) return "disabled";
  if (healthy === true) return "running";
  if (healthy === false) return "stopped";
  return "unknown";
}

/** Probe GET /status for each registry entry (parallel). */
export async function probeAllExtAgents(
  entries: ExtAgentEntry[],
): Promise<ExtAgentProbeResult[]> {
  return Promise.all(
    entries.map(async (entry) => {
      if (!entry.enabled) {
        return {
          id: entry.id,
          name: entry.name,
          adapter: entry.adapter,
          url: entry.url,
          enabled: false,
          healthy: false,
          reachability: "disabled" as const,
        };
      }
      const healthy = await probeExtAgentHealth(entry.url, entry.adapter);
      return {
        id: entry.id,
        name: entry.name,
        adapter: entry.adapter,
        url: entry.url,
        enabled: true,
        healthy,
        reachability: healthy ? ("running" as const) : ("stopped" as const),
      };
    }),
  );
}

/** Map resolved config to API view (for getBridgeConfig / updateBridgeConfig). */
export function bridgeConfigToView(
  cfg: ResolvedBridgeConfig,
  healthById?: Record<string, boolean>,
): import("@envoymesh/api").BridgeConfigView {
  return {
    enabled: cfg.enabled,
    listenPort: cfg.listenPort,
    secret: cfg.secret,
    activeExtAgent: cfg.activeExtAgent,
    extAgents: (cfg.extAgents ?? []).map((e) => {
      const healthy = e.enabled ? healthById?.[e.id] : undefined;
      return {
        id: e.id,
        name: e.name,
        adapter: e.adapter,
        url: e.url,
        enabled: e.enabled,
        inboundSecret: e.inboundSecret,
        vendor: e.vendor,
        notes: e.notes,
        healthy,
        reachability: reachabilityForEntry(e.enabled, healthy),
      };
    }),
    agentUrl: cfg.agentUrl,
    agentName: cfg.agentName,
    activeExtAgentId: cfg.resolvedActiveExtAgentId,
    adapter: cfg.resolvedAdapter,
  };
}

/** Derive GET /status URL from envoymesh-message agentUrl. */
export function extAgentHealthUrl(agentUrl: string, adapter: string): string | null {
  try {
    const u = new URL(agentUrl);
    if (adapter === "envoymesh-message" || u.pathname.endsWith("/message")) {
      u.pathname = u.pathname.replace(/\/?message\/?$/, "/status") || "/status";
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/** Probe adapter health (HomeClaw-style GET /status). Unknown profiles → true. */
export async function probeExtAgentHealth(agentUrl: string, adapter: string): Promise<boolean> {
  const healthUrl = extAgentHealthUrl(agentUrl, adapter);
  if (!healthUrl) return true;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { status?: string } | null;
    if (data?.status) {
      const s = data.status.toUpperCase();
      return s === "OK" || s === "DEGRADED";
    }
    return true;
  } catch {
    return false;
  }
}
