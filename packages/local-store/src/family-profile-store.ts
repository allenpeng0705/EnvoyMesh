/**
 * Family profile registry (Phase 51) — local-only identities on one home node.
 *
 * Wire type lives in `@envoymesh/api` (`FamilyProfile`); this store persists the
 * same shape without depending on the api package.
 */

import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const FAMILY_PROFILES_FILE = "family-profiles.json"

/** Stable id for the auto-created owner profile (migration / backfill). */
export const OWNER_FAMILY_PROFILE_ID = "owner"

export interface FamilyProfileRecord {
  id: string
  name: string
  avatarColor?: string
  isOwner: boolean
  createdAt: string
  lastSeenAt?: string
  active: boolean
  /** Omitted / undefined = denied for non-owners (opt-in). Owner always allowed at the API layer. */
  extAgentEnabled?: boolean
  /** Opaque bot defs — typed as FamilyProfile.aiBots at the api boundary. */
  aiBots?: unknown[]
}

interface FamilyProfilesFile {
  version: "0.1"
  profiles: FamilyProfileRecord[]
}

export interface CreateFamilyProfileInput {
  name: string
  avatarColor?: string
  isOwner?: boolean
  id?: string
  now?: string
}

export interface UpdateFamilyProfileInput {
  id: string
  name?: string
  avatarColor?: string
  active?: boolean
  extAgentEnabled?: boolean
  aiBots?: unknown[]
  lastSeenAt?: string
  now?: string
}

export interface FamilyProfileStore {
  list(): Promise<FamilyProfileRecord[]>
  get(id: string): Promise<FamilyProfileRecord | undefined>
  getOwner(): Promise<FamilyProfileRecord | undefined>
  ensureOwnerProfile(input?: { name?: string; avatarColor?: string }): Promise<FamilyProfileRecord>
  create(input: CreateFamilyProfileInput): Promise<FamilyProfileRecord>
  update(input: UpdateFamilyProfileInput): Promise<FamilyProfileRecord>
  deactivate(id: string): Promise<FamilyProfileRecord>
  delete(id: string): Promise<boolean>
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  return base || "member"
}

function normalizeProfile(raw: unknown): FamilyProfileRecord | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Partial<FamilyProfileRecord>
  const id = typeof row.id === "string" ? row.id.trim() : ""
  const name = typeof row.name === "string" ? row.name.trim() : ""
  if (!id || !name) return null
  return {
    id,
    name,
    avatarColor: typeof row.avatarColor === "string" ? row.avatarColor : undefined,
    isOwner: row.isOwner === true,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date(0).toISOString(),
    lastSeenAt: typeof row.lastSeenAt === "string" ? row.lastSeenAt : undefined,
    active: row.active !== false,
    ...(typeof row.extAgentEnabled === "boolean"
      ? { extAgentEnabled: row.extAgentEnabled }
      : {}),
    aiBots: Array.isArray(row.aiBots) ? row.aiBots : undefined,
  }
}

async function readFileShape(path: string): Promise<FamilyProfilesFile> {
  try {
    const raw = await readFile(path, "utf8")
    if (!raw.trim()) return { version: "0.1", profiles: [] }
    const parsed = JSON.parse(raw) as FamilyProfilesFile
    if (parsed.version !== "0.1" || !Array.isArray(parsed.profiles)) {
      return { version: "0.1", profiles: [] }
    }
    const profiles = parsed.profiles
      .map(normalizeProfile)
      .filter((p): p is FamilyProfileRecord => p !== null)
    return { version: "0.1", profiles }
  } catch (error) {
    if (isMissingFileError(error)) return { version: "0.1", profiles: [] }
    throw error
  }
}

async function writeFileShape(path: string, file: FamilyProfilesFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`
  const content = `${JSON.stringify(file, null, 2)}\n`
  JSON.parse(content)
  await writeFile(tmp, content, { mode: 0o600 })
  await rename(tmp, path)
}

function allocateId(existing: FamilyProfileRecord[], preferred: string): string {
  const taken = new Set(existing.map((p) => p.id))
  if (!taken.has(preferred)) return preferred
  for (let i = 2; i < 1000; i++) {
    const candidate = `${preferred}-${i}`
    if (!taken.has(candidate)) return candidate
  }
  return `${preferred}-${randomUUID().slice(0, 8)}`
}

export function createFamilyProfileStore(profileDir: string): FamilyProfileStore {
  const path = join(profileDir, FAMILY_PROFILES_FILE)

  let mutex: Promise<FamilyProfilesFile> = readFileShape(path)

  function serialised<T>(
    fn: (file: FamilyProfilesFile) => Promise<{ file: FamilyProfilesFile; result: T }>,
  ): Promise<T> {
    const prev = mutex
    let resolveOuter: (value: T) => void
    let rejectOuter: (reason?: unknown) => void
    const outer = new Promise<T>((resolve, reject) => {
      resolveOuter = resolve
      rejectOuter = reject
    })

    mutex = prev.then(async (file) => {
      try {
        const { file: next, result } = await fn(file)
        await writeFileShape(path, next)
        resolveOuter(result)
        return next
      } catch (error) {
        rejectOuter(error)
        try {
          return await readFileShape(path)
        } catch {
          return { version: "0.1", profiles: [] }
        }
      }
    })
    mutex.catch(() => {})
    return outer
  }

  return {
    async list() {
      const file = await readFileShape(path)
      return [...file.profiles].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },

    async get(id) {
      const file = await readFileShape(path)
      return file.profiles.find((p) => p.id === id)
    },

    async getOwner() {
      const file = await readFileShape(path)
      return file.profiles.find((p) => p.isOwner)
    },

    async ensureOwnerProfile(input) {
      return serialised(async (file) => {
        const existing = file.profiles.find((p) => p.isOwner)
        if (existing) {
          return { file, result: existing }
        }
        if (file.profiles.length > 0) {
          const first = file.profiles[0]!
          const promoted: FamilyProfileRecord = { ...first, isOwner: true, active: true }
          const profiles = file.profiles.map((p) =>
            p.id === first.id ? promoted : { ...p, isOwner: false },
          )
          return { file: { version: "0.1", profiles }, result: promoted }
        }
        const now = new Date().toISOString()
        const profile: FamilyProfileRecord = {
          id: OWNER_FAMILY_PROFILE_ID,
          name: input?.name?.trim() || "Owner",
          avatarColor: input?.avatarColor,
          isOwner: true,
          active: true,
          createdAt: now,
        }
        return {
          file: { version: "0.1", profiles: [profile] },
          result: profile,
        }
      })
    },

    async create(input) {
      return serialised(async (file) => {
        const name = input.name?.trim()
        if (!name) throw new Error("name is required")

        const wantOwner = input.isOwner === true
        if (wantOwner && file.profiles.some((p) => p.isOwner)) {
          throw new Error("An owner profile already exists")
        }

        const preferred =
          input.id?.trim() || (wantOwner ? OWNER_FAMILY_PROFILE_ID : slugify(name))
        const id = allocateId(file.profiles, preferred)
        const now = input.now ?? new Date().toISOString()
        const profile: FamilyProfileRecord = {
          id,
          name,
          avatarColor: input.avatarColor,
          isOwner: wantOwner,
          active: true,
          // Non-owner: Ext Agent off until owner opts in (Settings → Family).
          ...(wantOwner ? {} : { extAgentEnabled: false as const }),
          createdAt: now,
        }
        return {
          file: { version: "0.1", profiles: [...file.profiles, profile] },
          result: profile,
        }
      })
    },

    async update(input) {
      return serialised(async (file) => {
        const idx = file.profiles.findIndex((p) => p.id === input.id)
        if (idx < 0) throw new Error(`Family profile not found: ${input.id}`)
        const prev = file.profiles[idx]!
        const next: FamilyProfileRecord = {
          ...prev,
          name: input.name !== undefined ? input.name.trim() || prev.name : prev.name,
          avatarColor: input.avatarColor !== undefined ? input.avatarColor : prev.avatarColor,
          active: input.active !== undefined ? input.active : prev.active,
          aiBots: input.aiBots !== undefined ? input.aiBots : prev.aiBots,
          lastSeenAt: input.lastSeenAt !== undefined ? input.lastSeenAt : prev.lastSeenAt,
        }
        if (input.extAgentEnabled !== undefined) {
          next.extAgentEnabled = input.extAgentEnabled
        }
        if (!next.name) throw new Error("name is required")
        const profiles = [...file.profiles]
        profiles[idx] = next
        return { file: { version: "0.1", profiles }, result: next }
      })
    },

    async deactivate(id) {
      return this.update({ id, active: false })
    },

    async delete(id) {
      return serialised(async (file) => {
        const target = file.profiles.find((p) => p.id === id)
        if (!target) return { file, result: false }
        if (target.isOwner) {
          throw new Error("Cannot delete the owner profile")
        }
        return {
          file: {
            version: "0.1",
            profiles: file.profiles.filter((p) => p.id !== id),
          },
          result: true,
        }
      })
    },
  }
}
