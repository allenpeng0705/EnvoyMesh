/**
 * Phase 51 — Family Network RPC helpers (profiles + family invite).
 */

import type {
  CreateFamilyProfileParams,
  CreateFamilyProfileResult,
  UpdateFamilyProfileParams,
  UpdateFamilyProfileResult,
  DeleteFamilyProfileResult,
  GenerateFamilyInviteTokenParams,
  GenerateFamilyInviteTokenResult,
  ListFamilyProfilesResult,
  FamilyProfile,
  AiBotDefinition,
} from "@envoymesh/api"
import type { FamilyProfileRecord, FamilyProfileStore } from "@envoymesh/local-store"
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

export async function deleteFamilyProfileViaRuntime(
  store: FamilyProfileStore | null,
  id: string,
): Promise<DeleteFamilyProfileResult> {
  if (!store) throw new Error("Family profile store is not available")
  requireOwnerProfile("delete family profiles")
  const trimmed = id?.trim()
  if (!trimmed) throw new Error("id is required")
  const ok = await store.delete(trimmed)
  if (!ok) throw new Error(`Family profile not found: ${trimmed}`)
  return { ok: true, id: trimmed }
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
