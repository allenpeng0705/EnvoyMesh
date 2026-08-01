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
 * Build RPC caller context from a thin-client session token record.
 * Legacy tokens without `profileId` bind to the owner profile.
 */
export function sessionCallerFromToken(record: {
  ownerId: string
  profileId?: string
  deviceId?: string
  /** Optional override when the family store has resolved isOwner. */
  isOwnerProfile?: boolean
}): RpcCallerContext {
  const profileId =
    typeof record.profileId === "string" && record.profileId.trim()
      ? record.profileId.trim()
      : OWNER_FAMILY_PROFILE_ID
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
  } as T & { aiBots?: unknown }
  // Owner-emitted config carries the owner's aiBots list — never push that
  // onto family member sessions (they load their own bots via getNodeConfig).
  if (!session.isOwnerProfile) {
    stamped.aiBots = []
  }
  return redactNodeConfigForCaller(stamped, session)
}
