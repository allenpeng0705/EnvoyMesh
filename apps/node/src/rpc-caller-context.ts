/**
 * Phase 51 — RPC caller context (WebSocket / thin-client session).
 *
 * Desktop Social connects without a session token and is treated as the
 * owner profile. EnvoyGo sessions carry `profileId` from SessionTokenRecord.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api"

export interface RpcCallerContext {
  /** Home owner mesh id (envoy:owner:…). */
  ownerId: string
  /** Bound family profile id. */
  profileId: string
  /** True when profileId is the owner family profile. */
  isOwnerProfile: boolean
  /**
   * `session` — authenticated thin-client token.
   * `local` — unrestricted loopback client (Social / Capacitor) → owner.
   */
  source: "session" | "local"
  deviceId?: string
}

const storage = new AsyncLocalStorage<RpcCallerContext>()

/** Run an RPC (or batch of work) under a caller context. */
export function runWithRpcCaller<T>(caller: RpcCallerContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(caller, fn)
}

export function getRpcCaller(): RpcCallerContext | undefined {
  return storage.getStore()
}

/** Local unrestricted clients (Social UI) act as the owner profile. */
export function localOwnerCaller(ownerId: string, profileId = OWNER_FAMILY_PROFILE_ID): RpcCallerContext {
  return {
    ownerId,
    profileId,
    isOwnerProfile: true,
    source: "local",
  }
}

/**
 * Pre-auth pairing caller for store-review tokens on the client-proxy: NOT the
 * owner. Only `pairThinClient` / `previewFamilyInvite` may run under it; every
 * other RPC is rejected by the caller's isOwnerProfile=false gate.
 */
export function anonymousPairingCaller(): RpcCallerContext {
  return {
    ownerId: "",
    profileId: "",
    isOwnerProfile: false,
    source: "session",
  }
}

/**
 * Build RPC caller context from a thin-client session token record.
 * Legacy tokens without `profileId` bind to the owner profile.
 *
 * When `profileId` was corrupted to `"owner"` but the token still has an
 * immutable family-invite `boundFamilyProfileId`, prefer the binding so
 * Mom/Dad RPCs (sendFamilyMessage, config) are not run as Owner.
 */
export function sessionCallerFromToken(record: {
  ownerId: string
  profileId?: string
  boundFamilyProfileId?: string
  deviceId?: string
  /** Optional override when the family store has resolved isOwner. */
  isOwnerProfile?: boolean
}): RpcCallerContext {
  const binding =
    typeof record.boundFamilyProfileId === "string" &&
    record.boundFamilyProfileId.trim()
      ? record.boundFamilyProfileId.trim()
      : undefined
  let profileId =
    typeof record.profileId === "string" && record.profileId.trim()
      ? record.profileId.trim()
      : OWNER_FAMILY_PROFILE_ID
  if (
    binding &&
    binding !== OWNER_FAMILY_PROFILE_ID &&
    profileId === OWNER_FAMILY_PROFILE_ID
  ) {
    profileId = binding
  }
  return {
    ownerId: record.ownerId,
    profileId,
    isOwnerProfile:
      typeof record.isOwnerProfile === "boolean"
        ? record.isOwnerProfile
        : profileId === OWNER_FAMILY_PROFILE_ID,
    source: "session",
    deviceId: record.deviceId,
  }
}

export function requireOwnerProfile(action = "this action"): RpcCallerContext {
  const caller = getRpcCaller()
  // No ALS context (libp2p proxy / internal) → treat as owner for back-compat.
  if (!caller) {
    return {
      ownerId: "",
      profileId: OWNER_FAMILY_PROFILE_ID,
      isOwnerProfile: true,
      source: "local",
    }
  }
  if (!caller.isOwnerProfile) {
    throw new Error(`Only the node owner can ${action}`)
  }
  return caller
}

/** Redact secrets from NodeConfig for non-owner sessions. */
export function redactNodeConfigForCaller<T extends Record<string, unknown>>(
  config: T,
  caller?: RpcCallerContext,
): T {
  if (!caller || caller.isOwnerProfile) return config
  const next = { ...config } as T & {
    modelProviders?: { apiKey?: string; [k: string]: unknown }
    skillApiKeys?: Record<string, string>
    lanAutoBondFleetToken?: string
  }
  if (next.modelProviders && typeof next.modelProviders === "object") {
    next.modelProviders = { ...next.modelProviders, apiKey: undefined }
  }
  if (next.skillApiKeys) {
    next.skillApiKeys = undefined
  }
  if (typeof next.lanAutoBondFleetToken === "string") {
    next.lanAutoBondFleetToken = undefined
  }
  return next
}

/**
 * Stamp caller identity onto a broadcast `home:config-updated` payload.
 *
 * `getNodeConfig()` embeds the *emitter's* `callerFamilyProfileId`. When the
 * owner updates settings, that field is `"owner"` — broadcasting it unchanged
 * made every EnvoyGo family member overwrite their local Mom/Dad identity.
 */
export function stampConfigCallerForSession<T extends Record<string, unknown>>(
  config: T,
  session?: RpcCallerContext,
): T {
  if (!session) return config
  const stamped = {
    ...config,
    callerFamilyProfileId: session.profileId,
    callerIsOwnerProfile: session.isOwnerProfile,
  } as T & { aiBots?: unknown; familyProfiles?: unknown }
  // Owner-emitted config carries the owner's aiBots list — never push that
  // onto family member sessions (they load their own bots via getNodeConfig).
  if (!session.isOwnerProfile) {
    stamped.aiBots = []
    const profiles = stamped.familyProfiles
    if (Array.isArray(profiles)) {
      stamped.familyProfiles = profiles.map((p) => {
        if (!p || typeof p !== "object") return p
        const row = p as { id?: string; aiBots?: unknown }
        if (row.id === session.profileId) return p
        const { aiBots: _drop, ...rest } = row as Record<string, unknown>
        return rest
      })
    }
  }
  return redactNodeConfigForCaller(stamped, session)
}
