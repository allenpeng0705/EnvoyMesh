import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFamilyProfileStore } from "@envoymesh/local-store"
import { runWithRpcCaller } from "../src/rpc-caller-context.js"
import {
  createFamilyProfileViaRuntime,
  updateFamilyProfileViaRuntime,
} from "../src/node-service-family.js"

describe("updateFamilyProfileViaRuntime self-service", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "family-rpc-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("lets a non-owner update their own name and bots", async () => {
    const store = createFamilyProfileStore(dir)
    await store.create({ name: "Dad", isOwner: true })
    const mom = await runWithRpcCaller(
      {
        ownerId: "envoy:owner:test",
        profileId: "owner",
        isOwnerProfile: true,
        source: "local",
      },
      () => createFamilyProfileViaRuntime(store, { name: "Mom" }),
    )

    const updated = await runWithRpcCaller(
      {
        ownerId: "envoy:owner:test",
        profileId: mom.profile.id,
        isOwnerProfile: false,
        source: "session",
      },
      () =>
        updateFamilyProfileViaRuntime(store, {
          id: mom.profile.id,
          name: "Mom Updated",
          aiBots: [
            {
              id: "luna",
              name: "Luna",
              systemPrompt: "hi",
              enabled: true,
            },
          ],
        }),
    )
    expect(updated.profile.name).toBe("Mom Updated")
    expect(updated.profile.aiBots?.[0]?.id).toBe("luna")
  })

  it("rejects non-owner updating another profile or active flag", async () => {
    const store = createFamilyProfileStore(dir)
    await store.create({ name: "Dad", isOwner: true })
    const mom = await runWithRpcCaller(
      {
        ownerId: "envoy:owner:test",
        profileId: "owner",
        isOwnerProfile: true,
        source: "local",
      },
      () => createFamilyProfileViaRuntime(store, { name: "Mom" }),
    )

    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:test",
          profileId: mom.profile.id,
          isOwnerProfile: false,
          source: "session",
        },
        () =>
          updateFamilyProfileViaRuntime(store, {
            id: "owner",
            name: "Hacked",
          }),
      ),
    ).rejects.toThrow(/own family profile/)

    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:test",
          profileId: mom.profile.id,
          isOwnerProfile: false,
          source: "session",
        },
        () =>
          updateFamilyProfileViaRuntime(store, {
            id: mom.profile.id,
            active: false,
          }),
      ),
    ).rejects.toThrow(/activate or deactivate/)

    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:test",
          profileId: mom.profile.id,
          isOwnerProfile: false,
          source: "session",
        },
        () =>
          updateFamilyProfileViaRuntime(store, {
            id: mom.profile.id,
            extAgentEnabled: false,
          }),
      ),
    ).rejects.toThrow(/Ext Agent access/)
  })

  it("lets the owner allow Ext Agent chat for a member", async () => {
    const store = createFamilyProfileStore(dir)
    await store.create({ name: "Dad", isOwner: true })
    const mom = await runWithRpcCaller(
      {
        ownerId: "envoy:owner:test",
        profileId: "owner",
        isOwnerProfile: true,
        source: "local",
      },
      () => createFamilyProfileViaRuntime(store, { name: "Mom" }),
    )
    expect(mom.profile.extAgentEnabled).toBe(false)

    const allowed = await runWithRpcCaller(
      {
        ownerId: "envoy:owner:test",
        profileId: "owner",
        isOwnerProfile: true,
        source: "local",
      },
      () =>
        updateFamilyProfileViaRuntime(store, {
          id: mom.profile.id,
          extAgentEnabled: true,
        }),
    )
    expect(allowed.profile.extAgentEnabled).toBe(true)
  })
})
