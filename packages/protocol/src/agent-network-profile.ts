/**
 * Agent Network worker profile — owner-attested traits used to rank peers
 * when selecting workers (direct-assign mode). Advertised on the Agent Card
 * only when Join Agent Network is enabled.
 *
 * See docs/agent-network-vocabulary.md — skills (not membership) drive assignment.
 * Skills are structured `{ id, kind, source }`; legacy plain strings coerce to
 * owner domain entries. Matching stays on `id`.
 */

import { z } from "zod";

export const AgentNetworkContextWindowSchema = z.enum(["128k", "256k", "512k", "1M+"]);
export type AgentNetworkContextWindow = z.infer<typeof AgentNetworkContextWindowSchema>;

export const AgentNetworkSpendPostureSchema = z.enum(["subscription", "metered", "unknown"]);
export type AgentNetworkSpendPosture = z.infer<typeof AgentNetworkSpendPostureSchema>;

export const AgentNetworkSkillKindSchema = z.enum(["domain", "skill"]);
export type AgentNetworkSkillKind = z.infer<typeof AgentNetworkSkillKindSchema>;

export const AgentNetworkSkillSourceSchema = z.enum(["owner", "openclaw", "ext"]);
export type AgentNetworkSkillSource = z.infer<typeof AgentNetworkSkillSourceSchema>;

export const AgentNetworkSkillEntrySchema = z.object({
  id: z.string().min(1).max(64),
  kind: AgentNetworkSkillKindSchema,
  source: AgentNetworkSkillSourceSchema,
});
export type AgentNetworkSkillEntry = z.infer<typeof AgentNetworkSkillEntrySchema>;

/** Coerce a legacy string or partial entry into a full skill entry. */
export function coerceAgentNetworkSkillEntry(raw: unknown): AgentNetworkSkillEntry | null {
  if (typeof raw === "string") {
    const id = raw.trim().toLowerCase();
    if (!id || id.length > 64) return null;
    return { id, kind: "domain", source: "owner" };
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const id = o.id.trim().toLowerCase();
  if (!id || id.length > 64) return null;
  const kind =
    o.kind === "domain" || o.kind === "skill" ? o.kind : ("domain" as const);
  const source =
    o.source === "owner" || o.source === "openclaw" || o.source === "ext"
      ? o.source
      : ("owner" as const);
  return { id, kind, source };
}

/** Normalize a skills array (strings and/or entries) to stamped entries. */
export function coerceAgentNetworkSkills(raw: unknown): AgentNetworkSkillEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentNetworkSkillEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = coerceAgentNetworkSkillEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    if (out.length >= 16) break;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

export function createOwnerDomainSkill(id: string): AgentNetworkSkillEntry {
  const normalized = id.trim().toLowerCase();
  return { id: normalized, kind: "domain", source: "owner" };
}

export function createOpenClawSkill(id: string): AgentNetworkSkillEntry {
  return { id: id.trim().toLowerCase(), kind: "skill", source: "openclaw" };
}

export function createExtAgentSkill(id: string): AgentNetworkSkillEntry {
  return { id: id.trim().toLowerCase(), kind: "skill", source: "ext" };
}

export function agentNetworkSkillId(
  skill: string | AgentNetworkSkillEntry | null | undefined,
): string {
  if (!skill) return "";
  if (typeof skill === "string") return skill.trim().toLowerCase();
  return skill.id.trim().toLowerCase();
}

export function agentNetworkSkillIds(
  skills: readonly (string | AgentNetworkSkillEntry)[] | null | undefined,
): string[] {
  if (!skills?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of skills) {
    const id = agentNetworkSkillId(s);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export const AgentNetworkProfileSchema = z.object({
  /** Owner-attested model freshness / modernity (1 = older, 10 = newest). */
  modelFreshness: z.number().int().min(1).max(10).default(5),
  /**
   * Spend posture: subscription (pooled / monthly-yearly) vs metered prepaid
   * usage. Prefer subscription for long chains that must not stop mid-task.
   */
  spendPosture: AgentNetworkSpendPostureSchema.default("unknown"),
  contextWindow: AgentNetworkContextWindowSchema.default("128k"),
  /**
   * Skills for assignment: owner domains + Agent Skills from OpenClaw / Ext.
   * Accepts legacy plain strings and partial `{ id }` objects (coerced).
   * Matching uses `id`.
   */
  skills: z
    .array(z.unknown())
    .max(16)
    .default([])
    .transform((items) => coerceAgentNetworkSkills(items)),
  /**
   * Owner-attested inference throughput (tokens/sec). Soft ranking hint —
   * not a measured probe until a later phase.
   */
  throughputTokensPerSec: z.number().nonnegative().max(1_000_000).optional(),
});

export type AgentNetworkProfile = {
  modelFreshness: number;
  spendPosture: AgentNetworkSpendPosture;
  contextWindow: AgentNetworkContextWindow;
  skills: AgentNetworkSkillEntry[];
  throughputTokensPerSec?: number;
};

export const DEFAULT_AGENT_NETWORK_PROFILE: AgentNetworkProfile = {
  modelFreshness: 5,
  spendPosture: "unknown",
  contextWindow: "128k",
  skills: [],
};

export function parseAgentNetworkProfile(input: unknown): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse(input);
}

export function createAgentNetworkProfile(
  input: Partial<AgentNetworkProfile> & {
    skills?: readonly (string | AgentNetworkSkillEntry)[];
  } = {},
): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse({
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input,
    skills: input.skills ?? DEFAULT_AGENT_NETWORK_PROFILE.skills,
  });
}
