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
  /**
   * Absolute project folder on the home node (cwd for coding agents).
   * Used by Codex / Claude Code / Cursor / Aider / MiniMax; ignored by others.
   */
  projectPath?: string;
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
  // Phase 55D — codex (OpenAI Codex CLI) and claudecode (Anthropic
  // Claude Code). Both ship as their own supervised daemons
  // (55B / 55C). Defaults to `enabled: true` so the Settings picker
  // shows them out of the box; users can disable them in Settings
  // when the binary isn't installed. The bridge sidecar ports
  // (8023 / 8024) are additive to the existing 8010 / 8020 / 8021
  // / 8022 — no port below 1024.
  {
    id: "codex",
    name: "Codex",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8023/message",
    enabled: true,
  },
  {
    id: "claudecode",
    name: "Claude Code",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8024/message",
    enabled: true,
  },
  // Phase 56A / 56B / 56C — three one-shot CLI backends sharing the
  // `OneShotCliBackend` base (subprocess per ask). All enabled by
  // default like codex/claudecode; users can disable when the
  // binary isn't installed. Sidecar ports 8025 / 8026 / 8027
  // are additive to the existing 8010 / 8020-8024.
  {
    id: "cursor",
    name: "Cursor CLI",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8025/message",
    enabled: true,
  },
  {
    id: "aider",
    name: "Aider",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8026/message",
    enabled: true,
  },
  {
    id: "mmx",
    name: "MiniMax MMX-CLI",
    adapter: "envoymesh-message",
    url: "http://127.0.0.1:8027/message",
    enabled: true,
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
 * How Ext Agent chat should handle a slash command.
 * - `envoy` — handled by EnvoyMesh UI/node (never sent as chat text)
 * - `forward` — sent as plain text to `backend.ask()` (agent may honor it)
 * - `hybrid` — Envoy may apply local side effects and/or forward
 */
export type ExtAgentCommandIntercept = "envoy" | "forward" | "hybrid";

/** One slash command shown in Ext Agent chat autocomplete. */
export interface ExtAgentCommandDescriptor {
  /** Full slash token including leading `/`, e.g. `/model`. */
  slash: string;
  /** Short human summary for the suggestion row. */
  summary: string;
  /** Optional args hint, e.g. `"<name> | list"`. */
  argsHint?: string;
  intercept: ExtAgentCommandIntercept;
  source: "static" | "dynamic";
}

/**
 * Per-agent slash catalog for Ext Agent chat (Social / EnvoyGo).
 * HomeClaw returns an empty `commands` list with a limitation note.
 */
export interface ExtAgentCommandCatalog {
  agentId: string;
  agentName: string;
  commands: ExtAgentCommandDescriptor[];
  /** Optional model ids for `/model` autocomplete (Hermes/OpenHuman). */
  models?: Array<{ id: string; label?: string }>;
  /** True when `/model` is handled by Envoy (session override), not forwarded. */
  supportsSessionModel?: boolean;
  /** Current session model override (if any). */
  sessionModel?: string;
  /** Default model used when no session override is set. */
  defaultModel?: string;
  catalogVersion: string;
  fetchedAt: string;
  limitations?: string[];
}

/** Params for {@link NodeService.getExtAgentCommandCatalog}. */
export interface GetExtAgentCommandCatalogParams {
  /** When omitted, uses the currently active Ext Agent. */
  agentId?: string;
}

/** Params for {@link NodeService.setExtAgentSessionModel}. */
export interface SetExtAgentSessionModelParams {
  /** When omitted, uses the currently active Ext Agent. */
  agentId?: string;
  /**
   * Model id to use for subsequent Ext Agent turns in this session.
   * Empty / omitted clears the override (back to default).
   */
  model?: string | null;
}

export interface SetExtAgentSessionModelResult {
  agentId: string;
  /** Resolved model after set/clear (undefined means default). */
  sessionModel?: string;
  supportsSessionModel: boolean;
}

/** Params for {@link NodeService.getHomeFsInfo} / list — owner-only. */
export interface HomeFsInfo {
  platform: "darwin" | "linux" | "win32" | "other";
  pathSep: string;
  homeDir: string;
  roots: string[];
}

export interface HomeFsEntry {
  name: string;
  kind: "dir" | "file";
  path: string;
}

export interface ListHomeFsEntriesParams {
  /** Absolute path on the home node; omit to start at homeDir. */
  path?: string;
  dirsOnly?: boolean;
}

export interface ListHomeFsEntriesResult {
  path: string;
  parent?: string;
  entries: HomeFsEntry[];
}

export interface GetExtAgentProjectPathParams {
  agentId?: string;
}

export interface ExtAgentProjectPathResult {
  agentId: string;
  /** Absolute path when set; omitted when unset / cleared. */
  projectPath?: string;
  /** False for agents that ignore project folders (Hermes, HomeClaw, …). */
  usesProjectPath: boolean;
}

export interface SetExtAgentProjectPathParams {
  agentId?: string;
  /** Absolute directory on the home node; null/empty clears. */
  projectPath?: string | null;
}

export interface PreviewHomeFsFileParams {
  /** Absolute file path on the home node. */
  path: string;
}

export type HomeFsPreviewKind =
  | "image"
  | "pdf"
  | "html"
  | "markdown"
  | "text"
  | "office"
  | "unsupported"
  | "error";

export interface PreviewHomeFsFileResult {
  path: string;
  title: string;
  kind: HomeFsPreviewKind;
  mediaType?: string;
  /** Sanitized HTML document fragment/body for WebView. */
  html?: string;
  /** Plain text when html is not used. */
  text?: string;
  /** Base64 payload for binary previews (image/pdf). */
  contentBase64?: string;
  /** Human-readable error when kind is error/unsupported. */
  error?: string;
  byteLength?: number;
}

/** MiniMax MMX-CLI media kinds for Envoy-intercepted slash commands. */
export type MmxMediaKind =
  | "image"
  | "video"
  | "speech"
  | "music"
  | "vision"
  | "search"
  | "quota"
  | "auth";

export interface RunMmxMediaCommandParams {
  kind: MmxMediaKind;
  /** Prompt / synthesis text / search query. */
  prompt?: string;
  /** Vision: local absolute path or URL. */
  target?: string;
}

export interface RunMmxMediaCommandResult {
  ok: boolean;
  kind: MmxMediaKind;
  /** Absolute path on the home node when a file was written. */
  path?: string;
  text?: string;
  mimeType?: string;
  contentBase64?: string;
  error?: string;
}

/** Reveal an absolute path on the home node in the OS file manager (owner only). */
export interface RevealHomeFsPathParams {
  path: string;
}

export interface RevealHomeFsPathResult {
  ok: boolean;
  error?: string;
}

/** Agents that honor {@link ExtAgentDefinition.projectPath} as cwd. */
export const EXT_AGENTS_WITH_PROJECT_PATH = [
  "codex",
  "claudecode",
  "cursor",
  "aider",
  "mmx",
] as const;

export function extAgentUsesProjectPath(agentId: string | undefined | null): boolean {
  const id = agentId?.trim().toLowerCase() ?? "";
  return (EXT_AGENTS_WITH_PROJECT_PATH as readonly string[]).includes(id);
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
      return "Codex CLI found but app-server is not ready — confirm OPENAI_API_KEY is in the home-node environment, then retry (or send a chat message to warm it up).";
    case "claudecode":
      return "Claude Code CLI found but not authenticated — run `claude auth login`, or set ANTHROPIC_API_KEY in the home-node environment, then retry.";
    case "cursor":
      return "Install the Cursor CLI: `curl https://cursor.com/install -fsS | bash`. First run opens a browser for OAuth login; ensure `cursor-agent --version` works.";
    case "aider":
      return "Install Aider: `pip install aider-chat` (or `python -m pip install aider-install` then `aider-install`). Set ANTHROPIC_API_KEY or OPENAI_API_KEY for the model provider.";
    case "mmx":
      return "Install MMX-CLI: `npm install -g mmx-cli`. Then run `mmx auth login --api-key sk-xxxx` to authenticate; the CLI auto-detects global vs CN region from the key prefix.";
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
    case "cursor":
      return {
        agentId: id,
        homepageUrl: "https://docs.cursor.com/en/cli",
        homepageLabel: "Cursor CLI docs",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    case "aider":
      return {
        agentId: id,
        homepageUrl: "https://aider.chat/docs/",
        homepageLabel: "Aider docs",
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      };
    case "mmx":
      return {
        agentId: id,
        homepageUrl: "https://github.com/MiniMax-AI/cli",
        homepageLabel: "MMX-CLI on GitHub",
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
      "Run `claude auth login` (browser OAuth) or set ANTHROPIC_API_KEY in the home-node environment.",
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
  cursor: {
    command: "cursor-agent",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    verifyCommand: "cursor-agent --version",
    homepageUrl: "https://docs.cursor.com/en/cli",
    homepageLabel: "Cursor CLI docs",
    commonIssues: [
      "First run opens a browser for OAuth login (no terminal API-key prompt).",
      "If `cursor-agent --version` fails, ensure the install path (default ~/.cursor/bin) is on $PATH.",
      "Cursor CLI requires Node.js 18+; verify with `node --version`.",
    ],
  },
  aider: {
    command: "aider",
    installCommand: "pip install aider-chat",
    verifyCommand: "aider --version",
    homepageUrl: "https://aider.chat/docs/",
    homepageLabel: "Aider docs",
    commonIssues: [
      "Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your shell before running aider.",
      "If `aider --version` fails, try `python -m pip install aider-chat --upgrade`.",
      "Aider requires Python 3.8+; verify with `python --version`.",
    ],
  },
  mmx: {
    command: "mmx",
    installCommand: "npm install -g mmx-cli",
    verifyCommand: "mmx --version",
    homepageUrl: "https://github.com/MiniMax-AI/cli",
    homepageLabel: "MMX-CLI on GitHub",
    commonIssues: [
      "Run `mmx auth login --api-key sk-xxxx` to authenticate; OAuth (browser) is also supported.",
      "Region is auto-detected by the CLI from the API key prefix (global vs CN).",
      "MMX-CLI requires Node.js 18+; verify with `node --version`.",
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
      // Pi runs in-process (no CLI binary). The `command` field is
      // exposed for the Install Required card's "verify" line, but
      // the card is not rendered for Pi (installed: true). Keeping
      // the field here so the shape stays consistent.
      command: "pi",
      installCommand: "",
      verifyCommand: "",
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
    // render a "no install recipe" hint. The `command` / `verify`
    // fields are intentionally empty — we don't guess at a binary
    // name the user might not even have.
    return {
      agentId: id,
      installed: isInstalled,
      command: "",
      installCommand: "",
      verifyCommand: "",
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
