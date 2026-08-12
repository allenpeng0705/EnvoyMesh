/**
 * Per-agent Ext Agent slash catalogs for Social / EnvoyGo chat autocomplete.
 *
 * Static baselines ship with the home node; claudecode can overlay
 * `system/init.slash_commands` captured from the SDK. HomeClaw is excluded
 * (empty list + limitation note).
 *
 * Catalogs aim to mirror each product’s published slash surface. Most verbs
 * are `forward` (sent as chat text into `backend.ask()`); only Envoy-handled
 * intercepts run locally. Agents driven as one-shot CLI / app-server may ignore
 * TUI-only verbs — see per-agent `limitations`.
 */
import type {
  ExtAgentCommandCatalog,
  ExtAgentCommandDescriptor,
  ExtAgentCommandIntercept,
} from "@envoymesh/api";
import { supportsExtAgentSessionModel } from "./session-model-store.js";
import {
  mergeMmxMediaLimitations,
  mergeMmxMediaSlashCommands,
} from "../mmx-media-slash.js";

export const EXT_AGENT_COMMAND_CATALOG_VERSION = "3";

type StaticCmd = {
  slash: string;
  summary: string;
  argsHint?: string;
  intercept?: ExtAgentCommandIntercept;
};

function normalizeSlash(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function toDescriptor(
  cmd: StaticCmd,
  source: ExtAgentCommandDescriptor["source"],
): ExtAgentCommandDescriptor {
  return {
    slash: normalizeSlash(cmd.slash),
    summary: cmd.summary,
    ...(cmd.argsHint ? { argsHint: cmd.argsHint } : {}),
    intercept: cmd.intercept ?? "forward",
    source,
  };
}

/** Forwarded slash (agent may honor in TUI/REPL; bridge often cannot). */
function fwd(slash: string, summary: string, argsHint?: string): StaticCmd {
  return {
    slash,
    summary,
    ...(argsHint ? { argsHint } : {}),
    intercept: "forward",
  };
}

const HELP: StaticCmd = {
  slash: "/help",
  summary: "List Ext Agent slash commands for this agent",
  intercept: "envoy",
};

const BRIDGE_LIMIT =
  "Most CLI slash verbs are forwarded as plain chat text; the agent may ignore them outside its interactive TUI/REPL.";

const STATIC_BY_AGENT: Record<string, { commands: StaticCmd[]; limitations?: string[] }> = {
  homeclaw: {
    commands: [],
    limitations: [
      "HomeClaw has no Envoy slash menu — use HomeClaw’s own UI or CLI.",
    ],
  },
  pi: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Show or change model (set in Settings → AI for now)",
        argsHint: "[name | list]",
        intercept: "forward",
      },
      fwd("/new", "Start a fresh conversation (forwarded)"),
    ],
    limitations: [
      "Pi Ext Agent chat is prompt-only; Terminal Agent has richer /model control.",
    ],
  },
  hermes: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Show, list, or set Hermes model for this session",
        argsHint: "[name | list | default]",
        intercept: "envoy",
      },
    ],
    limitations: [BRIDGE_LIMIT],
  },
  openhuman: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Show, list, or set OpenHuman model (OpenAI /v1 transport only)",
        argsHint: "[name | list | default]",
        intercept: "forward",
      },
    ],
    limitations: [
      "Session /model works only when OpenHuman is on the /v1 API transport (not core RPC).",
      BRIDGE_LIMIT,
    ],
  },

  /**
   * Codex CLI built-in slash commands
   * (https://developers.openai.com/codex/cli/slash-commands).
   * Envoy uses `codex app-server`; many verbs are TUI-native.
   */
  codex: {
    commands: [
      HELP,
      fwd("/permissions", "Set what Codex can do without asking first"),
      fwd("/ide", "Include open files, selection, and other IDE context"),
      fwd("/keymap", "Remap TUI keyboard shortcuts"),
      fwd("/vim", "Toggle Vim mode for the composer"),
      fwd(
        "/setup-default-sandbox",
        "Set up the elevated agent sandbox (Windows only)",
      ),
      fwd(
        "/sandbox-add-read-dir",
        "Grant sandbox read access to an extra directory (Windows)",
        "<path>",
      ),
      fwd("/agent", "Switch the active agent thread"),
      fwd("/subagents", "Alias for /agent — inspect or continue subagent threads"),
      fwd("/apps", "Browse apps (connectors) and insert them into your prompt"),
      fwd("/plugins", "Browse installed and discoverable plugins"),
      fwd("/hooks", "View and manage lifecycle hooks"),
      fwd("/clear", "Clear the terminal and start a fresh chat"),
      fwd("/rename", "Rename the current chat", "[name]"),
      fwd("/archive", "Archive the current session and exit Codex"),
      fwd("/delete", "Permanently delete the current session and exit"),
      fwd("/compact", "Summarize the visible chat to free tokens", "[instructions]"),
      fwd("/copy", "Copy the latest completed Codex output"),
      fwd("/diff", "Show the Git diff, including untracked files"),
      fwd("/exit", "Exit the CLI (same as /quit)"),
      fwd("/quit", "Exit the CLI"),
      fwd("/experimental", "Toggle experimental features"),
      fwd("/approve", "Approve one retry of a recent auto-review denial"),
      fwd("/memories", "Configure memory use and generation"),
      fwd("/skills", "Browse and use skills"),
      fwd("/import", "Import Claude Code setup, project files, and recent chats"),
      fwd("/feedback", "Send logs to the Codex maintainers"),
      fwd("/init", "Generate an AGENTS.md scaffold in the current directory"),
      fwd("/logout", "Sign out of Codex"),
      fwd("/mcp", "List configured MCP tools", "[verbose]"),
      fwd("/mention", "Attach a file to the chat", "<path>"),
      {
        slash: "/model",
        summary: "Choose the active model (and reasoning effort when available)",
        argsHint: "[name | list]",
        intercept: "forward",
      },
      fwd("/fast", "Toggle Fast service tier when the model catalog exposes one"),
      fwd("/plan", "Switch to plan mode and optionally send a prompt", "[prompt]"),
      fwd("/goal", "Set, edit, pause, resume, view, or clear a task goal", "[…]"),
      fwd("/personality", "Choose a communication style for responses"),
      fwd("/ps", "Show background terminals and their recent output"),
      fwd("/stop", "Stop all background terminals"),
      fwd("/fork", "Fork the current chat into a new chat"),
      fwd("/app", "Continue the current session in the ChatGPT desktop app"),
      fwd("/side", "Start an ephemeral side chat"),
      fwd("/btw", "Alias for /side — ephemeral side chat"),
      fwd("/raw", "Toggle raw scrollback mode"),
      fwd("/resume", "Resume a saved chat from your session list"),
      fwd("/new", "Start a new chat inside the same CLI session"),
      fwd("/review", "Ask Codex to review your working tree"),
      fwd("/status", "Display session configuration and token usage"),
      fwd("/usage", "View account token usage or rate-limit reset"),
      fwd("/debug-config", "Print config layer and requirements diagnostics"),
      fwd("/statusline", "Configure TUI status-line fields interactively"),
      fwd("/title", "Configure terminal window or tab title fields"),
      fwd("/theme", "Choose a syntax-highlighting theme"),
      fwd("/pets", "Choose or hide a terminal pet"),
      fwd("/pet", "Alias for /pets"),
    ],
    limitations: [
      "Envoy drives Codex via app-server, not the interactive TUI — many slash verbs only work in the Codex CLI TUI.",
      BRIDGE_LIMIT,
    ],
  },

  /**
   * Claude Code built-in commands (https://code.claude.com/docs/en/commands).
   * Live `system/init.slash_commands` overlay after the first turn.
   */
  claudecode: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Show, list, or set Claude model for this session",
        argsHint: "[name | list | default]",
        intercept: "envoy",
      },
      fwd("/add-dir", "Add a working directory for file access", "<path>"),
      fwd("/advisor", "Enable or disable the advisor tool", "[model|off]"),
      fwd("/agents", "Create or manage subagents (ask Claude / edit configs)"),
      fwd("/autocompact", "Set the auto-compact window", "[auto|size]"),
      fwd("/autofix-pr", "Watch the current branch PR and push CI/review fixes", "[prompt]"),
      fwd("/background", "Detach session as a background agent", "[prompt]"),
      fwd("/bg", "Alias for /background"),
      fwd("/batch", "Orchestrate large parallel codebase changes", "<task>"),
      fwd("/branch", "Branch the conversation to try another direction", "[name]"),
      fwd("/btw", "Ask a side question without adding to conversation", "[question]"),
      fwd("/bug", "Report a bug or share the conversation", "[report]"),
      fwd("/cd", "Move this session to a new working directory", "<path>"),
      fwd("/chrome", "Configure Claude in Chrome settings"),
      fwd("/claude-api", "Claude API / Managed Agents skill", "[migrate|…]"),
      fwd("/clear", "Start a new conversation with empty context", "[name]"),
      fwd("/reset", "Alias for /clear"),
      fwd("/new", "Alias for /clear"),
      fwd("/code-review", "Review the current diff or a PR", "[level] [--fix] […]"),
      fwd("/review", "Alias for /code-review"),
      fwd("/color", "Set the prompt bar color", "[color|default]"),
      fwd("/compact", "Summarize conversation to free context", "[instructions]"),
      fwd("/config", "Open Settings or set key=value", "[key=value…]"),
      fwd("/settings", "Alias for /config"),
      fwd("/context", "Visualize current context usage", "[all]"),
      fwd("/copy", "Copy the last assistant response", "[N]"),
      fwd("/cost", "Alias for /usage — session cost and limits"),
      fwd("/dataviz", "Design guidance for charts and dashboards", "[request]"),
      fwd("/debug", "Enable debug logging / troubleshoot", "[description]"),
      fwd("/deep-research", "Fan out web research into a cited report", "<question>"),
      fwd("/design-login", "Authorize design-system access for /design-sync"),
      fwd("/design-sync", "Sync React design system to Claude Design", "[hint]"),
      fwd("/desktop", "Continue in the Claude Code Desktop app"),
      fwd("/app", "Alias for /desktop"),
      fwd("/diff", "Interactive diff of uncommitted / per-turn changes"),
      fwd("/doctor", "Setup checkup that diagnoses and can fix issues"),
      fwd("/checkup", "Alias for /doctor"),
      fwd("/effort", "Set model effort level", "[level|auto]"),
      fwd("/exit", "Exit the CLI"),
      fwd("/quit", "Alias for /exit"),
      fwd("/export", "Export the conversation as plain text", "[filename]"),
      fwd("/fast", "Toggle fast mode", "[on|off]"),
      fwd("/feedback", "Send product feedback", "[report]"),
      fwd("/fewer-permission-prompts", "Propose an allowlist from transcript patterns"),
      fwd("/focus", "Toggle focus view (fullscreen)"),
      fwd("/fork", "Copy conversation into a new background session", "[prompt]"),
      fwd("/goal", "Set or clear a multi-turn goal", "[condition|clear]"),
      fwd("/hooks", "View hook configurations for tool events"),
      fwd("/ide", "Manage IDE integrations and show status"),
      fwd("/import", "Import config from Codex or Gemini CLI", "[codex|gemini] […]"),
      fwd("/init", "Initialize project with a CLAUDE.md guide"),
      fwd("/insights", "HTML report of recent session usage patterns"),
      fwd("/install-github-app", "Install the Claude GitHub App for a repository"),
      fwd("/install-slack-app", "Install the Claude Slack app"),
      fwd("/keybindings", "Open keyboard shortcuts file"),
      fwd("/list-agents", "List subagents / peers Claude can message"),
      fwd("/peers", "Alias for /list-agents"),
      fwd("/login", "Sign in to your Anthropic account"),
      fwd("/logout", "Sign out from your Anthropic account"),
      fwd("/loop", "Run a prompt repeatedly on an interval", "[interval] [prompt]"),
      fwd("/proactive", "Alias for /loop"),
      fwd("/mcp", "Manage MCP server connections", "[reconnect|enable|disable …]"),
      fwd("/memory", "Edit CLAUDE.md / auto-memory settings"),
      fwd("/mobile", "Show QR to download the Claude mobile app"),
      fwd("/passes", "Share a free week of Claude Code (if eligible)"),
      fwd("/permissions", "Manage allow / ask / deny tool rules"),
      fwd("/plan", "Enter plan mode", "[description]"),
      fwd("/plugin", "Manage Claude Code plugins", "[subcommand]"),
      fwd("/powerup", "Interactive lessons for Claude Code features"),
      fwd("/privacy-settings", "View and update privacy settings"),
      fwd("/radio", "Open Claude FM lo-fi radio"),
      fwd("/recap", "One-line summary of the current session"),
      fwd("/release-notes", "View the changelog"),
      fwd("/reload-plugins", "Reload active plugins", "[--force]"),
      fwd("/reload-skills", "Re-scan skills and command directories"),
      fwd("/remote-control", "Make session available for Remote Control"),
      fwd("/rc", "Alias for /remote-control"),
      fwd("/remote-env", "Choose default environment for cloud agents"),
      fwd("/rename", "Rename the current session", "[name]"),
      fwd("/resume", "Resume a conversation by ID or name", "[session]"),
      fwd("/continue", "Alias for /resume"),
      fwd("/rewind", "Rewind conversation and/or code to a checkpoint"),
      fwd("/checkpoint", "Alias for /rewind"),
      fwd("/undo", "Alias for /rewind"),
      fwd("/run", "Launch and drive the project app to verify a change"),
      fwd("/run-skill-generator", "Teach /run and /verify how to drive this app"),
      fwd("/sandbox", "Toggle sandbox mode"),
      fwd("/schedule", "Create or manage cloud routines", "[description]"),
      fwd("/routines", "Alias for /schedule"),
      fwd("/scroll-speed", "Adjust mouse wheel scroll speed (fullscreen)"),
      fwd("/security-review", "Security review of branch changes vs origin"),
      fwd("/setup-bedrock", "Configure Amazon Bedrock (when enabled)"),
      fwd("/setup-vertex", "Configure Google Vertex / Agent Platform"),
      fwd("/simplify", "Cleanup review of changed code", "[target]"),
      fwd("/skills", "List available skills"),
      fwd("/stats", "Alias for /usage (Stats tab)"),
      fwd("/status", "Settings → Status (version, model, account)"),
      fwd("/statusline", "Configure the status line"),
      fwd("/stickers", "Order Claude Code stickers"),
      fwd("/stop", "Stop the current background session"),
      fwd("/subtask", "Spawn a forked background subagent", "<task>"),
      fwd("/tasks", "View background work / finished subagents"),
      fwd("/bashes", "Alias for /tasks"),
      fwd("/team-onboarding", "Generate a team onboarding guide from usage"),
      fwd("/teleport", "Pull a Claude Code on the web session into this terminal"),
      fwd("/tp", "Alias for /teleport"),
      fwd("/terminal-setup", "Configure terminal keybindings"),
      fwd("/theme", "Change the color theme"),
      fwd("/tui", "Set terminal UI renderer", "[default|fullscreen]"),
      fwd("/ultrareview", "Deep multi-agent cloud code review", "[PR|branch]"),
      fwd("/upgrade", "Open upgrade page for a higher plan"),
      fwd("/usage", "Session cost, plan limits, and activity stats"),
      fwd("/usage-credits", "Configure usage credits / request from admin"),
      fwd("/verify", "Build/run the app to confirm a change works"),
      fwd("/voice", "Toggle voice dictation", "[hold|tap|off]"),
      fwd("/web-setup", "Connect GitHub for Claude Code on the web"),
      fwd("/workflows", "Watch or manage running workflows"),
    ],
    limitations: [
      "After the first Claude turn, live slash_commands from system/init overlay this list (skills/MCP prompts included).",
      "Availability of some commands depends on plan, platform, and Claude Code version.",
      BRIDGE_LIMIT,
    ],
  },

  cursor: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Cursor CLI model hint (forwarded)",
        argsHint: "[name | list]",
        intercept: "forward",
      },
      fwd("/new", "New chat (forwarded)"),
      fwd("/clear", "Clear context (forwarded)"),
    ],
    limitations: [
      "Cursor Ext Agent uses one-shot CLI turns; REPL slash verbs may not apply.",
      BRIDGE_LIMIT,
    ],
  },

  /**
   * Aider in-chat commands
   * (https://aider.chat/docs/usage/commands.html).
   * Envoy uses one-shot CLI per message — REPL file-chat state may not persist.
   */
  aider: {
    commands: [
      HELP,
      fwd("/add", "Add files to the chat so aider can edit them", "<path…>"),
      fwd("/architect", "Enter architect/editor mode (or send one architect prompt)", "[prompt]"),
      fwd("/ask", "Ask about the code without editing (or switch to ask mode)", "[prompt]"),
      fwd("/chat-mode", "Switch to a new chat mode", "<mode>"),
      fwd("/clear", "Clear the chat history"),
      fwd("/code", "Ask for code changes (or switch to code mode)", "[prompt]"),
      fwd("/commit", "Commit edits made outside the chat", "[message]"),
      fwd("/context", "Enter context mode / see surrounding code", "[prompt]"),
      fwd("/copy", "Copy the last assistant message to the clipboard"),
      fwd("/copy-context", "Copy the current chat context as markdown"),
      fwd("/diff", "Display the diff of changes since the last message"),
      fwd("/drop", "Remove files from the chat session", "[path…]"),
      fwd("/edit", "Alias for /editor"),
      fwd("/editor", "Open an editor to write a prompt"),
      fwd("/editor-model", "Switch the Editor Model to a new LLM", "<model>"),
      fwd("/exit", "Exit the application"),
      fwd("/quit", "Exit the application"),
      fwd("/git", "Run a git command (output excluded from chat)", "<args…>"),
      fwd("/lint", "Lint and fix in-chat files (or all dirty files)"),
      fwd("/load", "Load and execute commands from a file", "<path>"),
      fwd("/ls", "List known files and which are in the chat session"),
      fwd("/map", "Print the current repository map"),
      fwd("/map-refresh", "Force a refresh of the repository map"),
      {
        slash: "/model",
        summary: "Switch the Main Model to a new LLM",
        argsHint: "<name>",
        intercept: "forward",
      },
      fwd("/models", "Search the list of available models", "[query]"),
      fwd("/multiline-mode", "Toggle multiline mode (Enter vs Meta+Enter)"),
      fwd("/ok", "Alias for /code Ok, please go ahead…", "[extra]"),
      fwd("/paste", "Paste image/text from the clipboard", "[name]"),
      fwd("/read-only", "Add files as read-only reference", "[path…]"),
      fwd("/reasoning-effort", "Set reasoning effort", "<level>"),
      fwd("/report", "Report a problem by opening a GitHub Issue"),
      fwd("/reset", "Drop all files and clear the chat history"),
      fwd("/run", "Run a shell command; optionally add output to chat", "<cmd>"),
      fwd("/save", "Save commands that reconstruct this chat’s files", "<path>"),
      fwd("/settings", "Print out the current settings"),
      fwd("/test", "Run a shell command; add output on non-zero exit", "<cmd>"),
      fwd("/think-tokens", "Set thinking token budget", "<budget|0>"),
      fwd("/tokens", "Report tokens used by the current chat context"),
      fwd("/undo", "Undo the last git commit if it was done by aider"),
      fwd("/voice", "Record and transcribe voice input"),
      fwd("/weak-model", "Switch the Weak Model to a new LLM", "<model>"),
      fwd("/web", "Scrape a webpage to markdown and send it", "<url>"),
    ],
    limitations: [
      "Aider Ext Agent is one-shot per message; interactive /add and chat-mode state may not behave like the REPL.",
      BRIDGE_LIMIT,
    ],
  },

  /**
   * MiniMax MMX-CLI is a multimodal generation CLI (`mmx text|image|…`),
   * not a coding REPL with slash commands.
   */
  mmx: {
    commands: [
      HELP,
      {
        slash: "/model",
        summary: "Hint which MiniMax text model to use (forwarded into mmx text chat)",
        argsHint: "[name | list]",
        intercept: "forward",
      },
    ],
    limitations: [
      "MMX-CLI has no in-chat slash menu — use CLI verbs: mmx text, image, video, speech, music, vision, search, auth, quota.",
      "Envoy drives mmx via one-shot `mmx text chat`; forwarded /model is a best-effort hint only.",
      BRIDGE_LIMIT,
    ],
  },
};

function dynamicDescriptors(slashNames: string[]): ExtAgentCommandDescriptor[] {
  const out: ExtAgentCommandDescriptor[] = [];
  const seen = new Set<string>();
  for (const raw of slashNames) {
    const slash = normalizeSlash(raw);
    if (!slash || seen.has(slash)) continue;
    seen.add(slash);
    const name = slash.slice(1);
    out.push({
      slash,
      summary: `Claude Code /${name}`,
      intercept: slash === "/help" ? "envoy" : "forward",
      source: "dynamic",
    });
  }
  return out;
}

/** Merge static baseline with dynamic overlay (dynamic wins on same slash). */
export function mergeExtAgentCommandDescriptors(
  staticCommands: ExtAgentCommandDescriptor[],
  dynamicCommands: ExtAgentCommandDescriptor[],
): ExtAgentCommandDescriptor[] {
  const bySlash = new Map<string, ExtAgentCommandDescriptor>();
  for (const cmd of staticCommands) {
    const slash = normalizeSlash(cmd.slash);
    if (!slash) continue;
    bySlash.set(slash, { ...cmd, slash });
  }
  for (const cmd of dynamicCommands) {
    const slash = normalizeSlash(cmd.slash);
    if (!slash) continue;
    bySlash.set(slash, { ...cmd, slash });
  }
  return [...bySlash.values()].sort((a, b) => a.slash.localeCompare(b.slash));
}

export function buildExtAgentCommandCatalog(params: {
  agentId: string;
  agentName: string;
  dynamicSlashCommands?: string[];
  models?: Array<{ id: string; label?: string }>;
  sessionModel?: string;
  defaultModel?: string;
  /** Override auto-detect (e.g. OpenHuman RPC cannot honor session model). */
  supportsSessionModel?: boolean;
  now?: Date;
}): ExtAgentCommandCatalog {
  const agentId = params.agentId.trim() || "pi";
  const row = STATIC_BY_AGENT[agentId] ?? {
    commands: [HELP],
    limitations: [
      `No curated slash catalog for "${agentId}" yet — only /help is available.`,
      BRIDGE_LIMIT,
    ],
  };

  const staticCommands = row.commands.map((c) => toDescriptor(c, "static"));
  const dynamic =
    agentId === "claudecode" && params.dynamicSlashCommands?.length
      ? dynamicDescriptors(params.dynamicSlashCommands)
      : [];

  // Keep Envoy /help as envoy intercept even if dynamic overlays it.
  // Keep /model as envoy when this agent supports session overrides.
  // Drop duplicate /help from static when HELP already present (claudecode lists both).
  const sessionModelOk =
    params.supportsSessionModel ?? supportsExtAgentSessionModel(agentId);
  const merged = mergeMmxMediaSlashCommands(
    mergeExtAgentCommandDescriptors(staticCommands, dynamic).map((cmd) => {
      if (cmd.slash === "/help") return { ...cmd, intercept: "envoy" as const };
      if (cmd.slash === "/model" && sessionModelOk) {
        return { ...cmd, intercept: "envoy" as const };
      }
      if (cmd.slash === "/model" && !sessionModelOk) {
        return { ...cmd, intercept: "forward" as const };
      }
      return cmd;
    }),
  );

  return {
    agentId,
    agentName: params.agentName.trim() || agentId,
    commands: merged,
    ...(params.models?.length ? { models: params.models } : {}),
    supportsSessionModel: sessionModelOk,
    ...(params.sessionModel ? { sessionModel: params.sessionModel } : {}),
    ...(params.defaultModel ? { defaultModel: params.defaultModel } : {}),
    catalogVersion: EXT_AGENT_COMMAND_CATALOG_VERSION,
    fetchedAt: (params.now ?? new Date()).toISOString(),
    limitations: mergeMmxMediaLimitations(row.limitations),
  };
}

/** Format catalog for `/help` toast / local reply. */
export function formatExtAgentCommandHelp(catalog: ExtAgentCommandCatalog): string {
  const lines: string[] = [`${catalog.agentName} slash commands:`];
  if (catalog.commands.length === 0) {
    lines.push("(none)");
  } else {
    for (const cmd of catalog.commands) {
      const args = cmd.argsHint ? ` ${cmd.argsHint}` : "";
      lines.push(`${cmd.slash}${args} — ${cmd.summary}`);
    }
  }
  if (catalog.limitations?.length) {
    lines.push("");
    lines.push("Notes:");
    for (const note of catalog.limitations) {
      lines.push(`• ${note}`);
    }
  }
  return lines.join("\n");
}
