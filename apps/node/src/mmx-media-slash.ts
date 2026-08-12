/**
 * Shared MiniMax media slash commands (EnvoyAI + all Ext Agents).
 * Envoy-intercepted; home node runs `mmx` CLI via runMmxMediaCommand.
 */
import type { ExtAgentCommandDescriptor } from "@envoymesh/api";

const MMX_MEDIA_NOTE =
  "MiniMax media slash commands require `mmx-cli` on the home node (`npm install -g mmx-cli` + `mmx auth login`).";

export function mmxMediaCatalogLimitations(): string[] {
  return [MMX_MEDIA_NOTE];
}

/** Envoy-owned MiniMax media / status slash commands. */
export function buildMmxMediaSlashCommands(): ExtAgentCommandDescriptor[] {
  const cmds: Array<{
    slash: string;
    summary: string;
    argsHint?: string;
  }> = [
    {
      slash: "/image",
      summary: "Generate an image with MiniMax (saved under mmx-output)",
      argsHint: "<prompt>",
    },
    {
      slash: "/video",
      summary: "Generate a video with MiniMax (saved under mmx-output)",
      argsHint: "<prompt>",
    },
    {
      slash: "/speech",
      summary: "Synthesize speech with MiniMax (saved under mmx-output)",
      argsHint: "<text>",
    },
    {
      slash: "/music",
      summary: "Generate music with MiniMax (saved under mmx-output)",
      argsHint: "<prompt>",
    },
    {
      slash: "/vision",
      summary: "Describe an image with MiniMax vision",
      argsHint: "<path-or-url> [question]",
    },
    {
      slash: "/search",
      summary: "Web search via MiniMax",
      argsHint: "<query>",
    },
    {
      slash: "/quota",
      summary: "Show MiniMax Token Plan quota",
    },
    {
      slash: "/mmx-auth",
      summary: "Show MiniMax CLI auth status",
    },
  ];
  return cmds.map((c) => ({
    slash: c.slash,
    summary: c.summary,
    ...(c.argsHint ? { argsHint: c.argsHint } : {}),
    intercept: "envoy" as const,
    source: "static" as const,
  }));
}

/** Merge media commands into an existing catalog (media wins on slash collision). */
export function mergeMmxMediaSlashCommands(
  commands: ExtAgentCommandDescriptor[],
): ExtAgentCommandDescriptor[] {
  const bySlash = new Map<string, ExtAgentCommandDescriptor>();
  for (const cmd of commands) {
    bySlash.set(cmd.slash, cmd);
  }
  for (const cmd of buildMmxMediaSlashCommands()) {
    bySlash.set(cmd.slash, cmd);
  }
  return [...bySlash.values()].sort((a, b) => a.slash.localeCompare(b.slash));
}

export function mergeMmxMediaLimitations(
  existing?: string[],
): string[] {
  const notes = [...(existing ?? [])];
  if (!notes.some((n) => n.includes("mmx-cli") || n.includes("MiniMax media"))) {
    notes.push(MMX_MEDIA_NOTE);
  }
  return notes;
}
