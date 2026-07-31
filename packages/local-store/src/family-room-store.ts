/**
 * Family group rooms (Phase 51D) — local-only rooms with memberProfileIds.
 *
 * Separate from mesh `chat-rooms.json` so family rooms never enter
 * `chat.room.sync` / libp2p fan-out.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const FAMILY_ROOMS_FILE = "family-rooms.json"

export interface FamilyRoomRecord {
  roomId: string
  title: string
  creatorProfileId: string
  memberProfileIds: string[]
  revision: number
  updatedAt: string
  active: boolean
}

interface FamilyRoomsFile {
  version: "0.1"
  rooms: FamilyRoomRecord[]
}

export interface FamilyRoomStore {
  list(): Promise<FamilyRoomRecord[]>
  get(roomId: string): Promise<FamilyRoomRecord | undefined>
  create(input: {
    title: string
    creatorProfileId: string
    memberProfileIds: string[]
  }): Promise<FamilyRoomRecord>
  update(input: {
    roomId: string
    title?: string
    memberProfileIds?: string[]
    active?: boolean
  }): Promise<FamilyRoomRecord>
  remove(roomId: string): Promise<boolean>
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function normalizeRoom(raw: unknown): FamilyRoomRecord | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Partial<FamilyRoomRecord>
  const roomId = typeof row.roomId === "string" ? row.roomId.trim() : ""
  const title = typeof row.title === "string" ? row.title.trim() : ""
  const creatorProfileId =
    typeof row.creatorProfileId === "string" ? row.creatorProfileId.trim() : ""
  if (!roomId || !title || !creatorProfileId) return null
  const members = Array.isArray(row.memberProfileIds)
    ? [...new Set(row.memberProfileIds.map((m) => String(m).trim()).filter(Boolean))]
    : [creatorProfileId]
  if (!members.includes(creatorProfileId)) members.unshift(creatorProfileId)
  return {
    roomId,
    title,
    creatorProfileId,
    memberProfileIds: members,
    revision: typeof row.revision === "number" && Number.isFinite(row.revision) ? row.revision : 1,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : new Date(0).toISOString(),
    active: row.active !== false,
  }
}

async function readFileShape(path: string): Promise<FamilyRoomsFile> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = JSON.parse(raw) as FamilyRoomsFile
    if (parsed.version !== "0.1" || !Array.isArray(parsed.rooms)) {
      return { version: "0.1", rooms: [] }
    }
    return {
      version: "0.1",
      rooms: parsed.rooms.map(normalizeRoom).filter((r): r is FamilyRoomRecord => r !== null),
    }
  } catch (error) {
    if (isMissingFileError(error)) return { version: "0.1", rooms: [] }
    throw error
  }
}

async function writeFileShape(path: string, file: FamilyRoomsFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  await writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  await rename(tmp, path)
}

export function createFamilyRoomStore(profileDir: string): FamilyRoomStore {
  const path = join(profileDir, FAMILY_ROOMS_FILE)

  return {
    async list() {
      const file = await readFileShape(path)
      return file.rooms.filter((r) => r.active !== false)
    },

    async get(roomId: string) {
      const id = roomId.trim()
      if (!id) return undefined
      const file = await readFileShape(path)
      return file.rooms.find((r) => r.roomId === id)
    },

    async create(input) {
      const title = input.title.trim()
      const creatorProfileId = input.creatorProfileId.trim()
      if (!title) throw new Error("title is required")
      if (!creatorProfileId) throw new Error("creatorProfileId is required")
      const members = [
        ...new Set(
          [creatorProfileId, ...input.memberProfileIds.map((m) => m.trim())].filter(Boolean),
        ),
      ]
      const now = new Date().toISOString()
      const room: FamilyRoomRecord = {
        roomId: randomUUID(),
        title,
        creatorProfileId,
        memberProfileIds: members,
        revision: 1,
        updatedAt: now,
        active: true,
      }
      const file = await readFileShape(path)
      file.rooms.push(room)
      await writeFileShape(path, file)
      return room
    },

    async update(input) {
      const file = await readFileShape(path)
      const idx = file.rooms.findIndex((r) => r.roomId === input.roomId.trim())
      if (idx < 0) throw new Error(`Family room not found: ${input.roomId}`)
      const prev = file.rooms[idx]!
      const next: FamilyRoomRecord = {
        ...prev,
        title: typeof input.title === "string" ? input.title.trim() || prev.title : prev.title,
        memberProfileIds: Array.isArray(input.memberProfileIds)
          ? [...new Set(input.memberProfileIds.map((m) => m.trim()).filter(Boolean))]
          : prev.memberProfileIds,
        active: typeof input.active === "boolean" ? input.active : prev.active,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
      }
      if (!next.memberProfileIds.includes(prev.creatorProfileId)) {
        next.memberProfileIds.unshift(prev.creatorProfileId)
      }
      file.rooms[idx] = next
      await writeFileShape(path, file)
      return next
    },

    async remove(roomId: string) {
      const file = await readFileShape(path)
      const before = file.rooms.length
      file.rooms = file.rooms.filter((r) => r.roomId !== roomId.trim())
      if (file.rooms.length === before) return false
      await writeFileShape(path, file)
      return true
    },
  }
}
