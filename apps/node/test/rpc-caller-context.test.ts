import { describe, expect, it } from "vitest"
import {
  localOwnerCaller,
  redactNodeConfigForCaller,
  requireOwnerProfile,
  runWithRpcCaller,
  sessionCallerFromToken,
  stampConfigCallerForSession,
} from "../src/rpc-caller-context.js"

describe("rpc-caller-context", () => {
  it("requireOwnerProfile allows owner and rejects family members", async () => {
    await runWithRpcCaller(localOwnerCaller("envoy:owner:x"), async () => {
      expect(requireOwnerProfile("test").isOwnerProfile).toBe(true)
    })
    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:x",
          profileId: "mom",
          isOwnerProfile: false,
          source: "session",
        },
        async () => {
          requireOwnerProfile("change node settings")
        },
      ),
    ).rejects.toThrow(/Only the node owner/)
  })

  it("sessionCallerFromToken binds profileId and defaults legacy tokens to owner", () => {
    const dad = sessionCallerFromToken({
      ownerId: "envoy:owner:home",
      profileId: "dad",
      deviceId: "dev-1",
    })
    expect(dad.profileId).toBe("dad")
    expect(dad.isOwnerProfile).toBe(false)
    expect(dad.source).toBe("session")

    const legacy = sessionCallerFromToken({
      ownerId: "envoy:owner:home",
      deviceId: "dev-2",
    })
    expect(legacy.profileId).toBe("owner")
    expect(legacy.isOwnerProfile).toBe(true)
  })

  it("sessionCallerFromToken prefers boundFamilyProfileId over corrupted owner profileId", () => {
    const mom = sessionCallerFromToken({
      ownerId: "envoy:owner:home",
      profileId: "owner",
      boundFamilyProfileId: "mom",
      deviceId: "android-mom",
    })
    expect(mom.profileId).toBe("mom")
    expect(mom.isOwnerProfile).toBe(false)
  })

  it("redacts secrets for non-owner callers", () => {
    const config = {
      modelProviders: { mode: "openai", apiKey: "secret" },
      skillApiKeys: { a: "b" },
      lanAutoBondFleetToken: "fleet",
      openclawEnabled: true,
    }
    const redacted = redactNodeConfigForCaller(config, {
      ownerId: "o",
      profileId: "mom",
      isOwnerProfile: false,
      source: "session",
    })
    expect(redacted.modelProviders.apiKey).toBeUndefined()
    expect(redacted.skillApiKeys).toBeUndefined()
    expect(redacted.lanAutoBondFleetToken).toBeUndefined()
    expect(redacted.openclawEnabled).toBe(true)
  })

  it("stampConfigCallerForSession overwrites emitter owner identity for family sessions", () => {
    const emittedByOwner = {
      openclawEnabled: true,
      callerFamilyProfileId: "owner",
      callerIsOwnerProfile: true,
      modelProviders: { mode: "openai", apiKey: "secret" },
      aiBots: [{ id: "luna", name: "Luna" }],
      familyProfiles: [
        { id: "owner", name: "Allen", aiBots: [{ id: "luna", name: "Luna" }] },
        { id: "mom", name: "Mom", aiBots: [] },
      ],
    }
    const forMom = stampConfigCallerForSession(emittedByOwner, {
      ownerId: "envoy:owner:home",
      profileId: "mom",
      isOwnerProfile: false,
      source: "session",
      deviceId: "thin-client:mom-phone",
    })
    expect(forMom.callerFamilyProfileId).toBe("mom")
    expect(forMom.callerIsOwnerProfile).toBe(false)
    expect(forMom.modelProviders.apiKey).toBeUndefined()
    expect(forMom.openclawEnabled).toBe(true)
    expect(forMom.aiBots).toEqual([])
    expect(forMom.familyProfiles).toEqual([
      { id: "owner", name: "Allen" },
      { id: "mom", name: "Mom", aiBots: [] },
    ])

    const forOwner = stampConfigCallerForSession(
      {
        ...emittedByOwner,
        aiBots: [{ id: "luna", name: "Luna" }],
      },
      {
        ownerId: "envoy:owner:home",
        profileId: "owner",
        isOwnerProfile: true,
        source: "session",
      },
    )
    expect(forOwner.callerFamilyProfileId).toBe("owner")
    expect(forOwner.callerIsOwnerProfile).toBe(true)
    expect(forOwner.modelProviders.apiKey).toBe("secret")
    expect(forOwner.aiBots).toEqual([{ id: "luna", name: "Luna" }])
    expect(forOwner.familyProfiles).toEqual(emittedByOwner.familyProfiles)
  })
})
