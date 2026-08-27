/**
 * Family Network (Phase 51) — local-only profiles on one home node.
 *
 * Profiles are NOT mesh identities. The P2P network still sees only the home
 * owner. Family DMs use `family:<sortedA>:<sortedB>` thread keys and never
 * leave the home node.
 */

import type { AiBotDefinition } from "./ai-bot.js"

/** Stable id for the auto-created owner profile (migration / backfill). */
export const OWNER_FAMILY_PROFILE_ID = "owner"

export interface FamilyProfile {
  /** Unique id within this node, e.g. "owner", "mom", "alex". */
  id: string
  /** Display name shown in chat lists + AI threads. */
  name: string
  /** Avatar color (hex). */
  avatarColor?: string
  /** Admin rights + full EnvoyMesh features. Exactly one per node. */
  isOwner: boolean
  /** ISO 8601. */
  createdAt: string
  /** ISO 8601 — presence hint. */
  lastSeenAt?: string
  /** Owner can deactivate without deleting (history preserved). */
  active: boolean
  /**
   * Whether this profile may use Ext Agent chat (bridge).
   * Omitted / undefined = **denied** for non-owner profiles (opt-in).
   * Owner profile is always allowed regardless of this flag.
   * Only the node owner may change this (Settings → Family).
   */
  extAgentEnabled?: boolean
  /**
   * Whether this profile may use Coding assistants (Pi + Envoy Harness chat).
   * Omitted / undefined = **denied** for non-owner profiles (opt-in).
   * Owner profile is always allowed regardless of this flag.
   * Only the node owner may change this (Settings → Family).
   */
  codingEnabled?: boolean
  /** Per-profile character bots. */
  aiBots?: AiBotDefinition[]
}

export interface CreateFamilyProfileParams {
  name: string
  avatarColor?: string
  /**
   * Only allowed when no owner profile exists yet (first boot / migration).
   * Family-invite pairing always creates `isOwner: false`.
   */
  isOwner?: boolean
}

export interface UpdateFamilyProfileParams {
  id: string
  name?: string
  avatarColor?: string
  active?: boolean
  /** Owner-only: allow / deny Ext Agent chat for this profile. */
  extAgentEnabled?: boolean
  /** Owner-only: allow / deny Coding assistants for this profile. */
  codingEnabled?: boolean
  aiBots?: AiBotDefinition[]
}

export interface CreateFamilyProfileResult {
  profile: FamilyProfile
}

export interface UpdateFamilyProfileResult {
  profile: FamilyProfile
}

export interface DeleteFamilyProfileResult {
  ok: true
  id: string
}

/**
 * Phase 51 — permanently remove a non-owner profile and erase profile-scoped
 * local data (AI/bot/bridge threads, family DMs involving this id, room
 * membership, session + push tokens).
 */
export interface WipeFamilyProfileResult {
  ok: true
  id: string
  /** Chat log rows removed across matching thread keys. */
  deletedMessages: number
  /** Session tokens revoked for this profile. */
  revokedSessions: number
}

export interface GenerateFamilyInviteTokenParams {
  /** Hours until expiry (default 72). */
  expiresInHours?: number
  /** Optional note for the owner's invite list. */
  note?: string
}

export interface GenerateFamilyInviteTokenResult {
  /** Bearer token embedded in the QR / URI. */
  token: string
  /** `envoy://pair?...&token=...` (or invite URI) for QR rendering. */
  uri: string
  /** ISO 8601 expiry. */
  expiresAt: string
}

/**
 * Phase 51 follow-up — unauthenticated preview of selectable family profiles
 * during EnvoyGo re-pair (gated by a valid family invite token).
 */
export interface PreviewFamilyInviteParams {
  pairingToken: string
  /** Optional EnvoyGo device UUID — used to allow same-device idempotent preview of a consumed invite. */
  deviceId?: string
}

export interface PreviewFamilyInviteProfile {
  id: string
  name: string
  avatarColor?: string
  active: boolean
}

export interface PreviewFamilyInviteResult {
  profiles: PreviewFamilyInviteProfile[]
}

export interface ListFamilyProfilesResult {
  profiles: FamilyProfile[]
}

/** Phase 51C — local family DM (never leaves the home node). */
export interface SendFamilyMessageParams {
  toProfileId: string
  text: string
}

export interface SendFamilyMessageResult {
  messageId: string
  threadKey: string
}

/** Phase 51D — local family group room (never leaves the home node). */
export interface FamilyRoom {
  roomId: string
  title: string
  creatorProfileId: string
  memberProfileIds: string[]
  revision: number
  updatedAt: string
  active: boolean
  kind: "family"
}

export interface CreateFamilyRoomParams {
  title: string
  /** Other members (creator is always included). */
  memberProfileIds: string[]
}

export interface CreateFamilyRoomResult {
  room: FamilyRoom
}

export interface ListFamilyRoomsResult {
  rooms: FamilyRoom[]
}

export interface SendFamilyRoomMessageParams {
  roomId: string
  text: string
}

export interface SendFamilyRoomMessageResult {
  messageId: string
  threadKey: string
}

/** Family DM thread key: `family:<sortedA>:<sortedB>`. */
export function familyThreadKey(profileIdA: string, profileIdB: string): string {
  const a = profileIdA.trim()
  const b = profileIdB.trim()
  if (!a || !b) {
    throw new Error("familyThreadKey requires two non-empty profile ids")
  }
  if (a === b) {
    throw new Error("familyThreadKey requires two different profile ids")
  }
  return a < b ? `family:${a}:${b}` : `family:${b}:${a}`
}

export function isFamilyThreadKey(threadKey: string): boolean {
  return parseFamilyThreadKey(threadKey) !== null
}

export function parseFamilyThreadKey(
  threadKey: string,
): { profileIdA: string; profileIdB: string } | null {
  if (!threadKey.startsWith("family:")) return null
  const rest = threadKey.slice("family:".length)
  const parts = rest.split(":")
  if (parts.length !== 2) return null
  const [a, b] = parts
  if (!a?.trim() || !b?.trim() || a === b) return null
  return { profileIdA: a, profileIdB: b }
}

/** Ext Agent chat thread scoped to a family profile. */
export function bridgeThreadKeyForProfile(agentId: string, profileId: string): string {
  return `bridge:${agentId.trim()}:${profileId.trim() || OWNER_FAMILY_PROFILE_ID}`
}

export function parseBridgeThreadKey(
  threadKey: string,
): { agentId: string; profileId: string } | null {
  if (!threadKey.startsWith("bridge:")) return null
  const rest = threadKey.slice("bridge:".length)
  const lastColon = rest.lastIndexOf(":")
  if (lastColon <= 0) return null
  const agentId = rest.slice(0, lastColon).trim()
  const profileId = rest.slice(lastColon + 1).trim()
  if (!agentId || !profileId) return null
  return { agentId, profileId }
}

/**
 * Whether a thread is visible to a family profile.
 * Mesh / vault / Pi coding threads are owner-only (handled by RPC guards);
 * this helper covers namespaced AI + family local threads.
 */
export function threadVisibleTo(threadKey: string, profileId: string): boolean {
  const id = profileId.trim()
  if (!id || !threadKey) return false

  const family = parseFamilyThreadKey(threadKey)
  if (family) {
    return family.profileIdA === id || family.profileIdB === id
  }

  if (threadKey.startsWith("__envoy_ai__:")) {
    return threadKey.slice("__envoy_ai__:".length) === id
  }

  if (threadKey.startsWith("bot:")) {
    // `bot:<id>` (legacy) → owner only; `bot:<id>:<profileId>` → that profile
    const rest = threadKey.slice("bot:".length)
    const colon = rest.indexOf(":")
    if (colon < 0) return id === OWNER_FAMILY_PROFILE_ID
    return rest.slice(colon + 1) === id
  }

  if (threadKey.startsWith("bridge:")) {
    const parsed = parseBridgeThreadKey(threadKey)
    return parsed?.profileId === id
  }

  if (threadKey.startsWith("pi:")) {
    const lastColon = threadKey.lastIndexOf(":")
    if (lastColon <= 0) return false
    return threadKey.slice(lastColon + 1) === id
  }

  // Legacy un-namespaced EnvoyAI key — only the owner profile sees it
  // until migration appends `:<profileId>`.
  if (threadKey === "__envoy_ai__") {
    return id === OWNER_FAMILY_PROFILE_ID
  }

  // Family rooms use membership checks elsewhere (`memberProfileIds`).
  if (threadKey.startsWith("room:")) {
    return false
  }

  // Mesh DMs / other keys: not visible to non-owner family profiles via this
  // helper; owner access is gated separately.
  return false
}

/** Slugify a display name into a profile id candidate. */
export function slugifyFamilyProfileId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return base || "member"
}

/**
 * Whether a family profile may use Ext Agent chat.
 * Owner is always allowed. Non-owners require explicit
 * `extAgentEnabled: true` (default / omitted = off).
 * Missing profile → denied (fail closed).
 */
export function familyProfileMayUseExtAgent(
  profile: Pick<FamilyProfile, "isOwner" | "id" | "extAgentEnabled"> | null | undefined,
): boolean {
  if (!profile) return false
  if (profile.isOwner || profile.id === OWNER_FAMILY_PROFILE_ID) return true
  return profile.extAgentEnabled === true
}

/**
 * Mask `BridgeStatus.enabled` for callers who may not use Ext Agent.
 * Other fields stay intact so UI still knows which agent is active.
 */
export function maskBridgeEnabledForExtAgentAccess<T extends { enabled: boolean }>(
  status: T,
  mayUse: boolean,
): T {
  if (!status.enabled || mayUse) return status
  return { ...status, enabled: false }
}

/**
 * Whether a family profile may use Coding assistants (Pi TUI + EH chat).
 * Owner is always allowed. Non-owners require explicit
 * `codingEnabled: true` (default / omitted = off).
 * Missing profile → denied (fail closed).
 */
export function familyProfileMayUseCoding(
  profile: Pick<FamilyProfile, "isOwner" | "id" | "codingEnabled"> | null | undefined,
): boolean {
  if (!profile) return false
  if (profile.isOwner || profile.id === OWNER_FAMILY_PROFILE_ID) return true
  return profile.codingEnabled === true
}
