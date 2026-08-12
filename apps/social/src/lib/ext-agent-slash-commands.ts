import type {
  ExtAgentCommandCatalog,
  ExtAgentCommandDescriptor,
  MmxMediaKind,
  RunMmxMediaCommandParams,
  RunMmxMediaCommandResult,
} from "@envoymesh/api";

/** True when the composer value is an in-progress slash token (no args yet). */
export function isExtAgentSlashSuggestInput(value: string): boolean {
  return /^\/\S*$/.test(value);
}

/** Prefix used to filter catalog rows (`"/mod"` → `/mod…`). */
export function extAgentSlashPrefix(value: string): string {
  if (!isExtAgentSlashSuggestInput(value)) return "";
  return value.toLowerCase();
}

export function filterExtAgentSlashCommands(
  commands: ExtAgentCommandDescriptor[],
  value: string,
): ExtAgentCommandDescriptor[] {
  const prefix = extAgentSlashPrefix(value);
  if (!prefix) return [];
  return commands.filter((cmd) => cmd.slash.toLowerCase().startsWith(prefix));
}

/** `/help` (optionally with trailing args) — Envoy-handled locally. */
export function isExtAgentHelpCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return false;
  const [cmd] = trimmed.slice(1).split(/\s+/);
  return (cmd ?? "").toLowerCase() === "help";
}

export type ExtAgentModelSlashAction =
  | { type: "show" }
  | { type: "list" }
  | { type: "default" }
  | { type: "set"; model: string };

/** Parse `/model` [show|list|default|<id>] — null if not a /model command. */
export function parseExtAgentModelCommand(text: string): ExtAgentModelSlashAction | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const cmd = parts[0]?.toLowerCase() ?? "";
  if (cmd !== "model") return null;
  const rest = parts.slice(1).join(" ").trim();
  if (!rest || rest.toLowerCase() === "show") return { type: "show" };
  if (rest.toLowerCase() === "list") return { type: "list" };
  if (rest.toLowerCase() === "default") return { type: "default" };
  return { type: "set", model: rest };
}

const MMX_MEDIA_KINDS = new Set<string>([
  "image",
  "video",
  "speech",
  "music",
  "vision",
  "search",
  "quota",
  "auth",
]);

export type ParsedMmxMediaCommand =
  | { ok: true; params: RunMmxMediaCommandParams }
  | { ok: false; error: string }
  | null;

/**
 * Parse MiniMax media slash commands.
 * `/mmx-auth` maps to kind `auth`.
 * Returns null when the text is not an MMX media command.
 */
export function parseMmxMediaCommand(text: string): ParsedMmxMediaCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  let cmd = (parts[0] ?? "").toLowerCase();
  if (cmd === "mmx-auth") cmd = "auth";
  if (!MMX_MEDIA_KINDS.has(cmd)) return null;
  const kind = cmd as MmxMediaKind;
  const rest = parts.slice(1);

  if (kind === "quota" || kind === "auth") {
    return { ok: true, params: { kind } };
  }
  if (kind === "vision") {
    const target = rest[0]?.trim();
    if (!target) {
      return { ok: false, error: "Usage: /vision <path-or-url> [question]" };
    }
    const question = rest.slice(1).join(" ").trim();
    return {
      ok: true,
      params: {
        kind,
        target,
        ...(question ? { prompt: question } : {}),
      },
    };
  }
  const prompt = rest.join(" ").trim();
  if (!prompt) {
    const usage =
      kind === "speech"
        ? "Usage: /speech <text>"
        : kind === "search"
          ? "Usage: /search <query>"
          : `Usage: /${kind} <prompt>`;
    return { ok: false, error: usage };
  }
  return { ok: true, params: { kind, prompt } };
}

export function formatMmxMediaResult(result: RunMmxMediaCommandResult): string {
  if (!result.ok) {
    return `MiniMax /${result.kind} failed: ${result.error ?? "unknown error"}`;
  }
  const lines: string[] = [`MiniMax /${result.kind}`];
  if (result.path) lines.push(`Saved: ${result.path}`);
  if (result.text?.trim()) lines.push(result.text.trim());
  return lines.join("\n");
}

/** `/model` with optional arg prefix — for model-id autocomplete. */
export function extAgentModelSuggestPrefix(value: string): string | null {
  const match = value.match(/^\/model(?:\s+(.*))?$/i);
  if (!match) return null;
  // Still typing `/model` without trailing space → slash command menu, not models.
  if (!/\s/.test(value)) return null;
  return (match[1] ?? "").toLowerCase();
}

export function filterExtAgentModels(
  models: Array<{ id: string; label?: string }>,
  value: string,
): Array<{ id: string; label?: string }> {
  const prefix = extAgentModelSuggestPrefix(value);
  if (prefix === null) return [];
  if (!prefix) return models;
  return models.filter(
    (m) =>
      m.id.toLowerCase().startsWith(prefix) ||
      (m.label?.toLowerCase().startsWith(prefix) ?? false),
  );
}

export function formatExtAgentSlashHelp(catalog: ExtAgentCommandCatalog): string {
  const lines: string[] = [`${catalog.agentName} slash commands:`];
  if (catalog.commands.length === 0) {
    lines.push("(none)");
  } else {
    for (const cmd of catalog.commands) {
      const args = cmd.argsHint ? ` ${cmd.argsHint}` : "";
      lines.push(`${cmd.slash}${args} — ${cmd.summary}`);
    }
  }
  if (catalog.supportsSessionModel) {
    const current = catalog.sessionModel ?? catalog.defaultModel ?? "(default)";
    lines.push("");
    lines.push(`Current model: ${current}`);
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

export function formatExtAgentModelShow(catalog: ExtAgentCommandCatalog): string {
  const current = catalog.sessionModel
    ? `${catalog.sessionModel} (session override)`
    : `${catalog.defaultModel ?? "(default)"} (default)`;
  return `${catalog.agentName} model: ${current}`;
}

export function formatExtAgentModelList(catalog: ExtAgentCommandCatalog): string {
  const models = catalog.models ?? [];
  if (models.length === 0) {
    return `${catalog.agentName}: no model list available. Try /model <id> if you know the id.`;
  }
  const lines = [`${catalog.agentName} models:`];
  for (const m of models) {
    lines.push(m.label ? `• ${m.id} — ${m.label}` : `• ${m.id}`);
  }
  return lines.join("\n");
}
