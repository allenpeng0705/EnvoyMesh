/**
 * Aggregate Agent Network `skills[]` from owner domains + installed engines.
 *
 * See docs/agent-network-vocabulary.md — skills drive assignment; membership
 * stays separate. Kind/source are stamped automatically (no owner config).
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentNetworkProfile, AgentNetworkSkillEntry } from "@envoymesh/protocol";
import {
  DEFAULT_AGENT_NETWORK_PROFILE,
  coerceAgentNetworkSkills,
  createExtAgentSkill,
  createOpenClawSkill,
} from "@envoymesh/protocol";
import { openClawWorkspaceSkillsDir } from "./openclaw-workspace.js";

const MAX_SKILLS = 16;

/** List OpenClaw skill directory names that contain SKILL.md. */
export function listOpenClawSkillIds(profileDir: string): string[] {
  const root = openClawWorkspaceSkillsDir(profileDir);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(join(root, entry.name, "SKILL.md"))) continue;
      const id = entry.name.trim().toLowerCase();
      if (id) out.push(id);
    }
  } catch {
    return [];
  }
  return out;
}

/**
 * Merge owner-attested skills with discovered Agent Skills (OpenClaw workspace,
 * optional Ext Agent labels). Owner tags keep priority; discovered ids fill
 * remaining slots up to MAX_SKILLS. Kind/source stamped by source.
 */
export function aggregateAgentNetworkSkills(input: {
  profile?: Partial<AgentNetworkProfile> | null;
  profileDir?: string;
  /** Active Ext Agent display names / ids (soft tags). */
  extAgentLabels?: readonly string[];
}): AgentNetworkProfile {
  const ownerSkills = coerceAgentNetworkSkills(input.profile?.skills ?? []);
  const merged: AgentNetworkSkillEntry[] = [];
  const seen = new Set<string>();
  const add = (entry: AgentNetworkSkillEntry) => {
    const id = entry.id.trim().toLowerCase();
    if (!id || seen.has(id)) return;
    if (merged.length >= MAX_SKILLS) return;
    seen.add(id);
    merged.push({ ...entry, id });
  };

  for (const s of ownerSkills) add(s);
  if (input.profileDir) {
    for (const s of listOpenClawSkillIds(input.profileDir)) add(createOpenClawSkill(s));
  }
  for (const label of input.extAgentLabels ?? []) add(createExtAgentSkill(label));

  return {
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input.profile,
    skills: merged,
  };
}

/** Soft skill tags from enabled Ext Agent definitions (id + distinct name). */
export function extAgentLabelsFromDefinitions(
  extAgents?: readonly { id: string; name: string; enabled: boolean }[] | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const agent of extAgents ?? []) {
    if (!agent.enabled) continue;
    for (const raw of [agent.id, agent.name]) {
      const id = raw.trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
