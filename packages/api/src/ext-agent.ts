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
    id: "pi",
    name: "Pi",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8022/message",
    enabled: true,
  },
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
    if (!preset) {
      byId.set(id, { ...agent, id });
      continue;
    }
    const merged = { ...preset, ...agent, id };
    // Drop legacy "Pi (built-in)" label from older bridge-config.json.
    if (merged.name === "Pi (built-in)") merged.name = preset.name;
    byId.set(id, merged);
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

/**
 * Soft reachability of the active (or requested) Ext Agent backend.
 * Used by the switcher + Ext Agent chat banner — does not block switching.
 */
export interface ExtAgentReachability {
  agentId: string;
  agentName: string;
  /** True for built-in Pi — no external process required. */
  builtIn: boolean;
  reachable: boolean;
  /** Short operator hint when not reachable (English; UI may i18n by agentId). */
  hint: string;
  checkedAt: string;
}

/** Default start hints for non-built-in Ext Agents (see docs/Ext_Agent_guide.md). */
export function defaultExtAgentStartHint(agentId: string): string {
  switch (agentId) {
    case "homeclaw":
      return "Start HomeClaw, then confirm http://127.0.0.1:8010/status responds.";
    case "hermes":
      return "Run `hermes gateway run` with API_SERVER_ENABLED=true (OpenAI API on :8642).";
    case "openhuman":
      return "Start OpenHuman.app or the OpenHuman CLI core (health on :7788).";
    case "pi":
      return "Pi is built into full desktop installs. If chat stays silent, reinstall a full build (Pi sidecar staged) and confirm Settings → AI has a real model (not mock/disabled).";
    default:
      return "Start the external agent process, then confirm its HTTP endpoint is reachable.";
  }
}

/**
 * Install / docs metadata for Settings → External Agent Bridge.
 * Not persisted on `ExtAgentDefinition` — lookup by preset id only.
 */
export interface ExtAgentInstallInfo {
  agentId: string;
  /** Official product homepage or install docs. */
  homepageUrl?: string;
  /** Short label for the link (e.g. "Hermes docs"). */
  homepageLabel: string;
  /** One-line how to start / that it's built-in. */
  startHint: string;
  builtIn: boolean;
}

/** Official install / docs links shown when selecting an Ext Agent in Settings. */
export function getExtAgentInstallInfo(agentId: string): ExtAgentInstallInfo {
  const id = agentId.trim() || "pi";
  switch (id) {
    case "pi":
      return {
        agentId: id,
        homepageUrl: "https://github.com/earendil-works/pi",
        homepageLabel: "Pi on GitHub",
        startHint: defaultExtAgentStartHint(id),
        builtIn: true,
      };
    case "homeclaw":
      return {
        agentId: id,
        homepageUrl: "https://www.homeclaw.cn/",
        homepageLabel: "HomeClaw website",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    case "hermes":
      return {
        agentId: id,
        homepageUrl: "https://hermes-agent.nousresearch.com/docs/",
        homepageLabel: "Hermes docs",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    case "openhuman":
      return {
        agentId: id,
        homepageUrl: "https://tinyhumans.ai/openhuman",
        homepageLabel: "OpenHuman website",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    default:
      return {
        agentId: id,
        homepageLabel: "Docs",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
  }
}
