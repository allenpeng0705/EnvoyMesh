/**
 * envoy-harness panel slash catalog — autocomplete + local intercepts.
 *
 * The panel uses non-blocking `startEnvoyHarnessTurn`; commands marked `intercept: "envoy"`
 * run in the panel. Everything else is forwarded as chat text (like Ext Agent).
 */
import type {
  ExtAgentCommandCatalog,
  ExtAgentCommandDescriptor,
  ExtAgentCommandIntercept,
} from "@envoymesh/api"
import {
  filterExtAgentSlashCommands,
  formatExtAgentSlashHelp,
  isExtAgentSlashSuggestInput,
} from "./ext-agent-slash-commands.js"

export const ENVOY_HARNESS_COMMAND_CATALOG_VERSION = "1"

type StaticCmd = {
  slash: string
  summary: string
  argsHint?: string
  intercept?: ExtAgentCommandIntercept
}

function normalizeSlash(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

function toDescriptor(cmd: StaticCmd): ExtAgentCommandDescriptor {
  return {
    slash: normalizeSlash(cmd.slash),
    summary: cmd.summary,
    ...(cmd.argsHint ? { argsHint: cmd.argsHint } : {}),
    intercept: cmd.intercept ?? "forward",
    source: "static",
  }
}

/** Forwarded slash — sent to envoy-harness as plain prompt text. */
function fwd(slash: string, summary: string, argsHint?: string): StaticCmd {
  return {
    slash,
    summary,
    ...(argsHint ? { argsHint } : {}),
    intercept: "forward",
  }
}

const BRIDGE_LIMIT =
  "Panel chat forwards most slash verbs as text; the harness may treat them like natural-language tasks."

const STATIC_COMMANDS: StaticCmd[] = [
  {
    slash: "/help",
    summary: "List envoy-harness slash commands",
    intercept: "envoy",
  },
  {
    slash: "/clear",
    summary: "Clear this conversation",
    intercept: "envoy",
  },
  {
    slash: "/cancel",
    summary: "Cancel the in-flight turn",
    intercept: "envoy",
  },
  fwd("/new", "Start a fresh conversation (alias for /clear)"),
  fwd("/reset", "Alias for /clear"),
  {
    slash: "/status",
    summary: "Refresh runtime status, model, and peer cluster",
    intercept: "envoy",
  },
  {
    slash: "/peers",
    summary: "List configured peer cluster members",
    intercept: "envoy",
  },
  {
    slash: "/cluster",
    summary: "Peer cluster health + routing preview",
    intercept: "envoy",
  },
  {
    slash: "/team",
    summary: "Running / finished team jobs",
    intercept: "envoy",
  },
  {
    slash: "/trace",
    summary: "Recent peer discovery events",
    intercept: "envoy",
  },
  {
    slash: "/search",
    summary: "Search this conversation",
    argsHint: "<term>",
    intercept: "envoy",
  },
  {
    slash: "/permissions",
    summary: "Permission policy: show or set (always-confirm | safe-only | off | never)",
    argsHint: "[mode]",
    intercept: "envoy",
  },
  fwd("/list-agents", "Alias for /peers"),
  {
    slash: "/model",
    summary: "Show the active model (change in Settings → AI)",
    argsHint: "[show]",
    intercept: "envoy",
  },
  {
    slash: "/cd",
    summary: "Show or set the project working folder",
    argsHint: "[path]",
    intercept: "envoy",
  },
  fwd("/project", "Alias for /cd — set project folder", "[path]"),
  fwd("/add-dir", "Grant read access to another directory", "<path>"),
  fwd("/review", "Review the current diff or working tree"),
  fwd("/code-review", "Alias for /review", "[level] [--fix]"),
  fwd("/security-review", "Security review of branch changes"),
  fwd("/compact", "Summarize the conversation to free context", "[instructions]"),
  fwd("/context", "Summarize current context usage"),
  fwd("/diff", "Show git diff including untracked files"),
  fwd("/init", "Generate an AGENTS.md scaffold in the project"),
  fwd("/plan", "Enter plan mode", "[description]"),
  fwd("/explain", "Explain the selected code or recent changes", "[target]"),
  fwd("/refactor", "Refactor code with a stated goal", "[instructions]"),
  fwd("/fix", "Fix a bug or failing test", "[description]"),
  fwd("/test", "Write or run tests for recent changes", "[target]"),
  fwd("/docs", "Document APIs or modules", "[target]"),
  fwd("/commit", "Draft a commit message for staged changes"),
  fwd("/run", "Run the app or a command to verify changes", "[command]"),
  fwd("/skills", "List or use available skills"),
  fwd("/mcp", "List configured MCP tools", "[verbose]"),
  fwd("/export", "Export the conversation as plain text", "[filename]"),
  fwd("/rename", "Rename this session", "[name]"),
  fwd("/fork", "Branch into a new conversation", "[prompt]"),
  fwd("/resume", "Resume a saved session", "[id]"),
  fwd("/copy", "Copy the latest assistant response"),
  fwd("/stop", "Stop background work"),
  fwd("/hooks", "View lifecycle hook configuration"),
  fwd("/memory", "Edit project memory files"),
  fwd("/usage", "Show token usage or session cost"),
  fwd("/cost", "Alias for /usage"),
  fwd("/doctor", "Diagnose setup issues"),
  fwd("/debug", "Enable verbose debug output", "[description]"),
  fwd("/fast", "Toggle fast mode when supported", "[on|off]"),
  fwd("/effort", "Set reasoning effort", "[level]"),
  fwd("/goal", "Set or clear a multi-turn goal", "[condition|clear]"),
  fwd("/side", "Ask a side question without polluting main context", "[question]"),
  fwd("/btw", "Alias for /side"),
  fwd("/redo", "Retry the last request"),
  fwd("/rewind", "Roll the conversation back to an earlier message", "[count]"),
  fwd("/config", "Show the harness configuration (model, provider, project)"),
]

export const ENVOY_HARNESS_SLASH_COMMANDS: ExtAgentCommandDescriptor[] =
  STATIC_COMMANDS.map(toDescriptor)

export const ENVOY_HARNESS_SLASH_LIMITATIONS = [BRIDGE_LIMIT]

export function buildEnvoyHarnessCommandCatalog(params?: {
  model?: string
  cwd?: string
}): ExtAgentCommandCatalog {
  return {
    agentId: "envoy-harness",
    agentName: "envoy-harness",
    commands: ENVOY_HARNESS_SLASH_COMMANDS,
    defaultModel: params?.model,
    catalogVersion: ENVOY_HARNESS_COMMAND_CATALOG_VERSION,
    fetchedAt: new Date().toISOString(),
    limitations: ENVOY_HARNESS_SLASH_LIMITATIONS,
  }
}

export function formatEnvoyHarnessSlashHelp(params?: {
  model?: string
  cwd?: string
}): string {
  const catalog = buildEnvoyHarnessCommandCatalog(params)
  const base = formatExtAgentSlashHelp(catalog)
  const extras: string[] = []
  if (params?.cwd) {
    extras.push(`Project folder: ${params.cwd}`)
  }
  if (extras.length === 0) return base
  return `${base}\n\n${extras.join("\n")}`
}

export {
  filterExtAgentSlashCommands as filterEnvoyHarnessSlashCommands,
  isExtAgentSlashSuggestInput as isEnvoyHarnessSlashSuggestInput,
}

/** The command name for a submitted line, or undefined when not a slash. */
export function envoyHarnessSlashName(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return undefined
  const [cmd] = trimmed.slice(1).split(/\s+/)
  return cmd?.toLowerCase()
}

export type EnvoyHarnessCdSlashAction =
  | { type: "show" }
  | { type: "set"; path: string }

/** Parse `/cd` or `/project` [path] — null when not a cd command. */
export function parseEnvoyHarnessCdCommand(text: string): EnvoyHarnessCdSlashAction | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return null
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean)
  const cmd = parts[0]?.toLowerCase() ?? ""
  if (cmd !== "cd" && cmd !== "project") return null
  const rest = parts.slice(1).join(" ").trim()
  if (!rest) return { type: "show" }
  return { type: "set", path: rest }
}

export type EnvoyHarnessModelSlashAction = { type: "show" }

/** Parse `/model` — panel only supports show (model changes live in Settings). */
export function parseEnvoyHarnessModelCommand(text: string): EnvoyHarnessModelSlashAction | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("/")) return null
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean)
  const cmd = parts[0]?.toLowerCase() ?? ""
  if (cmd !== "model") return null
  const rest = parts.slice(1).join(" ").trim()
  if (rest && rest.toLowerCase() !== "show") return null
  return { type: "show" }
}

/** True for panel-handled slash commands (not forwarded to the runtime). */
export function isEnvoyHarnessLocalSlashCommand(text: string): boolean {
  const name = envoyHarnessSlashName(text)
  if (!name) return false
  if (name === "help") return true
  if (name === "clear" || name === "new" || name === "reset") return true
  if (name === "cancel") return true
  if (name === "status") return true
  if (name === "peers" || name === "list-agents") return true
  if (name === "cluster" || name === "team" || name === "trace") return true
  if (name === "search") return true
  if (name === "permissions") return true
  if (parseEnvoyHarnessModelCommand(text)) return true
  if (parseEnvoyHarnessCdCommand(text)) return true
  return false
}
