import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createFamilyRoomStore } from "../src/family-room-store.js"

describe("family-room-store", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "family-rooms-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it("creates rooms with creator always in members", async () => {
    const store = createFamilyRoomStore(dir)
    const room = await store.create({
      title: "Weekend plans",
      creatorProfileId: "dad",
      memberProfileIds: ["mom", "alex"],
    })
    expect(room.title).toBe("Weekend plans")
    expect(room.memberProfileIds.sort()).toEqual(["alex", "dad", "mom"])
    expect(room.revision).toBe(1)

    const listed = await store.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.roomId).toBe(room.roomId)
  })

  it("updates membership and bumps revision", async () => {
    const store = createFamilyRoomStore(dir)
    const room = await store.create({
      title: "Kids",
      creatorProfileId: "mom",
      memberProfileIds: ["alex"],
    })
    const updated = await store.update({
      roomId: room.roomId,
      memberProfileIds: ["mom", "alex", "dad"],
      title: "Family kids",
    })
    expect(updated.title).toBe("Family kids")
    expect(updated.revision).toBe(2)
    expect(updated.memberProfileIds).toContain("dad")
  })
})
