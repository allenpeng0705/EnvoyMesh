import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createFamilyProfileStore,
  OWNER_FAMILY_PROFILE_ID,
} from "../src/family-profile-store.js"

describe("createFamilyProfileStore", () => {
  it("ensures a single owner profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-family-"))
    try {
      const store = createFamilyProfileStore(dir)
      const owner = await store.ensureOwnerProfile({ name: "Dad" })
      expect(owner.id).toBe(OWNER_FAMILY_PROFILE_ID)
      expect(owner.isOwner).toBe(true)
      expect(owner.name).toBe("Dad")
      const again = await store.ensureOwnerProfile({ name: "Other" })
      expect(again.id).toBe(owner.id)
      expect(again.name).toBe("Dad")
      await expect(store.create({ name: "Mom", isOwner: true })).rejects.toThrow(/already exists/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("creates unique non-owner profiles and blocks deleting the owner", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-family-"))
    try {
      const store = createFamilyProfileStore(dir)
      await store.ensureOwnerProfile({ name: "Dad" })
      const mom = await store.create({ name: "Mom", avatarColor: "#ec4899" })
      expect(mom.isOwner).toBe(false)
      expect(mom.id).toBe("mom")
      const mom2 = await store.create({ name: "Mom" })
      expect(mom2.id).toBe("mom-2")
      await expect(store.delete(OWNER_FAMILY_PROFILE_ID)).rejects.toThrow(/owner/)
      expect(await store.delete(mom.id)).toBe(true)
      expect(await store.get(mom.id)).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("deactivates without deleting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-family-"))
    try {
      const store = createFamilyProfileStore(dir)
      await store.ensureOwnerProfile({ name: "Dad" })
      const alex = await store.create({ name: "Alex" })
      const deactivated = await store.deactivate(alex.id)
      expect(deactivated.active).toBe(false)
      expect(await store.get(alex.id)).toMatchObject({ active: false })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it("persists extAgentEnabled true/false for members", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-family-"))
    try {
      const store = createFamilyProfileStore(dir)
      await store.ensureOwnerProfile({ name: "Dad" })
      const mom = await store.create({ name: "Mom" })
      expect(mom.extAgentEnabled).toBe(false)
      const allowed = await store.update({ id: mom.id, extAgentEnabled: true })
      expect(allowed.extAgentEnabled).toBe(true)
      const denied = await store.update({ id: mom.id, extAgentEnabled: false })
      expect(denied.extAgentEnabled).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("a write whose directory was removed is not an unhandled rejection", () => {
  it("resolves instead of rejecting when the parent directory is gone", async () => {
    // The failure this guards: the atomic rename loses its `.tmp` file to a
    // directory removal that happened between the write and the rename (a wiped
    // profile dir, or a test's teardown finishing first). That rejection used to
    // surface as an *unhandled* rejection in full-suite runs — Node's default
    // `--unhandled-rejections=throw` can kill the process — because some callers
    // are fire-and-forget.
    const dir = await mkdtemp(join(tmpdir(), "family-store-gone-"))
    const store = createFamilyProfileStore(dir)
    await store.ensureOwnerProfile({ name: "Owner" })

    const rejected: unknown[] = []
    const onUnhandled = (reason: unknown) => rejected.push(reason)
    process.on("unhandledRejection", onUnhandled)
    try {
      await rm(dir, { recursive: true, force: true })
      // Fire-and-forget on purpose: this is the shape that produced the
      // unhandled rejection.
      void store.update({ id: OWNER_FAMILY_PROFILE_ID, name: "Renamed" })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(rejected).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  });
});
