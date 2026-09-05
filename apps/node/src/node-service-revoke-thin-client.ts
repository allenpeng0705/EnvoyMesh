/**
 * EM-R — thin-client `revokeThinClient` RPC runtime
 * (docs/envoy-home-side-plan.md §1.6, thin-client-protocol-v0.3-draft.md §5).
 *
 * Kept outside node-service-impl so the caller-resolution + owner gate +
 * target-selection stay unit-testable without constructing a full
 * NodeServiceImpl (same pattern as node-service-family.ts).
 */
import type { RevokeThinClientParams, RevokeThinClientResult } from "@envoymesh/api"
import type { SessionTokenRecord } from "@envoymesh/local-store"
import { getRpcCaller } from "./rpc-caller-context.js"

export interface RevokeThinClientDeps {
  sessionTokenStore: {
    /** Remove every token record for `deviceId`; resolve with the removed records. */
    removeTokensForDeviceId(deviceId: string): Promise<SessionTokenRecord[]>
  } | null
  /**
   * Force-close live authenticated thin-client WebSockets for a deviceId.
   * Bound from index.ts to WsServer.disconnectClientsForDevice.
   */
  disconnectClientsForDevice?: (deviceId: string) => number
}

/**
 * Revoke a paired thin-client device server-side.
 *
 * - Omit `deviceId` → revoke the caller's own device (works for any paired
 *   session; the caller's deviceId comes from `getRpcCaller()`).
 * - Provide `deviceId` → owner-only (family/profile sessions may only revoke
 *   themselves). A missing caller context (internal call) is treated as the
 *   owner, mirroring `requireOwnerProfile`.
 *
 * For each target the device's session token records are removed from the
 * node's session-token store and any live WebSocket for that device is
 * force-closed. `revokedDeviceIds` lists only devices that were actually
 * revoked (token record removed and/or socket closed).
 */
export async function revokeThinClientViaRuntime(
  deps: RevokeThinClientDeps,
  params: RevokeThinClientParams,
): Promise<RevokeThinClientResult> {
  const caller = getRpcCaller()
  // No ALS caller context → treat as owner (back-compat, mirrors requireOwnerProfile).
  const isOwner = caller ? caller.isOwnerProfile === true : true
  const callerDeviceId = caller?.deviceId?.trim() ?? ""
  const requestedDeviceId = typeof params.deviceId === "string" ? params.deviceId.trim() : ""

  // Providing a deviceId is owner-only — a family/profile session may only
  // revoke itself (by omitting deviceId).
  if (requestedDeviceId && !isOwner) {
    throw new Error("owner-only: only the node owner may revoke another device")
  }

  const targets = requestedDeviceId
    ? [requestedDeviceId]
    : callerDeviceId
      ? [callerDeviceId]
      : []
  if (targets.length === 0) {
    throw new Error("deviceId is required when not called from a paired thin-client session")
  }

  const revokedDeviceIds: string[] = []
  for (const deviceId of targets) {
    const removed = deps.sessionTokenStore
      ? await deps.sessionTokenStore.removeTokensForDeviceId(deviceId)
      : []
    const closed = deps.disconnectClientsForDevice?.(deviceId) ?? 0
    if (removed.length > 0 || closed > 0) {
      revokedDeviceIds.push(deviceId)
    }
  }

  return { ok: true, revokedDeviceIds }
}
