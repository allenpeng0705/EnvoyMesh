import { z } from "zod";
import type { ExtAgentDefinition } from "@envoymesh/api";
import {
  DEFAULT_EXT_AGENTS,
  mergeExtAgentPresets,
  resolveActiveExtAgent,
} from "@envoymesh/api";
import { openClawGatewayWebhookUrl } from "../service-ports.js";

export const ExtAgentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  adapter: z.string().min(1),
  url: z.string().url(),
  enabled: z.boolean(),
});

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
  /** Selected external agent id (homeclaw, hermes, openhuman, …). */
  activeExtAgent: z.string().optional(),
  /** External agent definitions. Merged with built-in presets on read. */
  extAgents: z.array(ExtAgentDefinitionSchema).optional(),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: false,
  agentUrl: "http://127.0.0.1:8010/message",
  assistantAgentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
  listenPort: 3031,
  agentName: "HomeClaw",
  activeExtAgent: "homeclaw",
  extAgents: DEFAULT_EXT_AGENTS,
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
  // Use the actual gateway port from service-ports.ts (respects
  // ENVOYMESH_GATEWAY_PORT env var, not a hardcoded 18789).
  return openClawGatewayWebhookUrl();
}

export function normalizeBridgeExtAgents(cfg: BridgeConfig): ExtAgentDefinition[] {
  return mergeExtAgentPresets(cfg.extAgents);
}

/** Apply the active external agent to agentUrl / agentName on the bridge config. */
export function applyActiveExtAgent(cfg: BridgeConfig): BridgeConfig {
  const extAgents = normalizeBridgeExtAgents(cfg);
  const active = resolveActiveExtAgent(extAgents, cfg.activeExtAgent);
  if (!active) {
    return { ...cfg, extAgents };
  }
  return {
    ...cfg,
    extAgents,
    activeExtAgent: active.id,
    agentUrl: active.url,
    agentName: active.name,
  };
}

export function bridgeConfigToStatusFields(cfg: BridgeConfig): {
  activeExtAgentId: string | undefined;
  extAgents: ExtAgentDefinition[];
  agentUrl: string;
  agentName: string;
  listenPort: number;
} {
  const applied = applyActiveExtAgent(cfg);
  return {
    activeExtAgentId: applied.activeExtAgent,
    extAgents: applied.extAgents ?? [],
    agentUrl: applied.agentUrl,
    agentName: applied.agentName,
    listenPort: applied.listenPort,
  };
}
