import type { ExtAgentEntry } from "./config.js";

/** Bundled sidecar adapters EnvoyMesh can auto-start (not HomeClaw — it runs its own channel). */
export const BUNDLED_SIDECAR_AGENT_IDS = ["hermes", "openhuman"] as const;

export type BundledSidecarAgentId = (typeof BUNDLED_SIDECAR_AGENT_IDS)[number];

/** Default registry entries merged into bridge-config when missing. */
export function defaultExtAgentRegistry(): ExtAgentEntry[] {
  return [
    {
      id: "homeclaw",
      name: "HomeClaw",
      adapter: "envoymesh-message",
      url: "http://127.0.0.1:8010/message",
      enabled: true,
    },
    {
      id: "hermes",
      name: "Hermes",
      adapter: "envoymesh-message",
      url: "http://127.0.0.1:8020/message",
      enabled: true,
    },
    {
      id: "openhuman",
      name: "OpenHuman",
      adapter: "envoymesh-message",
      url: "http://127.0.0.1:8021/message",
      enabled: false,
    },
  ];
}

/** Add bundled defaults without overwriting user-edited entries. */
export function mergeBundledExtAgentRegistry(extAgents: ExtAgentEntry[] | undefined): ExtAgentEntry[] {
  const byId = new Map((extAgents ?? []).map((e) => [e.id, e]));
  for (const entry of defaultExtAgentRegistry()) {
    if (!byId.has(entry.id)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()];
}

export function isBundledSidecarAgent(id: string): id is BundledSidecarAgentId {
  return (BUNDLED_SIDECAR_AGENT_IDS as readonly string[]).includes(id);
}

export function sidecarScriptRelPath(agentId: BundledSidecarAgentId): string {
  return `tools/ext-agent-adapters/${agentId}/server.mjs`;
}

export function parseMessageUrlPort(agentUrl: string, fallback: number): number {
  try {
    const u = new URL(agentUrl);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_HERMES_PORTS: Record<BundledSidecarAgentId, number> = {
  hermes: 8020,
  openhuman: 8021,
};

export function defaultSidecarPort(agentId: BundledSidecarAgentId): number {
  return DEFAULT_HERMES_PORTS[agentId];
}

export function parseSidecarPort(agentId: BundledSidecarAgentId, agentUrl: string): number {
  return parseMessageUrlPort(agentUrl, defaultSidecarPort(agentId));
}
