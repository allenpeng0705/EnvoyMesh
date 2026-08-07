/**
 * Aggregate Agent Network `skills[]` from owner domains + OpenClaw Agent Skills.
 *
 * See docs/agent-network-vocabulary.md — skills drive assignment; membership
 * stays separate. Ext Agents are AI Engines, not skill tags — never merged here.
 * Kind/source are stamped automatically (no owner config).
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AgentNetworkProfile, AgentNetworkSkillEntry } from "@envoymesh/protocol";
import {
  DEFAULT_AGENT_NETWORK_PROFILE,
  coerceAgentNetworkSkills,
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
 * Merge owner-attested skills with discovered OpenClaw Agent Skills.
 * Owner tags keep priority; OpenClaw ids fill remaining slots up to MAX_SKILLS.
 * Ext Agent labels are never included (AI Engine ≠ skill).
 */
export function aggregateAgentNetworkSkills(input: {
  profile?: Partial<AgentNetworkProfile> | null;
  profileDir?: string;
}): AgentNetworkProfile {
  const rawProfile = input.profile as
    | (Partial<AgentNetworkProfile> & { strengths?: unknown })
    | null
    | undefined;
  // Legacy disks used `strengths[]` before the skills rename.
  const ownerSkills = coerceAgentNetworkSkills(
    rawProfile?.skills ?? rawProfile?.strengths ?? [],
  ).filter((s) => s.source !== "ext");
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

  return {
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input.profile,
    skills: merged,
  };
}
