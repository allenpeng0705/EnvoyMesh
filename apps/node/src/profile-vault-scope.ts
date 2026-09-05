/**
 * EM-P — profile-aware vault note scoping (docs/envoy-home-side-plan.md §1.5,
 * docs/thin-client-protocol-v0.3-draft.md §4, design §5.7.3).
 *
 * The existing vault note RPCs (`createNote`, `importToLibrary`,
 * `deleteVaultItem`, `listLibraryItems`, `listAllLocalFiles`,
 * `readLibraryItemContent`) stay reachable by family (non-owner) sessions but
 * become profile-aware server-side: a family profile may only ever read/write
 * inside its OWN area under the vault root:
 *
 *   <vaultDir>/notes/veda/<sanitizedProfileId>/…
 *
 * Owner sessions (and internal callers without an ALS caller context) keep the
 * exact v0.2 behavior — every helper here is a no-op unless a family profileId
 * is supplied.
 *
 * Pure string/path logic — no file-system access — so it is unit-testable in
 * isolation. Runtime helpers call these with the profileId resolved from
 * `getRpcCaller()` (see node-service-fileshare.ts).
 */
import { createHash } from "node:crypto"
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api"

/**
 * Vault root under which the owner's Veda notes live today
 * (`notes/veda/<uuid>.md`). Family notes nest one level deeper:
 * `notes/veda/<profileId>/<uuid>.md`.
 */
export const PROFILE_VAULT_NOTES_ROOT = "notes/veda"

/** Leading `notes/` vault folder (CreateNoteParams documents notes/<subfolder>/…). */
const VAULT_NOTES_DIR = "notes"

/**
 * Sanitize a family profileId into a safe single path segment.
 *
 * Keeps `[A-Za-z0-9._-]`, collapses every other character run into a single
 * `-`, trims separators from the edges, and caps the length. Never returns an
 * empty (or `.`/`..`) segment — pathological ids fall back to a deterministic
 * `profile-<sha256 prefix>` so the area stays stable across calls without
 * becoming guessable from the raw id.
 */
export function sanitizeProfileId(profileId: string): string {
  const raw = String(profileId ?? "").trim()
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
  if (cleaned && cleaned !== "." && cleaned !== "..") {
    const truncated = cleaned.slice(0, 80)
    // Distinct family ids must never collide on one vault segment: whenever
    // sanitization altered the raw id (or truncated it), append a deterministic
    // digest so e.g. "mom" vs "mom!" map to different areas.
    if (cleaned !== raw || raw.length > 80) {
      const digest = createHash("sha256")
        .update(raw || "unknown-profile")
        .digest("hex")
        .slice(0, 12)
      return `${truncated}-${digest}`
    }
    return truncated
  }
  const digest = createHash("sha256")
    .update(raw || "unknown-profile")
    .digest("hex")
    .slice(0, 12)
  return `profile-${digest}`
}

/** True when `profileId` denotes a non-owner family profile (scope applies). */
export function isFamilyProfileId(profileId: string | undefined): boolean {
  const id = String(profileId ?? "").trim()
  return Boolean(id && id !== OWNER_FAMILY_PROFILE_ID)
}

/**
 * Resolve the family profileId that vault scoping applies to from an RPC
 * caller context. Owner sessions (isOwnerProfile true) and callers without an
 * ALS context (undefined) return undefined → owner behavior, byte-identical.
 */
export function familyProfileIdFromCaller(
  caller: { isOwnerProfile: boolean; profileId: string } | null | undefined,
): string | undefined {
  if (!caller) return undefined
  if (caller.isOwnerProfile === true) return undefined
  const id = String(caller.profileId ?? "").trim()
  return isFamilyProfileId(id) ? id : undefined
}

/** Vault-relative prefix of a profile's own note area (no trailing slash). */
export function profileVaultNotesPrefix(profileId: string): string {
  return `${PROFILE_VAULT_NOTES_ROOT}/${sanitizeProfileId(profileId)}`
}

/** Normalize for checks only — never returned (owner passthrough stays raw). */
function normalizeForCheck(relativePath: string): string {
  return String(relativePath ?? "").replace(/\\/g, "/")
}

/**
 * True when `relativePath` is inside the profile's own area. Owner semantics
 * (empty / `owner` profileId) are unrestricted → always true.
 */
export function isWithinOwnArea(
  relativePath: string,
  profileId: string | undefined,
): boolean {
  if (!isFamilyProfileId(profileId)) return true
  const p = normalizeForCheck(relativePath)
  if (!p || p.startsWith("/") || /^[A-Za-z]:/.test(p)) return false
  const segments = p.split("/")
  if (segments.includes("..")) return false
  const prefix = profileVaultNotesPrefix(profileId as string)
  return p === prefix || p.startsWith(`${prefix}/`)
}

/**
 * Owner passthrough / family guard for caller-supplied vault-relative paths
 * (import/delete/read). When a family profileId is present the path must stay
 * inside the profile's own area; escape attempts (absolute, `..`) and paths
 * into the owner vault or another profile's area throw a clear error.
 */
export function scopeVaultRelativePath(
  relativePath: string,
  profileId: string | undefined,
): string {
  if (!isFamilyProfileId(profileId)) return relativePath
  const p = normalizeForCheck(relativePath)
  if (!p) {
    throw new Error("Invalid vault path")
  }
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) {
    throw new Error("Invalid vault path — absolute paths are not allowed")
  }
  if (p.split("/").includes("..")) {
    throw new Error("Invalid vault path — path traversal is not allowed")
  }
  const prefix = profileVaultNotesPrefix(profileId as string)
  if (p !== prefix && !p.startsWith(`${prefix}/`)) {
    throw new Error(
      `Profile notes are restricted to your own area (${prefix}/) — cannot access ${p}`,
    )
  }
  return relativePath
}

/**
 * Relocate a note destination (built for the owner layout, e.g.
 * `notes/veda/<file>.md` or `notes/<subfolder>/<file>.md`) into the profile's
 * own area for a family caller.
 *
 * A leading `veda` segment (the owner's Veda notes marker) and a leading
 * repeated profileId segment (already-scoped paths round-tripped by the
 * client on edit) are dropped so the nesting is idempotent:
 *
 *   subfolder "veda"        → notes/veda/<P>/<file>.md
 *   subfolder "veda/x"      → notes/veda/<P>/x/<file>.md
 *   subfolder "<P>" (edit)  → notes/veda/<P>/<file>.md  (no double-nesting)
 *   subfolder undefined     → notes/veda/<P>/<file>.md
 */
export function nestVaultNoteUnderOwnArea(
  relativePath: string,
  profileId: string,
): string {
  const prefix = profileVaultNotesPrefix(profileId)
  let rest = normalizeForCheck(relativePath).replace(/^\/+/, "")
  if (rest.startsWith(`${VAULT_NOTES_DIR}/`)) {
    rest = rest.slice(VAULT_NOTES_DIR.length + 1)
  }
  // Drop each leading segment (the veda marker, then a repeated profileId) in
  // order so client round-trips of an already-scoped path stay idempotent.
  for (const drop of [PROFILE_VAULT_NOTES_ROOT.slice("notes/".length), sanitizeProfileId(profileId)]) {
    if (rest === drop) {
      rest = ""
    } else if (rest.startsWith(`${drop}/`)) {
      rest = rest.slice(drop.length + 1)
    }
  }
  const nested = rest ? `${prefix}/${rest}` : prefix
  // Belt: the result must satisfy the area guard (throws on any escape).
  return scopeVaultRelativePath(nested, profileId)
}
