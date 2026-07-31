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
})
