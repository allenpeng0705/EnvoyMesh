/**
 * Agent Network worker profile — owner-attested traits used to rank peers
 * when selecting workers (direct-assign mode). Advertised on the Agent Card
 * only when Join Agent Network is enabled.
 *
 * See docs/agent-network-vocabulary.md — membership filters; skills + optional
 * collaboration roles drive assignment (role-based Team jobs prefer roles).
 * Skills are structured `{ id, kind, source }`; legacy plain strings coerce to
 * owner domain entries. Matching stays on `id`.
 * Roles: `roles[]` with `roles[0]` = primary (multi-role later).
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

/** @deprecated Ext Agents are AI Engines — do not add as skills. Kept for legacy card coerce. */
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

/** Owner domain specialties only — hides OpenClaw / Ext engine tags in UI chips. */
export function agentNetworkDomainSkillIds(
  skills: readonly (string | AgentNetworkSkillEntry)[] | null | undefined,
): string[] {
  return coerceAgentNetworkSkills(skills)
    .filter((e) => e.kind === "domain" && e.source === "owner")
    .map((e) => e.id);
}

/**
 * Skills used for Team-job ranking / soft match.
 * Excludes Ext Agent labels (AI Engines are not specialty signals).
 */
export function agentNetworkRankingSkillIds(
  skills: readonly (string | AgentNetworkSkillEntry)[] | null | undefined,
): string[] {
  return coerceAgentNetworkSkills(skills)
    .filter((e) => e.source !== "ext")
    .map((e) => e.id);
}

/** Well-known collaboration seats (Team job role-based assignment). */
export const AGENT_NETWORK_WELL_KNOWN_ROLES = [
  "product_manager",
  "programmer",
  "tester",
  "researcher",
  "writer",
  "generalist",
] as const;

export type AgentNetworkWellKnownRole = (typeof AGENT_NETWORK_WELL_KNOWN_ROLES)[number];

/** Collaboration role id — well-known or `custom:<slug>`. */
export type AgentNetworkRoleId = AgentNetworkWellKnownRole | `custom:${string}`;

const CUSTOM_ROLE_RE = /^custom:[a-z0-9_-]{1,32}$/;
const WELL_KNOWN_ROLE_SET = new Set<string>(AGENT_NETWORK_WELL_KNOWN_ROLES);

/** True when `id` is a well-known role or valid `custom:` slug. */
export function isAgentNetworkRoleId(id: string): id is AgentNetworkRoleId {
  const normalized = id.trim().toLowerCase();
  if (WELL_KNOWN_ROLE_SET.has(normalized)) return true;
  return CUSTOM_ROLE_RE.test(normalized);
}

/** Coerce / normalize a role id; returns null if invalid. */
export function coerceAgentNetworkRoleId(raw: unknown): AgentNetworkRoleId | null {
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLowerCase();
  if (!id || id.length > 48) return null;
  if (!isAgentNetworkRoleId(id)) return null;
  return id;
}

/** Normalize a roles array; `roles[0]` is the primary. Max 8. */
export function coerceAgentNetworkRoles(raw: unknown): AgentNetworkRoleId[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentNetworkRoleId[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = coerceAgentNetworkRoleId(item);
    if (!id || seen.has(id)) continue;
    if (out.length >= 8) break;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Primary collaboration role (`roles[0]`), if any. */
export function agentNetworkPrimaryRole(
  roles: readonly string[] | null | undefined,
): AgentNetworkRoleId | undefined {
  if (!roles?.length) return undefined;
  return coerceAgentNetworkRoleId(roles[0]) ?? undefined;
}

/** Normalized role ids (deduped). */
export function agentNetworkRoleIds(
  roles: readonly string[] | null | undefined,
): AgentNetworkRoleId[] {
  return coerceAgentNetworkRoles(roles ?? []);
}

/** True when the peer lists `role` (primary or secondary). */
export function agentNetworkHasRole(
  roles: readonly string[] | null | undefined,
  role: string | null | undefined,
): boolean {
  const want = coerceAgentNetworkRoleId(role);
  if (!want) return false;
  return agentNetworkRoleIds(roles).includes(want);
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
   * Skills for assignment: owner domains + OpenClaw Agent Skills.
   * Ext Agent labels are not skills (AI Engines). Accepts legacy plain strings
   * and partial `{ id }` objects (coerced). Matching uses `id`.
   */
  skills: z
    .array(z.unknown())
    .max(16)
    .default([])
    .transform((items) => coerceAgentNetworkSkills(items)),
  /**
   * Collaboration roles for Team jobs (`roles[0]` = primary). Manual owner
   * attestation — not inferred from skills. Empty = skill-only peer.
   */
  roles: z
    .array(z.unknown())
    .max(8)
    .default([])
    .transform((items) => coerceAgentNetworkRoles(items)),
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
  roles: AgentNetworkRoleId[];
  throughputTokensPerSec?: number;
};

export const DEFAULT_AGENT_NETWORK_PROFILE: AgentNetworkProfile = {
  modelFreshness: 5,
  spendPosture: "unknown",
  contextWindow: "128k",
  skills: [],
  roles: [],
};

export function parseAgentNetworkProfile(input: unknown): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse(input);
}

export function createAgentNetworkProfile(
  input: Partial<AgentNetworkProfile> & {
    skills?: readonly (string | AgentNetworkSkillEntry)[];
    roles?: readonly string[];
  } = {},
): AgentNetworkProfile {
  return AgentNetworkProfileSchema.parse({
    ...DEFAULT_AGENT_NETWORK_PROFILE,
    ...input,
    skills: input.skills ?? DEFAULT_AGENT_NETWORK_PROFILE.skills,
    roles: input.roles ?? DEFAULT_AGENT_NETWORK_PROFILE.roles,
  });
}
