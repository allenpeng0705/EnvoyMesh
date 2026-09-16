/**
 * Coding-tab provider catalog (Paseo-shaped ACP / CLI list).
 *
 * IA reference only — command lines and install URLs match public docs /
 * Paseo's in-app catalog. Runtime wiring lives in `@envoymesh/harness`.
 */

export type CodingSidecarKind =
  | "claudecode"
  | "codex"
  | "opencode"
  | "cursor"
  | "codewhale";

export type CodingProviderEntry = {
  id: string;
  title: string;
  description: string;
  installLink: string;
  /** argv[0] is the binary (`npx` / `uvx` / PATH CLI). */
  command: readonly [string, ...string[]];
  env?: Readonly<Record<string, string>>;
  /**
   * When set, Coding asks use the existing Ext Agent sidecar / one-shot
   * backend instead of a generic ACP spawn.
   */
  sidecarKind?: CodingSidecarKind;
  installCommand?: string;
  verifyCommand?: string;
};

type Row = Omit<CodingProviderEntry, "command"> & {
  command: readonly [string, ...string[]];
};

const DEDICATED: readonly Row[] = [
  {
    id: "claudecode",
    title: "Claude Code",
    description: "Anthropic's Claude Code CLI",
    installLink: "https://docs.claude.com/en/docs/claude-code",
    command: ["claude"],
    sidecarKind: "claudecode",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    verifyCommand: "claude --version",
  },
  {
    id: "codex",
    title: "Codex",
    description: "OpenAI Codex CLI",
    installLink: "https://github.com/openai/codex",
    command: ["codex"],
    sidecarKind: "codex",
    installCommand: "npm install -g @openai/codex",
    verifyCommand: "codex --version",
  },
  {
    id: "opencode",
    title: "OpenCode",
    description: "Open-source coding assistant",
    installLink: "https://opencode.ai/",
    command: ["opencode"],
    sidecarKind: "opencode",
    installCommand: "curl -fsSL https://opencode.ai/install | bash",
    verifyCommand: "opencode --version",
  },
  {
    id: "cursor",
    title: "Cursor",
    description: "Cursor Agent CLI",
    installLink: "https://docs.cursor.com/en/cli/overview",
    command: ["cursor-agent", "acp"],
    sidecarKind: "cursor",
    installCommand: "curl https://cursor.com/install -fsS | bash",
    verifyCommand: "cursor-agent --version",
  },
  {
    id: "codewhale",
    title: "CodeWhale",
    description: "Terminal coding agent for DeepSeek V4 and open models",
    installLink: "https://codewhale.net/",
    command: ["codewhale", "serve", "--acp"],
    sidecarKind: "codewhale",
    installCommand: "curl -fsSL https://codewhale.net/install.sh | sh",
    verifyCommand: "codewhale --version",
  },
];

/** DeepSeek Harness — same CodeWhale sidecar EnvoyMesh already runs. */
const DEEPSEEK: readonly Row[] = [
  {
    id: "deepseek-harness",
    title: "DeepSeek Harness",
    description:
      "DeepSeek terminal coding agent (CodeWhale / DeepSeek V4). Same engine as CodeWhale.",
    installLink: "https://codewhale.net/",
    command: ["codewhale", "serve", "--acp"],
    sidecarKind: "codewhale",
    installCommand: "curl -fsSL https://codewhale.net/install.sh | sh",
    verifyCommand: "codewhale --version",
  },
  {
    id: "deepseek-tui",
    title: "DeepSeek TUI",
    description: "Paseo-compatible alias for CodeWhale / DeepSeek V4",
    installLink: "https://codewhale.net/",
    command: ["codewhale", "serve", "--acp"],
    sidecarKind: "codewhale",
    installCommand: "curl -fsSL https://codewhale.net/install.sh | sh",
    verifyCommand: "codewhale --version",
  },
];

const NATIVE_EXTRA: readonly Row[] = [
  {
    id: "copilot",
    title: "GitHub Copilot",
    description: "GitHub Copilot CLI via Agent Client Protocol",
    installLink:
      "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli",
    command: ["copilot", "--acp"],
    installCommand: "npm install -g @github/copilot",
    verifyCommand: "copilot --version",
  },
  {
    id: "omp",
    title: "Oh My Pi",
    description: "Multi-provider coding agent (Pi family)",
    installLink: "https://github.com/badlogic/pi-mono",
    command: ["omp", "--acp"],
    verifyCommand: "omp --version",
  },
];

/** Paseo in-app ACP catalog (hermes omitted — collides with Ext Agent Hermes). */
const ACP: readonly Row[] = [
  {
    id: "agoragentic-acp",
    title: "Agoragentic",
    description: "Agent marketplace with ACP",
    installLink: "https://agoragentic.com",
    command: ["npx", "-y", "agoragentic-mcp", "--acp"],
  },
  {
    id: "amp-acp",
    title: "Amp",
    description: "ACP wrapper for Amp",
    installLink: "https://github.com/tao12345666333/amp-acp",
    command: ["amp-acp"],
    verifyCommand: "amp-acp --version",
  },
  {
    id: "auggie",
    title: "Auggie CLI",
    description: "Augment Code agent",
    installLink: "https://www.augmentcode.com/",
    command: ["npx", "-y", "@augmentcode/auggie", "--acp"],
    env: { AUGMENT_DISABLE_AUTO_UPDATE: "1" },
  },
  {
    id: "autohand",
    title: "Autohand Code",
    description: "Autohand AI coding agent",
    installLink: "https://www.autohand.ai/cli/",
    command: ["npx", "-y", "@autohandai/autohand-acp"],
  },
  {
    id: "cline",
    title: "Cline",
    description: "Autonomous coding agent CLI",
    installLink: "https://cline.bot/cli",
    command: ["npx", "-y", "cline", "--acp"],
  },
  {
    id: "codebuddy-code",
    title: "Codebuddy Code",
    description: "Tencent Cloud coding CLI",
    installLink: "https://www.codebuddy.cn/cli/",
    command: ["codebuddy", "--acp"],
    verifyCommand: "codebuddy --version",
  },
  {
    id: "cortex-code",
    title: "Cortex Code",
    description: "Snowflake Cortex Code",
    installLink:
      "https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code-cli",
    command: ["cortex", "acp", "serve"],
    verifyCommand: "cortex --version",
  },
  {
    id: "corust-agent",
    title: "Corust Agent",
    description: "Rust-focused coding partner",
    installLink: "https://github.com/Corust-ai/corust-agent-release/releases",
    command: ["corust-agent-acp"],
  },
  {
    id: "crow-cli",
    title: "crow-cli",
    description: "Minimal ACP-native coding agent",
    installLink: "https://crow-ai.dev/",
    command: ["crow-cli", "acp"],
    verifyCommand: "crow-cli --version",
  },
  {
    id: "deepagents",
    title: "DeepAgents",
    description: "LangChain DeepAgents",
    installLink: "https://docs.langchain.com/oss/javascript/deepagents/overview",
    command: ["npx", "-y", "deepagents-acp"],
  },
  {
    id: "devin",
    title: "Devin CLI",
    description: "Cognition Devin for Terminal (ACP)",
    installLink: "https://cli.devin.ai/docs",
    command: ["devin", "acp"],
    verifyCommand: "devin --version",
  },
  {
    id: "dimcode",
    title: "DimCode",
    description: "Multi-model coding agent",
    installLink: "https://dimcode.dev/docs/acp.html",
    command: ["npx", "-y", "dimcode", "acp"],
  },
  {
    id: "dirac",
    title: "Dirac",
    description: "Hash-anchored parallel edits, open source",
    installLink: "https://dirac.run",
    command: ["npx", "-y", "dirac-cli", "--acp"],
  },
  {
    id: "factory-droid",
    title: "Factory Droid",
    description: "Factory AI Droid coding agent",
    installLink: "https://factory.ai/product/cli",
    command: ["npx", "-y", "droid", "exec", "--output-format", "acp-daemon"],
    env: {
      DROID_DISABLE_AUTO_UPDATE: "true",
      FACTORY_DROID_AUTO_UPDATE_ENABLED: "false",
    },
  },
  {
    id: "fast-agent",
    title: "fast-agent",
    description: "Multi-provider coding agent",
    installLink: "https://fast-agent.ai/acp/",
    command: ["uvx", "--from", "fast-agent-acp", "fast-agent-acp", "-x"],
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    description: "Google Gemini CLI",
    installLink: "https://geminicli.com",
    command: ["npx", "-y", "@google/gemini-cli", "--acp"],
  },
  {
    id: "gjc",
    title: "Gajae Code",
    description: "Plan-before-mutation coding agent",
    installLink: "https://gajae-code.com",
    command: ["gjc", "acp"],
    env: { GJC_ACP_PERMISSION_MODE: "prompt" },
  },
  {
    id: "glm-acp-agent",
    title: "GLM Agent",
    description: "Zhipu GLM coding agent",
    installLink: "https://github.com/stefandevo/glm-acp-agent",
    command: ["npx", "-y", "glm-acp-agent"],
  },
  {
    id: "goose",
    title: "goose",
    description: "Block goose coding agent",
    installLink: "https://block.github.io/goose/",
    command: ["goose", "acp"],
    verifyCommand: "goose --version",
  },
  {
    id: "grok",
    title: "Grok",
    description: "xAI Grok Build coding CLI",
    installLink: "https://docs.x.ai/build/overview",
    command: ["grok", "agent", "stdio"],
    verifyCommand: "grok --version",
  },
  {
    id: "junie",
    title: "Junie",
    description: "JetBrains Junie CLI",
    installLink: "https://junie.jetbrains.com/docs/junie-cli-acp.html",
    command: ["junie", "--acp", "true"],
  },
  {
    id: "kilo",
    title: "Kilo",
    description: "Open source coding agent",
    installLink: "https://kilo.ai/docs/code-with-ai/platforms/cli",
    command: ["kilo", "acp"],
    verifyCommand: "kilo --version",
  },
  {
    id: "kiro",
    title: "Kiro CLI",
    description: "Amazon Kiro coding agent",
    installLink: "https://kiro.dev/docs/cli/acp/",
    command: ["kiro-cli", "acp"],
  },
  {
    id: "kimi",
    title: "Kimi Code CLI",
    description: "Moonshot Kimi terminal agent",
    installLink: "https://github.com/MoonshotAI/kimi-code",
    command: ["kimi", "acp"],
    verifyCommand: "kimi --version",
  },
  {
    id: "minimax-code",
    title: "MiniMax Code",
    description: "MiniMax terminal coding agent (mcode ACP)",
    installLink: "https://agent.minimax.io/docs/cli/quick-start",
    command: ["mcode", "acp"],
    installCommand:
      "curl -fsSL https://filecdn.minimax.chat/public/install.sh | bash",
    verifyCommand: "mcode --version",
  },
  {
    id: "minion-code",
    title: "Minion Code",
    description: "Minion-framework coding assistant",
    installLink: "https://github.com/femto/minion-code",
    command: ["uvx", "--from", "minion-code", "minion-code", "acp"],
  },
  {
    id: "mistral-vibe",
    title: "Mistral Vibe",
    description: "Mistral coding assistant",
    installLink: "https://github.com/mistralai/mistral-vibe",
    command: ["vibe-acp"],
  },
  {
    id: "nova",
    title: "Nova",
    description: "Compass AI Nova",
    installLink: "https://www.compassap.ai/portfolio/nova.html",
    command: ["npx", "-y", "@compass-ai/nova", "acp"],
  },
  {
    id: "poolside",
    title: "Poolside",
    description: "Poolside coding agent",
    installLink: "https://docs.poolside.ai/cli/pool",
    command: ["pool", "acp"],
  },
  {
    id: "qoder",
    title: "Qoder CLI",
    description: "Qoder agentic coding assistant",
    installLink: "https://qoder.com",
    command: ["npx", "-y", "@qoder-ai/qodercli", "--acp"],
  },
  {
    id: "qwen-code",
    title: "Qwen Code",
    description: "Alibaba Qwen coding assistant",
    installLink: "https://qwenlm.github.io/qwen-code-docs/en/users/overview",
    command: ["npx", "-y", "@qwen-code/qwen-code", "--acp"],
  },
  {
    id: "sigit",
    title: "siGit Code",
    description: "Local-first coding agent",
    installLink: "https://github.com/getsigit/sigit",
    command: ["sigit"],
    verifyCommand: "sigit --version",
  },
  {
    id: "stakpak",
    title: "Stakpak",
    description: "Open-source DevOps agent",
    installLink: "https://stakpak.dev/",
    command: ["stakpak", "acp"],
    verifyCommand: "stakpak --version",
  },
  {
    id: "traecli",
    title: "TRAE CLI",
    description: "ByteDance TRAE coding agent",
    installLink: "https://docs.trae.cn/cli_get-started-with-trae-cli",
    command: ["traecli", "acp", "serve"],
    verifyCommand: "traecli --version",
  },
  {
    id: "vtcode",
    title: "VT Code",
    description: "Open-source coding agent with ACP",
    installLink: "https://github.com/vinhnx/VTCode/blob/main/docs/guides/zed-acp.md",
    command: ["vtcode", "acp"],
    env: { VT_ACP_ENABLED: "1", VT_ACP_ZED_ENABLED: "1" },
  },
];

export const CODING_PROVIDER_CATALOG: readonly CodingProviderEntry[] = [
  ...DEDICATED,
  ...DEEPSEEK,
  ...NATIVE_EXTRA,
  ...ACP,
];

const BY_ID = new Map(CODING_PROVIDER_CATALOG.map((e) => [e.id, e]));

export function getCodingProvider(id: string): CodingProviderEntry | undefined {
  return BY_ID.get(id.trim());
}

export function codingProviderProbeBinary(entry: CodingProviderEntry): string {
  return entry.command[0];
}

export function codingProviderIsBundler(entry: CodingProviderEntry): boolean {
  const bin = entry.command[0];
  return bin === "npx" || bin === "uvx" || bin === "pnpm" || bin === "bunx";
}

/** npm package id for `npx -y <pkg> …` recipes (EnvoyCoder-style copy). */
export function codingProviderBundlerPackage(
  entry: CodingProviderEntry,
): string | undefined {
  if (!codingProviderIsBundler(entry)) return undefined;
  // Typical: ["npx", "-y", "@scope/pkg", …] or ["uvx", "--from", "pkg", …]
  const args = entry.command.slice(1);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "-y" || a === "--yes") continue;
    if (a === "--from" && args[i + 1]) return args[i + 1];
    if (a.startsWith("-")) continue;
    return a;
  }
  return undefined;
}

/**
 * Install / first-run guidance for catalog agents (EnvoyCoder RowGuide parity).
 *
 * Bundler recipes (`npx` / `uvx`): the agent package is fetched on first run —
 * never treat the bundler binary alone as “installed”.
 */
export function codingProviderInstallHint(
  entry: CodingProviderEntry,
  opts?: { bundlerOnPath?: boolean | null },
): string {
  if (entry.installCommand) {
    return `Install ${entry.title}: \`${entry.installCommand}\`. Docs: ${entry.installLink}`;
  }
  if (codingProviderIsBundler(entry)) {
    const bundler = entry.command[0]!;
    const cmd = entry.command.join(" ");
    const pkg = codingProviderBundlerPackage(entry);
    const pkgBit = pkg ? ` (${pkg})` : "";
    const via = bundler === "uvx" ? "PyPI via uvx" : "npm";
    if (opts?.bundlerOnPath === false) {
      if (bundler === "uvx") {
        return (
          `Install uv so that \`uvx\` is on PATH — ` +
          `${entry.title} itself needs no separate install; it is fetched from ${via} on the first run${pkgBit}. ` +
          `Get uv: https://docs.astral.sh/uv/ — agent docs: ${entry.installLink}`
        );
      }
      return (
        `Install Node.js so that \`${bundler}\` is on PATH — ` +
        `${entry.title} itself needs no separate install; it is fetched from ${via} on the first run${pkgBit}. ` +
        `Get Node: https://nodejs.org/en/download — agent docs: ${entry.installLink}`
      );
    }
    return (
      `${entry.title} is fetched from ${via} on the first run${pkgBit}. ` +
      `No separate install — start a Coding task with this agent, or run once: \`${cmd}\`. ` +
      `Docs: ${entry.installLink}`
    );
  }
  return `Install ${entry.title} so \`${entry.command[0]}\` is on PATH. Docs: ${entry.installLink}`;
}

/** Docs URL for the install card (Node/uv download when the bundler is missing). */
export function codingProviderInstallDocsUrl(
  entry: CodingProviderEntry,
  opts?: { bundlerOnPath?: boolean | null },
): string {
  if (codingProviderIsBundler(entry) && opts?.bundlerOnPath === false) {
    return entry.command[0] === "uvx"
      ? "https://docs.astral.sh/uv/"
      : "https://nodejs.org/en/download";
  }
  return entry.installLink;
}
