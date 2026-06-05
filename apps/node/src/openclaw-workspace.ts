import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type OpenClawWorkspaceSeed = {
  ownerId: string;
  displayName?: string;
  interests?: string[];
  capabilities?: string[];
  agentIdentitySnippet?: string;
  bondCount?: number;
};

export function openClawWorkspaceDir(profileDir: string): string {
  return join(profileDir, "openclaw-workspace");
}

export function openClawGatewayStateDir(profileDir: string): string {
  return join(profileDir, "openclaw-gateway");
}

export function openClawWorkspaceSkillsDir(profileDir: string): string {
  return join(openClawWorkspaceDir(profileDir), "skills");
}

/** Copy legacy ./skills installs into the persistent OpenClaw workspace (skip existing). */
export function importLegacySkillsIntoWorkspace(params: {
  legacySkillsDir: string;
  workspaceDir: string;
}): string[] {
  const imported: string[] = [];
  const targetRoot = join(params.workspaceDir, "skills");
  mkdirSync(targetRoot, { recursive: true });
  if (!existsSync(params.legacySkillsDir)) {
    return imported;
  }
  for (const entry of readdirSync(params.legacySkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = join(params.legacySkillsDir, entry.name);
    if (!existsSync(join(src, "SKILL.md"))) continue;
    const dest = join(targetRoot, entry.name);
    if (existsSync(dest)) continue;
    cpSync(src, dest, { recursive: true });
    imported.push(entry.name);
  }
  return imported;
}

function writeIfAbsent(path: string, content: string): void {
  if (existsSync(path)) return;
  writeFileSync(path, content, { encoding: "utf-8", mode: 0o600 });
}

function buildIdentityMd(): string {
  return [
    "# IDENTITY.md - Who Am I?",
    "",
    "- **Name:** EnvoyAI",
    "- **Creature:** EnvoyMesh built-in assistant — an AI agent on a decentralized P2P mesh",
    "- **Vibe:** Warm, competent, direct. No filler. Mesh-native.",
    "- **Emoji:** 🕸️",
    "",
    "You are the owner's EnvoyAI assistant. You help them navigate EnvoyMesh: bonds, discovery,",
    "vault knowledge, tasks, and network intelligence. You are already configured — never run",
    "first-contact onboarding or ask who you are.",
    "",
  ].join("\n");
}

function buildUserMd(seed: OpenClawWorkspaceSeed): string {
  const name = seed.displayName?.trim() || seed.ownerId;
  const interests =
    seed.interests && seed.interests.length > 0
      ? seed.interests.join(", ")
      : "(not set yet)";
  const capabilities =
    seed.capabilities && seed.capabilities.length > 0
      ? seed.capabilities.join(", ")
      : "(not set yet)";
  return [
    "# USER.md - About Your Human",
    "",
    `- **Name:** ${name}`,
    `- **What to call them:** ${name}`,
    `- **Owner ID:** ${seed.ownerId}`,
    "",
    "## Context",
    "",
    `- Interests: ${interests}`,
    `- Published capabilities: ${capabilities}`,
    `- Bonds on mesh: ${seed.bondCount ?? 0}`,
    "",
    "They use EnvoyMesh Social / EnvoyAI for mesh operations and personal assistance.",
    "",
  ].join("\n");
}

function buildSoulMd(): string {
  return [
    "# SOUL.md - Who You Are",
    "",
    "## Core Truths",
    "",
    "You are EnvoyAI on EnvoyMesh. Answer helpfully using mesh tools when needed.",
    "Skip bootstrap rituals — this workspace is pre-configured.",
    "",
    "When asked what you can help with, describe concrete EnvoyMesh capabilities:",
    "finding peers and documents, making bonds, knowledge queries, task negotiation,",
    "mesh intelligence reports, chat history search, and web search for current events.",
    "",
    "For news, headlines, prices, weather, or anything time-sensitive:",
    "call web_search first, then answer from the results.",
    "Never refuse citing a knowledge cutoff when web_search is available.",
    "",
    "Use mesh tools for factual mesh state. Never invent peer names or bond status.",
    "",
    "## Boundaries",
    "",
    "- Respect bond autonomy and sensitivity limits from EnvoyMesh policy.",
    "- Ask before external or high-risk actions.",
    "",
  ].join("\n");
}

function buildToolsMd(): string {
  return [
    "# TOOLS.md - Local Notes",
    "",
    "## Web search",
    "",
    "- `web_search` — built-in tool for current news, facts, and post-cutoff information.",
    "- Use it whenever the user asks about recent events, today's headlines, or live data.",
    "- Provider is configured by EnvoyMesh (Tavily when a key is set, otherwise DuckDuckGo).",
    "",
    "## EnvoyMesh mesh tools",
    "",
    "- Use `envoymesh_list_mesh_tools` / `envoymesh_execute_mesh_tool` for P2P mesh operations.",
    "",
  ].join("\n");
}

function buildAgentsMd(): string {
  return [
    "# AGENTS.md - Your Workspace",
    "",
    "## First Run",
    "",
    "Bootstrap is complete. Do not follow BOOTSTRAP.md or ask first-contact onboarding questions.",
    "",
    "## EnvoyMesh",
    "",
    "You have EnvoyMesh tools (mesh.*). Use them for discovery, bonds, knowledge, and tasks.",
    "",
  ].join("\n");
}

/**
 * Ensure a persistent OpenClaw workspace under the node profile.
 * Skips BOOTSTRAP.md and marks setup complete so EnvoyAI does not run first-contact onboarding.
 */
export function ensureOpenClawWorkspace(
  profileDir: string,
  seed: OpenClawWorkspaceSeed,
  options?: { legacySkillsDir?: string },
): string {
  const dir = openClawWorkspaceDir(profileDir);
  mkdirSync(join(dir, ".openclaw"), { recursive: true });
  mkdirSync(join(dir, "memory"), { recursive: true });
  mkdirSync(join(dir, "skills"), { recursive: true });

  const bootstrapPath = join(dir, "BOOTSTRAP.md");
  if (existsSync(bootstrapPath)) {
    try {
      unlinkSync(bootstrapPath);
    } catch {
      /* ignore */
    }
  }

  writeIfAbsent(join(dir, "IDENTITY.md"), buildIdentityMd());
  writeFileSync(join(dir, "SOUL.md"), buildSoulMd(), { encoding: "utf-8", mode: 0o600 });
  writeFileSync(join(dir, "TOOLS.md"), buildToolsMd(), { encoding: "utf-8", mode: 0o600 });
  writeIfAbsent(join(dir, "AGENTS.md"), buildAgentsMd());
  writeFileSync(join(dir, "USER.md"), buildUserMd(seed), { encoding: "utf-8", mode: 0o600 });

  const statePath = join(dir, ".openclaw", "workspace-state.json");
  const now = new Date().toISOString();
  let state: { setupCompletedAt?: string; bootstrapSeededAt?: string } = {};
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, "utf-8"));
    } catch {
      state = {};
    }
  }
  if (!state.setupCompletedAt) {
    state.setupCompletedAt = now;
  }
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });

  if (seed.agentIdentitySnippet?.trim()) {
    writeIfAbsent(join(dir, "MEMORY.md"), [
      "# MEMORY.md",
      "",
      "## Agent identity (from EnvoyMesh)",
      "",
      seed.agentIdentitySnippet.trim(),
      "",
    ].join("\n"));
  }

  if (options?.legacySkillsDir?.trim()) {
    importLegacySkillsIntoWorkspace({
      legacySkillsDir: options.legacySkillsDir.trim(),
      workspaceDir: dir,
    });
  }

  return dir;
}

