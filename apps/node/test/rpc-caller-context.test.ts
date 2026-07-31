import { describe, expect, it } from "vitest"
import {
  localOwnerCaller,
  redactNodeConfigForCaller,
  requireOwnerProfile,
  runWithRpcCaller,
  sessionCallerFromToken,
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
})
