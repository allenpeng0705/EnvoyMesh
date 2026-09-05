import { describe, expect, it, vi } from "vitest"
import type { SessionTokenRecord } from "@envoymesh/local-store"
import type { RevokeThinClientParams } from "@envoymesh/api"
import { runWithRpcCaller } from "../src/rpc-caller-context.js"
import {
  revokeThinClientViaRuntime,
  type RevokeThinClientDeps,
} from "../src/node-service-revoke-thin-client.js"

const OWNER = { ownerId: "envoy:owner:test", deviceId: "thin-client:owner-phone-00000001", profileId: "owner", isOwnerProfile: true, source: "session" as const }
const MOM = { ownerId: "envoy:owner:test", deviceId: "thin-client:mom-phone-00000002", profileId: "mom", isOwnerProfile: false, source: "session" as const }
const LOCAL_OWNER = { ownerId: "envoy:owner:test", profileId: "owner", isOwnerProfile: true, source: "local" as const }

function tokenRecord(deviceId: string, profileId = "owner"): SessionTokenRecord {
  const now = new Date().toISOString()
  return {
    token: `tok-${deviceId}`,
    ownerId: "envoy:owner:test",
    deviceId,
    profileId,
    displayName: "Phone",
    createdAt: now,
    lastUsedAt: now,
  }
}

function makeDeps(overrides?: {
  removed?: SessionTokenRecord[]
  store?: { removeTokensForDeviceId: (deviceId: string) => Promise<SessionTokenRecord[]> } | null
}): RevokeThinClientDeps {
  const removed = overrides?.removed ?? []
  const store = overrides?.store === null
    ? null
    : overrides?.store ?? {
        removeTokensForDeviceId: vi.fn(async (deviceId: string) =>
          removed.filter((r) => r.deviceId === deviceId),
        ),
      }
  return { sessionTokenStore: store }
}

async function call(
  params: RevokeThinClientParams,
  deps: RevokeThinClientDeps,
  caller?: Parameters<typeof runWithRpcCaller>[0],
): Promise<ReturnType<typeof revokeThinClientViaRuntime>> {
  if (caller) return runWithRpcCaller(caller, () => revokeThinClientViaRuntime(deps, params))
  return revokeThinClientViaRuntime(deps, params)
}

describe("revokeThinClientViaRuntime", () => {
  it("self-revokes the caller's own device when deviceId is omitted (owner session)", async () => {
    const removed = [tokenRecord(OWNER.deviceId)]
    const disconnect = vi.fn(() => 1)
    const deps = { ...makeDeps({ removed }), disconnectClientsForDevice: disconnect }

    const result = await call({}, deps, OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [OWNER.deviceId] })
    expect(deps.sessionTokenStore!.removeTokensForDeviceId).toHaveBeenCalledWith(OWNER.deviceId)
    expect(disconnect).toHaveBeenCalledWith(OWNER.deviceId)
  })

  it("lets a family/profile session self-revoke (deviceId omitted)", async () => {
    const removed = [tokenRecord(MOM.deviceId, "mom")]
    const deps = makeDeps({ removed })

    const result = await call({}, deps, MOM)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [MOM.deviceId] })
    expect(deps.sessionTokenStore!.removeTokensForDeviceId).toHaveBeenCalledWith(MOM.deviceId)
  })

  it("rejects a family session revoking another device by deviceId", async () => {
    const disconnect = vi.fn()
    const deps = { ...makeDeps({ removed: [tokenRecord(OWNER.deviceId)] }), disconnectClientsForDevice: disconnect }

    await expect(
      call({ deviceId: OWNER.deviceId }, deps, MOM),
    ).rejects.toThrow("owner-only: only the node owner may revoke another device")

    expect(deps.sessionTokenStore!.removeTokensForDeviceId).not.toHaveBeenCalled()
    expect(disconnect).not.toHaveBeenCalled()
  })

  it("rejects a family session passing even its own deviceId explicitly", async () => {
    const deps = makeDeps({ removed: [tokenRecord(MOM.deviceId, "mom")] })

    await expect(
      call({ deviceId: MOM.deviceId }, deps, MOM),
    ).rejects.toThrow("owner-only: only the node owner may revoke another device")
  })

  it("lets the owner revoke another device by deviceId (local owner caller)", async () => {
    const removed = [tokenRecord(MOM.deviceId, "mom")]
    const disconnect = vi.fn(() => 1)
    const deps = { ...makeDeps({ removed }), disconnectClientsForDevice: disconnect }

    const result = await call({ deviceId: MOM.deviceId }, deps, LOCAL_OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [MOM.deviceId] })
    expect(deps.sessionTokenStore!.removeTokensForDeviceId).toHaveBeenCalledWith(MOM.deviceId)
    expect(disconnect).toHaveBeenCalledWith(MOM.deviceId)
  })

  it("treats a missing caller context as owner (internal call)", async () => {
    const removed = [tokenRecord(MOM.deviceId, "mom")]
    const deps = makeDeps({ removed })

    const result = await call({ deviceId: MOM.deviceId }, deps)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [MOM.deviceId] })
  })

  it("throws when nothing can be revoked (no deviceId and caller has none)", async () => {
    const deps = makeDeps({ removed: [] })

    await expect(call({}, deps, LOCAL_OWNER)).rejects.toThrow(
      "deviceId is required when not called from a paired thin-client session",
    )
  })

  it("reports only devices actually revoked (store empty + nothing closed)", async () => {
    const deps = makeDeps({ removed: [] })

    const result = await call({ deviceId: OWNER.deviceId }, deps, LOCAL_OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [] })
  })

  it("still reports a device as revoked when only its WS was closed (no token record)", async () => {
    const disconnect = vi.fn(() => 2)
    const deps = { ...makeDeps({ removed: [] }), disconnectClientsForDevice: disconnect }

    const result = await call({ deviceId: OWNER.deviceId }, deps, LOCAL_OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [OWNER.deviceId] })
    expect(disconnect).toHaveBeenCalledWith(OWNER.deviceId)
  })

  it("trims whitespace around the requested deviceId", async () => {
    const removed = [tokenRecord(MOM.deviceId, "mom")]
    const deps = makeDeps({ removed })

    const result = await call({ deviceId: `  ${MOM.deviceId}  ` }, deps, LOCAL_OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [MOM.deviceId] })
    expect(deps.sessionTokenStore!.removeTokensForDeviceId).toHaveBeenCalledWith(MOM.deviceId)
  })

  it("tolerates a missing session-token store (still closes live WS)", async () => {
    const disconnect = vi.fn(() => 1)
    const deps = { ...makeDeps({ store: null }), disconnectClientsForDevice: disconnect }

    const result = await call({}, deps, OWNER)

    expect(result).toEqual({ ok: true, revokedDeviceIds: [OWNER.deviceId] })
    expect(disconnect).toHaveBeenCalledWith(OWNER.deviceId)
  })
})
