/**
 * External agent bridge definitions (HomeClaw, Hermes, OpenHuman, …).
 * Persisted in the home node's `bridge-config.json`.
 */
export interface ExtAgentDefinition {
  id: string;
  name: string;
  adapter: string;
  url: string;
  enabled: boolean;
}

/** Built-in presets shipped with EnvoyMesh. */
export const DEFAULT_EXT_AGENTS: ExtAgentDefinition[] = [
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

export function mergeExtAgentPresets(
  configured?: ExtAgentDefinition[],
): ExtAgentDefinition[] {
  const byId = new Map(DEFAULT_EXT_AGENTS.map((a) => [a.id, { ...a }]));
  for (const agent of configured ?? []) {
    const id = agent.id?.trim();
    if (!id) continue;
    const preset = byId.get(id);
    byId.set(id, preset ? { ...preset, ...agent, id } : { ...agent, id });
  }
  return [...byId.values()];
}

export function resolveActiveExtAgent(
  extAgents: ExtAgentDefinition[],
  activeExtAgentId: string | undefined,
): ExtAgentDefinition | undefined {
  const id = activeExtAgentId?.trim();
  if (id) {
    const match = extAgents.find((a) => a.id === id);
    if (match) return match;
  }
  return extAgents.find((a) => a.enabled) ?? extAgents[0];
}
