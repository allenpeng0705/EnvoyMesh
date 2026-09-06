/**
 * EM-F1 — family image/file sharing between profiles on the SAME home node.
 *
 * Bytes live under `<profileDir>/family-media/<scopeKey>/<attachmentId>/`
 * (one file + a `meta.json` sidecar) and NEVER leave the node: they are not
 * mesh-published and never touch the owner vault (`shared_vault`).
 *
 * Scope keys are derived server-side from `getRpcCaller()`:
 *   - DM:    `dm:family:<sortedA>:<sortedB>`  (same folder for A→B and B→A,
 *            mirroring the family DM thread key)
 *   - room:  `room:<roomId>`                  (canonical room id from the store)
 *
 * ACL (enforced here, mirroring family message scoping in node-service-impl):
 *   - upload DM:  caller profile active + other participant exists as a family
 *                 profile (never a client-chosen path segment).
 *   - upload room: caller is an active member of an active room.
 *   - read:       DM pair membership OR room `memberProfileIds` membership OR
 *                 owner session (owner may read any family thread).
 *
 * Delete / GC is out of scope for EM-F1.
 */

import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type {
  ChatAttachment,
  FamilyAttachmentDescriptor,
  FamilyAttachmentReadParams,
  FamilyAttachmentReadResult,
  FamilyAttachmentScope,
  FamilyAttachmentUploadParams,
  FamilyAttachmentUploadResult,
} from "@envoymesh/api"
import {
  OWNER_FAMILY_PROFILE_ID,
  familyThreadKey,
  parseFamilyThreadKey,
} from "@envoymesh/api"
import type { FamilyProfileStore, FamilyRoomStore } from "@envoymesh/local-store"
import { getRpcCaller, type RpcCallerContext } from "./rpc-caller-context.js"

/** EM-F1 caps. 25 MiB per file; reads default to 1 MiB slices. */
export const FAMILY_MEDIA_MAX_FILE_BYTES = 25 * 1024 * 1024
export const FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES = 1024 * 1024
export const FAMILY_MEDIA_MAX_FILENAME_LENGTH = 200
export const FAMILY_MEDIA_DIR = "family-media"
export const FAMILY_MEDIA_META_FILE = "meta.json"

export interface FamilyMediaDeps {
  profileDir: string
  familyProfileStore: FamilyProfileStore | null
  familyRoomStore: FamilyRoomStore | null
}

interface FamilyMediaMeta {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  contentHash: string
  /** Server-derived scope key (dm:family:… / room:…) this bytes live under. */
  scopeKey: string
  uploadedByProfileId: string
  createdAt: string
}

interface LocatedAttachment {
  scopeKey: string
  attachmentDir: string
  filePath: string
  meta: FamilyMediaMeta
}

// ---------------------------------------------------------------
// Pure scope / path / filename helpers (unit-testable)
// ---------------------------------------------------------------

/** DM scope key: `dm:family:<sortedA>:<sortedB>`. Shared by both directions. */
export function familyDmScopeKey(profileIdA: string, profileIdB: string): string {
  return `dm:${familyThreadKey(profileIdA, profileIdB)}`
}

/** Room scope key: `room:<roomId>`. */
export function familyRoomScopeKey(roomId: string): string {
  const id = roomId.trim()
  if (!id) throw new Error("roomId is required")
  return `room:${id}`
}

export function parseFamilyDmScopeKey(
  scopeKey: string,
): { profileIdA: string; profileIdB: string } | null {
  if (!scopeKey.startsWith("dm:")) return null
  return parseFamilyThreadKey(scopeKey.slice("dm:".length))
}

export function parseFamilyRoomScopeKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith("room:")) return null
  const roomId = scopeKey.slice("room:".length).trim()
  return roomId || null
}

export function isFamilyMediaScopeKey(scopeKey: string): boolean {
  return parseFamilyDmScopeKey(scopeKey) !== null || parseFamilyRoomScopeKey(scopeKey) !== null
}

/**
 * Basename-only, path-separator-free filename. Strips control chars, trims,
 * caps length. Throws for empty / `.` / `..`.
 */
export function sanitizeFamilyMediaFilename(raw: string): string {
  const base = String(raw ?? "")
    .split(/[\\/]/)
    .pop() ?? ""
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, FAMILY_MEDIA_MAX_FILENAME_LENGTH)
    .trim()
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("invalid filename")
  }
  return cleaned
}

export function familyMediaRootDir(profileDir: string): string {
  return join(profileDir, FAMILY_MEDIA_DIR)
}

export function familyMediaScopeDir(profileDir: string, scopeKey: string): string {
  if (!isFamilyMediaScopeKey(scopeKey)) {
    throw new Error(`invalid family media scope: ${scopeKey}`)
  }
  return join(familyMediaRootDir(profileDir), scopeKey)
}

// ---------------------------------------------------------------
// ACL helpers
// ---------------------------------------------------------------

/** Resolve the active RPC caller; no ALS context → local owner (back-compat). */
function resolveCaller(): RpcCallerContext {
  return (
    getRpcCaller() ?? {
      ownerId: "",
      profileId: OWNER_FAMILY_PROFILE_ID,
      isOwnerProfile: true,
      source: "local",
    }
  )
}

function isDmPairMember(scopeKey: string, profileId: string): boolean {
  const pair = parseFamilyDmScopeKey(scopeKey)
  return pair !== null && (pair.profileIdA === profileId || pair.profileIdB === profileId)
}

/**
 * Read ACL: DM pair membership / room membership / owner may read any family thread.
 *
 * NOTE — deliberate DM-vs-room asymmetry on `active`:
 *   - DM scopes check membership only and do NOT gate on either profile's
 *     `active` flag. This mirrors family DM *messages*: deactivated profiles
 *     keep read access so their history (and the attachments in it) stays
 *     reachable after they go offline.
 *   - Room scopes require `room.active !== false`: an inactive room is not
 *     readable, mirroring room message sends which refuse inactive rooms.
 */
async function mayReadScope(deps: FamilyMediaDeps, scopeKey: string): Promise<boolean> {
  const caller = resolveCaller()
  if (caller.isOwnerProfile) return true
  const profileId = caller.profileId.trim()
  if (!profileId) return false
  const dmPair = parseFamilyDmScopeKey(scopeKey)
  if (dmPair) {
    // Membership only — no `active` check (see asymmetry note above).
    return dmPair.profileIdA === profileId || dmPair.profileIdB === profileId
  }
  const roomId = parseFamilyRoomScopeKey(scopeKey)
  if (roomId && deps.familyRoomStore) {
    const room = await deps.familyRoomStore.get(roomId)
    return room !== undefined && room.active !== false && room.memberProfileIds.includes(profileId)
  }
  return false
}

// ---------------------------------------------------------------
// Storage primitives
// ---------------------------------------------------------------

async function readMeta(attachmentDir: string): Promise<FamilyMediaMeta | null> {
  try {
    const raw = await readFile(join(attachmentDir, FAMILY_MEDIA_META_FILE), "utf8")
    const parsed = JSON.parse(raw) as Partial<FamilyMediaMeta>
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.filename !== "string" ||
      typeof parsed.mimeType !== "string" ||
      typeof parsed.sizeBytes !== "number" ||
      typeof parsed.contentHash !== "string" ||
      typeof parsed.scopeKey !== "string" ||
      !isFamilyMediaScopeKey(parsed.scopeKey)
    ) {
      return null
    }
    return parsed as FamilyMediaMeta
  } catch {
    return null
  }
}

/**
 * Locate an attachment by id across every scope dir under family-media/.
 * O(scope dirs) with one stat each — family-media is a small local area.
 */
async function locateAttachment(
  profileDir: string,
  id: string,
): Promise<LocatedAttachment | null> {
  const wanted = String(id ?? "").trim()
  if (!wanted) return null
  const root = familyMediaRootDir(profileDir)
  let scopeDirs: string[]
  try {
    const entries = await readdir(root, { withFileTypes: true })
    scopeDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return null
  }
  for (const scopeKey of scopeDirs) {
    if (!isFamilyMediaScopeKey(scopeKey)) continue
    const attachmentDir = join(root, scopeKey, wanted)
    const meta = await readMeta(attachmentDir)
    if (meta) {
      return {
        scopeKey,
        attachmentDir,
        filePath: join(attachmentDir, meta.filename),
        meta,
      }
    }
  }
  return null
}

/** Load an attachment that MUST live under a specific scope dir (message send). */
async function loadAttachmentInScope(
  deps: FamilyMediaDeps,
  scopeKey: string,
  id: string,
): Promise<FamilyMediaMeta> {
  const wanted = String(id ?? "").trim()
  if (!wanted) throw new Error(`attachment id is required`)
  const meta = await readMeta(join(familyMediaScopeDir(deps.profileDir, scopeKey), wanted))
  if (!meta) {
    throw new Error(`not-found: family attachment ${wanted} is not in this thread's media area`)
  }
  return meta
}

// ---------------------------------------------------------------
// Runtime: upload
// ---------------------------------------------------------------

export async function uploadFamilyAttachmentViaRuntime(
  deps: FamilyMediaDeps,
  params: FamilyAttachmentUploadParams,
): Promise<FamilyAttachmentUploadResult> {
  const caller = resolveCaller()
  const fromProfileId = caller.profileId.trim() || OWNER_FAMILY_PROFILE_ID

  // Determine + authorize the scope. `from` always comes from getRpcCaller();
  // only the other endpoint (dm target / room) is client-provided.
  const scope = params.scope
  const dmTarget =
    scope && "dm" in scope ? (scope.dm?.toProfileId?.trim() ?? "") : ""
  const roomTarget =
    scope && "room" in scope ? (scope.room?.roomId?.trim() ?? "") : ""
  let scopeKey: string
  if (dmTarget && !roomTarget) {
    if (dmTarget === fromProfileId) {
      throw new Error(
        fromProfileId === OWNER_FAMILY_PROFILE_ID
          ? "Cannot attach a file to a DM with yourself — this session is bound as Owner"
          : "Cannot attach a file to a DM with yourself",
      )
    }
    if (!deps.familyProfileStore) {
      throw new Error("Family profile store is not available")
    }
    const [fromProfile, toProfile] = await Promise.all([
      deps.familyProfileStore.get(fromProfileId),
      deps.familyProfileStore.get(dmTarget),
    ])
    if (!fromProfile || fromProfile.active === false) {
      throw new Error("Your family profile is not active")
    }
    if (!toProfile) {
      throw new Error(`Family profile not found: ${dmTarget}`)
    }
    scopeKey = familyDmScopeKey(fromProfileId, dmTarget)
  } else if (roomTarget && !dmTarget) {
    if (!deps.familyRoomStore) {
      throw new Error("Family room store is not available")
    }
    if (!deps.familyProfileStore) {
      throw new Error("Family profile store is not available")
    }
    const profile = await deps.familyProfileStore.get(fromProfileId)
    if (!profile || profile.active === false) {
      throw new Error("Your family profile is not active")
    }
    const room = await deps.familyRoomStore.get(roomTarget)
    if (!room || room.active === false) {
      throw new Error(`Family room not found: ${roomTarget}`)
    }
    if (!room.memberProfileIds.includes(fromProfileId)) {
      throw new Error("forbidden: you are not a member of this family room")
    }
    // Always use the store's canonical room id for the path.
    scopeKey = familyRoomScopeKey(room.roomId)
  } else {
    throw new Error(
      "scope is required — exactly one of {dm:{toProfileId}} or {room:{roomId}}",
    )
  }

  const filename = sanitizeFamilyMediaFilename(params.filename)
  const mimeType = String(params.mimeType ?? "")
    .trim()
    .slice(0, 200)
  const b64 = String(params.contentBase64 ?? "").replace(/\s+/g, "")
  if (!b64) throw new Error("contentBase64 is required")
  if (b64.length > Math.ceil((FAMILY_MEDIA_MAX_FILE_BYTES * 4) / 3) + 8) {
    throw new Error(
      `too-large: family attachment exceeds ${FAMILY_MEDIA_MAX_FILE_BYTES} bytes`,
    )
  }
  const bytes = Buffer.from(b64, "base64")
  if (bytes.length > FAMILY_MEDIA_MAX_FILE_BYTES) {
    throw new Error(
      `too-large: family attachment is ${bytes.length} bytes (max ${FAMILY_MEDIA_MAX_FILE_BYTES})`,
    )
  }

  const id = randomUUID()
  const attachmentDir = join(familyMediaScopeDir(deps.profileDir, scopeKey), id)
  await mkdir(attachmentDir, { recursive: true })
  const filePath = join(attachmentDir, filename)
  const contentHash = createHash("sha256").update(bytes).digest("hex")
  const meta: FamilyMediaMeta = {
    id,
    filename,
    mimeType,
    sizeBytes: bytes.length,
    contentHash,
    scopeKey,
    uploadedByProfileId: fromProfileId,
    createdAt: new Date().toISOString(),
  }
  await writeFile(filePath, bytes, { mode: 0o600 })
  await writeFile(join(attachmentDir, FAMILY_MEDIA_META_FILE), `${JSON.stringify(meta)}\n`, {
    mode: 0o600,
  })

  return { id, filename, mimeType, sizeBytes: bytes.length, contentHash }
}

// ---------------------------------------------------------------
// Runtime: read (sliced; mirrors readLibraryItemContent semantics)
// ---------------------------------------------------------------

export async function readFamilyAttachmentViaRuntime(
  deps: FamilyMediaDeps,
  params: FamilyAttachmentReadParams,
): Promise<FamilyAttachmentReadResult> {
  const located = await locateAttachment(deps.profileDir, params.id)
  if (!located) {
    throw new Error(`not-found: family attachment ${String(params.id ?? "")}`)
  }
  if (!(await mayReadScope(deps, located.scopeKey))) {
    throw new Error("forbidden: you do not have access to this family attachment")
  }

  const maxBytes = Math.min(
    Math.floor(Number(params.maxBytes) || 0) || FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES,
    FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES,
  )
  const rangeMode = params.offset !== undefined && params.offset !== null
  const offset = rangeMode ? Math.max(0, Math.floor(Number(params.offset) || 0)) : 0
  const sizeBytes = located.meta.sizeBytes
  if (offset >= sizeBytes) {
    return { contentBase64: "", sizeBytes, truncated: false }
  }
  const length = Math.min(maxBytes, sizeBytes - offset)
  const fh = await open(located.filePath, "r")
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await fh.read(buf, 0, length, offset)
    const slice = buf.subarray(0, bytesRead)
    return {
      contentBase64: slice.toString("base64"),
      sizeBytes,
      truncated: offset + bytesRead < sizeBytes,
    }
  } finally {
    await fh.close()
  }
}

// ---------------------------------------------------------------
// Runtime: resolve attachment descriptors for a family message send
// ---------------------------------------------------------------

/**
 * Verify each attachment id exists under `scopeKey` (the exact DM pair / room
 * of the send) and return mesh-style descriptors (sensitivity always
 * "private" — family media never leaves the home node). Bytes stay in
 * family-media; only descriptors ride the ChatMessage/events/history.
 */
export async function resolveFamilyMessageAttachmentsViaRuntime(
  deps: FamilyMediaDeps,
  scopeKey: string,
  descriptors: FamilyAttachmentDescriptor[] | undefined,
): Promise<ChatAttachment[]> {
  const ids = Array.isArray(descriptors) ? descriptors : []
  if (ids.length === 0) return []
  const out: ChatAttachment[] = []
  for (const desc of ids) {
    const meta = await loadAttachmentInScope(deps, scopeKey, desc.id)
    out.push({
      id: meta.id,
      filename: meta.filename,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      sensitivity: "private",
      // Family descriptors must carry the stored content hash so clients can
      // (a) tell family-media rows from vault rows and (b) dedupe locally.
      contentHash: meta.contentHash,
    })
  }
  return out
}
