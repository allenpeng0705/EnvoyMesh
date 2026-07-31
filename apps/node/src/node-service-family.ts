/**
 * Phase 51 — Family Network RPC helpers (profiles + family invite).
 */

import type {
  CreateFamilyProfileParams,
  CreateFamilyProfileResult,
  UpdateFamilyProfileParams,
  UpdateFamilyProfileResult,
  DeleteFamilyProfileResult,
  WipeFamilyProfileResult,
  GenerateFamilyInviteTokenParams,
  GenerateFamilyInviteTokenResult,
  ListFamilyProfilesResult,
  FamilyProfile,
  AiBotDefinition,
} from "@envoymesh/api"
import { threadVisibleTo } from "@envoymesh/api"
import type {
  FamilyProfileRecord,
  FamilyProfileStore,
  FamilyRoomStore,
  LocalChatLogStore,
  SessionTokenStore,
} from "@envoymesh/local-store"
import { getRpcCaller, requireOwnerProfile } from "./rpc-caller-context.js"

export function toFamilyProfile(record: FamilyProfileRecord): FamilyProfile {
  return {
    id: record.id,
    name: record.name,
    avatarColor: record.avatarColor,
    isOwner: record.isOwner,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
    active: record.active,
    aiBots: Array.isArray(record.aiBots)
      ? (record.aiBots as AiBotDefinition[])
      : undefined,
  }
}

export async function listFamilyProfilesViaRuntime(
  store: FamilyProfileStore | null,
): Promise<ListFamilyProfilesResult> {
  if (!store) return { profiles: [] }
  const profiles = await store.list()
  return { profiles: profiles.map(toFamilyProfile) }
}

export async function createFamilyProfileViaRuntime(
  store: FamilyProfileStore | null,
  params: CreateFamilyProfileParams,
): Promise<CreateFamilyProfileResult> {
  if (!store) throw new Error("Family profile store is not available")
  requireOwnerProfile("create family profiles")
  if (params.isOwner === true) {
    throw new Error("Cannot create a second owner profile")
  }
  const profile = await store.create({
    name: params.name,
    avatarColor: params.avatarColor,
    isOwner: false,
  })
  return { profile: toFamilyProfile(profile) }
}

export async function updateFamilyProfileViaRuntime(
  store: FamilyProfileStore | null,
  params: UpdateFamilyProfileParams,
): Promise<UpdateFamilyProfileResult> {
  if (!store) throw new Error("Family profile store is not available")
  const caller = getRpcCaller()
  const isOwner = !caller || caller.isOwnerProfile
  const targetId = typeof params.id === "string" ? params.id.trim() : ""
  if (!targetId) throw new Error("id is required")

  // Non-owners may only update their own name / avatar / bots (not active).
  if (!isOwner) {
    if (caller!.profileId !== targetId) {
      throw new Error("You can only update your own family profile")
    }
    if (params.active !== undefined) {
      throw new Error("Only the node owner can activate or deactivate profiles")
    }
  }

  const profile = await store.update({
    id: targetId,
    name: params.name,
    avatarColor: params.avatarColor,
    active: isOwner ? params.active : undefined,
    aiBots: params.aiBots,
  })
  return { profile: toFamilyProfile(profile) }
}

/**
 * @deprecated Prefer {@link wipeFamilyProfileViaRuntime}. Kept as a thin
 * alias so existing RPC clients that call `deleteFamilyProfile` still erase
 * profile-scoped data instead of orphaning chat threads.
 */
export async function deleteFamilyProfileViaRuntime(
  deps: WipeFamilyProfileDeps,
  id: string,
): Promise<DeleteFamilyProfileResult> {
  const wiped = await wipeFamilyProfileViaRuntime(deps, id)
  return { ok: true, id: wiped.id }
}

export interface WipeFamilyProfileDeps {
  profileStore: FamilyProfileStore | null
  chatLogStore: LocalChatLogStore | null
  sessionTokenStore: SessionTokenStore | null
  familyRoomStore: FamilyRoomStore | null
  /** Unregister push tokens for this profile id. */
  unregisterPushTokens?: (profileId: string) => number
  /** Force-close live thin-client sockets for this profile. */
  disconnectClients?: (profileId: string) => number
  /** Clear chat RAG indexes for wiped thread keys. */
  clearRagThreads?: (threadKeys: string[]) => Promise<void>
}

/**
 * Wipe profile-scoped local data, then delete the profile row.
 * Family DM threads involving this id are erased for both sides.
 * Shared family rooms keep remaining members (creator is reassigned).
 */
export async function wipeFamilyProfileViaRuntime(
  deps: WipeFamilyProfileDeps,
  id: string,
): Promise<WipeFamilyProfileResult> {
  requireOwnerProfile("wipe family profiles")
  const trimmed = id?.trim()
  if (!trimmed) throw new Error("id is required")
  if (!deps.profileStore) throw new Error("Family profile store is not available")

  const existing = await deps.profileStore.get(trimmed)
  if (!existing) throw new Error(`Family profile not found: ${trimmed}`)
  if (existing.isOwner) throw new Error("Cannot wipe the owner profile")

  const clearedThreadKeys = new Set<string>()
  let deletedMessages = 0

  if (deps.chatLogStore) {
    const cleared = await deps.chatLogStore.clearThreadsMatching((threadKey) =>
      threadVisibleTo(threadKey, trimmed),
    )
    deletedMessages += cleared.deletedCount
    for (const key of cleared.clearedThreadKeys) clearedThreadKeys.add(key)
  }

  if (deps.familyRoomStore) {
    const rooms = await deps.familyRoomStore.list()
    for (const room of rooms) {
      if (!room.memberProfileIds.includes(trimmed)) continue
      const roomThread = `room:${room.roomId}`
      const nextMembers = room.memberProfileIds.filter((m) => m !== trimmed)

      if (nextMembers.length === 0) {
        // Solo room owned by the wiped profile — drop room + history.
        if (deps.chatLogStore) {
          deletedMessages += await deps.chatLogStore.clearThread(roomThread)
          clearedThreadKeys.add(roomThread)
        }
        await deps.familyRoomStore.remove(room.roomId)
        continue
      }

      const nextCreator =
        room.creatorProfileId === trimmed ? nextMembers[0]! : room.creatorProfileId
      await deps.familyRoomStore.update({
        roomId: room.roomId,
        memberProfileIds: nextMembers,
        creatorProfileId: nextCreator,
      })
    }
  }

  let revokedSessions = 0
  if (deps.sessionTokenStore) {
    revokedSessions = await deps.sessionTokenStore.removeTokensForProfile(trimmed)
  }

  deps.unregisterPushTokens?.(trimmed)
  deps.disconnectClients?.(trimmed)

  if (deps.clearRagThreads && clearedThreadKeys.size > 0) {
    await deps.clearRagThreads([...clearedThreadKeys])
  }

  const ok = await deps.profileStore.delete(trimmed)
  if (!ok) throw new Error(`Family profile not found: ${trimmed}`)

  return {
    ok: true,
    id: trimmed,
    deletedMessages,
    revokedSessions,
  }
}

export interface GenerateFamilyInviteDeps {
  createInvite: (params: {
    expiresInHours?: number
    note?: string
    kind: "family"
  }) => Promise<{ invite: { token: string; expiresAt: string }; uri: string }>
}

export async function generateFamilyInviteTokenViaRuntime(
  deps: GenerateFamilyInviteDeps,
  params?: GenerateFamilyInviteTokenParams,
): Promise<GenerateFamilyInviteTokenResult> {
  requireOwnerProfile("generate family invite tokens")
  const result = await deps.createInvite({
    expiresInHours: params?.expiresInHours ?? 72,
    note: params?.note?.trim() || "Family invite",
    kind: "family",
  })
  return {
    token: result.invite.token,
    uri: result.uri,
    expiresAt: result.invite.expiresAt,
  }
}
