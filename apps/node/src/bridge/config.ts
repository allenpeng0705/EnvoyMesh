import { z } from "zod";

export const BridgeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Ext Agent URL (HomeClaw, etc.) — P2P bridge async path only. */
  agentUrl: z.string().url().default("http://127.0.0.1:18789/webhook/envoymesh"),
  /** Built-in OpenClaw webhook for EnvoyAI / H2A. Defaults to local gateway. */
  assistantAgentUrl: z.string().url().optional(),
  listenPort: z.number().int().min(1024).max(65535).default(3031),
  /** Optional. When set, `POST /bridge/send` requires `Authorization: Bearer <secret>`. Omit for local-only use (bridge binds to 127.0.0.1). */
  secret: z.string().optional(),
  agentName: z.string().default(""),
  /** ClawHub API token for skill marketplace access. */
  clawhubToken: z.string().optional(),
  /** API keys for installed ClawHub skills, keyed by skill slug. */
  skillApiKeys: z.record(z.string(), z.string()).optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: false,
  agentUrl: "http://127.0.0.1:8080/webhook/homeclaw",
  assistantAgentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
  listenPort: 3031,
  agentName: "",
};

export interface ResolvedBridgeConfig extends BridgeConfig {
  extAgents?: { agentId: string; url: string; name?: string }[];
}

export function applyBridgeConfigResolution(raw: BridgeConfig): ResolvedBridgeConfig {
  return {
    ...raw,
    assistantAgentUrl: resolveAssistantAgentUrl(raw),
    extAgents: [],
  };
}

export interface BridgeConfigView {
  enabled: boolean;
  agentUrl: string;
  assistantAgentUrl: string;
  agentName: string;
  extAgents: { agentId: string; url: string; name?: string; healthy?: boolean }[];
}

export function bridgeConfigToView(
  resolved: ResolvedBridgeConfig,
  _health: Record<string, boolean>,
): BridgeConfigView {
  return {
    enabled: resolved.enabled,
    agentUrl: resolved.agentUrl,
    assistantAgentUrl: resolved.assistantAgentUrl ?? resolved.agentUrl,
    agentName: resolved.agentName,
    extAgents: (resolved.extAgents ?? []).map((a) => ({
      agentId: a.agentId,
      url: a.url,
      name: a.name,
    })),
  };
}

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

export async function probeAllExtAgents(
  _config: ResolvedBridgeConfig,
): Promise<{ agentId: string; healthy: boolean }[]> {
  return [];
}

export async function probeExtAgentHealth(
  _url: string,
  _secret?: string,
): Promise<boolean> {
  return false;
}

export function resolveBridgeStatusAgentType(
  _agentUrl?: string,
): "homeclaw" | "envoyai" | "unknown" {
  return "envoyai";
}
