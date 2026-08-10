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
  /**
   * Best-effort install classification. For built-in agents (Pi) this is
   * always `"installed"`. For external agents (Hermes, OpenHuman, codex,
   * claudecode), `"installed"` means the binary was found on `$PATH`;
   * `"not-installed"` means the binary is missing (Settings UI should
   * surface the `installGuide`); `"unsupported"` means the platform
   * can't run the binary (e.g. Windows-only); `"unknown"` means we
   * couldn't determine (PATH probe failed for an unrelated reason).
   */
  installState: InstallState;
  /**
   * Populated when `installState === "not-installed"` so the Settings UI
   * can show an Install Required card. May also be populated for
   * `"unknown"` to give the user a generic install hint.
   */
  installGuide?: ExtAgentInstallGuide;
}

/**
 * Whether the Ext Agent's binary is installed on the current machine.
 * Used by the Settings UI status indicator (green/amber/red) and by the
 * chat switcher to decide between a modal and a toast.
 */
export type InstallState =
  | "installed"
  | "not-installed"
  | "unsupported"
  | "unknown";

/**
 * Install / verify / docs payload for the Install Required card.
 * Returned by `getExtAgentInstallGuide(agentId, installState)` and
 * attached to `ExtAgentReachability` when the agent's binary is
 * missing or install state is unknown.
 */
export interface ExtAgentInstallGuide {
  agentId: string;
  /**
   * Convenience mirror of the `installState` arg — `true` when
   * `installState === "installed"`, otherwise `false`. UI code can
   * just check `installGuide.installed` without re-comparing strings.
   */
  installed: boolean;
  /**
   * The binary name as the user would type it on the command line.
   * `codex` for the codex CLI, `claude` for claudecode (the binary
   * that ships with `@anthropic-ai/claude-code`).
   */
  command: string;
  /** Command the Settings UI displays verbatim. */
  installCommand: string;
  /** Command the user can run to confirm a successful install. */
  verifyCommand: string;
  /** Short operator hint (reuses `defaultExtAgentStartHint`). */
  startHint: string;
  homepageUrl?: string;
  /** Short label for the homepage link. */
  homepageLabel: string;
  /**
   * 2-4 short bullets covering the most common install / start
   * failures. The Settings UI renders these as a checklist.
   */
  commonIssues: string[];
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
    case "codex":
      return "Install `codex` CLI (npm i -g @openai/codex), ensure `codex app-server` works; set OPENAI_API_KEY.";
    case "claudecode":
      return "Install Claude Code (npm i -g @anthropic-ai/claude-code), ensure `claude --version` works; set ANTHROPIC_API_KEY.";
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
    case "codex":
      return {
        agentId: id,
        homepageUrl: "https://github.com/openai/codex",
        homepageLabel: "Codex on GitHub",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    case "claudecode":
      return {
        agentId: id,
        homepageUrl: "https://docs.claude.com/en/docs/claude-code",
        homepageLabel: "Claude Code docs",
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

/**
 * Per-agent install command table for the Install Required card.
 * `command` is the binary the user types (e.g. `claude` for
 * `@anthropic-ai/claude-code`). `installCommand` is the
 * copy-pasteable install line. `verifyCommand` confirms a
 * successful install. `commonIssues` is a short list of
 * troubleshooting bullets rendered as a checklist.
 */
interface InstallTableRow {
  command: string;
  installCommand: string;
  verifyCommand: string;
  homepageUrl?: string;
  homepageLabel: string;
  commonIssues: string[];
}

const INSTALL_TABLE: Record<string, InstallTableRow> = {
  codex: {
    command: "codex",
    installCommand: "npm install -g @openai/codex",
    verifyCommand: "codex --version",
    homepageUrl: "https://github.com/openai/codex",
    homepageLabel: "Codex on GitHub",
    commonIssues: [
      "Set OPENAI_API_KEY in your shell before running codex.",
      "If `codex app-server` fails, run `codex --version` to confirm the CLI is on PATH.",
      "Codex CLI requires Node.js 18+; verify with `node --version`.",
    ],
  },
  claudecode: {
    command: "claude",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    verifyCommand: "claude --version",
    homepageUrl: "https://docs.claude.com/en/docs/claude-code",
    homepageLabel: "Claude Code docs",
    commonIssues: [
      "Set ANTHROPIC_API_KEY in your shell before running claude.",
      "If `claude --version` fails, try `npm install -g @anthropic-ai/claude-code` again.",
      "Claude Code requires Node.js 18+; verify with `node --version`.",
    ],
  },
  hermes: {
    command: "hermes",
    installCommand:
      "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
    verifyCommand: "hermes --version",
    homepageUrl: "https://hermes-agent.nousresearch.com/docs/",
    homepageLabel: "Hermes docs",
    commonIssues: [
      "Set API_SERVER_ENABLED=true and API_SERVER_KEY in your hermes config (e.g. ~/.hermes/.env).",
      "If `hermes gateway run` fails to start, check the config file for typos.",
      "Hermes health endpoint: GET http://127.0.0.1:8642/v1/models.",
    ],
  },
  openhuman: {
    command: "openhuman",
    installCommand:
      "curl -fsSL https://raw.githubusercontent.com/tinyhumansai/openhuman/main/scripts/install.sh | bash",
    verifyCommand: "openhuman --version",
    homepageUrl: "https://tinyhumans.ai/openhuman",
    homepageLabel: "OpenHuman website",
    commonIssues: [
      "Set OPENHUMAN_TOKEN or place core.token in your workspace.",
      "OpenHuman requires the openhuman-core binary on PATH.",
      "OpenHuman health endpoint: GET http://127.0.0.1:7788/health.",
    ],
  },
};

/**
 * Returns the Install Required card payload for a given agent.
 *
 * - Built-in agents (`pi`) always return `installed: true` with no
 *   install commands.
 * - For `codex` / `claudecode` / `hermes` / `openhuman`, the row is
 *   looked up from the per-agent table. `installed` is true only when
 *   the caller passes `installState === "installed"`.
 * - Unknown / custom agents fall back to a generic row with no
 *   commands — UI should still surface a "this agent has no install
 *   recipe" hint.
 */
export function getExtAgentInstallGuide(
  agentId: string,
  installState: InstallState = "unknown",
): ExtAgentInstallGuide {
  const id = agentId.trim() || "pi";
  const info = getExtAgentInstallInfo(id);
  const isInstalled = installState === "installed";

  if (id === "pi") {
    return {
      agentId: id,
      installed: true,
      command: "pi",
      installCommand: "",
      verifyCommand: "pi --version",
      startHint: info.startHint,
      ...(info.homepageUrl ? { homepageUrl: info.homepageUrl } : {}),
      homepageLabel: info.homepageLabel,
      commonIssues: [],
    };
  }

  const row = INSTALL_TABLE[id];
  if (!row) {
    // Unknown / custom agent. We have a homepage label from
    // getExtAgentInstallInfo, but no install command. UI should
    // render a "no install recipe available" hint.
    return {
      agentId: id,
      installed: isInstalled,
      command: id,
      installCommand: "",
      verifyCommand: `${id} --version`,
      startHint: info.startHint,
      ...(info.homepageUrl ? { homepageUrl: info.homepageUrl } : {}),
      homepageLabel: info.homepageLabel,
      commonIssues: [
        `No install recipe bundled for "${id}". Check the upstream docs for install instructions.`,
      ],
    };
  }

  return {
    agentId: id,
    installed: isInstalled,
    command: row.command,
    installCommand: row.installCommand,
    verifyCommand: row.verifyCommand,
    startHint: info.startHint,
    ...(row.homepageUrl ? { homepageUrl: row.homepageUrl } : {}),
    homepageLabel: row.homepageLabel,
    commonIssues: row.commonIssues,
  };
}
