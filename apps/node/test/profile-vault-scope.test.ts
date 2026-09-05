/**
 * EM-P — unit tests for the profile-vault scoping helpers
 * (apps/node/src/profile-vault-scope.ts).
 */
import { describe, expect, it } from "vitest"
import {
  familyProfileIdFromCaller,
  isFamilyProfileId,
  isWithinOwnArea,
  nestVaultNoteUnderOwnArea,
  profileVaultNotesPrefix,
  sanitizeProfileId,
  scopeVaultRelativePath,
} from "../src/profile-vault-scope.js"

describe("sanitizeProfileId", () => {
  it("keeps safe profile ids unchanged", () => {
    expect(sanitizeProfileId("mom")).toBe("mom")
    expect(sanitizeProfileId("dad")).toBe("dad")
    expect(sanitizeProfileId("sue-jane-3f9a2c1b")).toBe("sue-jane-3f9a2c1b")
    expect(sanitizeProfileId("a.b_c")).toBe("a.b_c")
  })

  it("collapses disallowed characters into single dashes", () => {
    expect(sanitizeProfileId("my profile!")).toBe("my-profile")
    expect(sanitizeProfileId("  spaced   out  ")).toBe("spaced-out")
    expect(sanitizeProfileId("mom & dad")).toBe("mom-dad")
  })

  it("never returns an empty, dot, or dot-dot segment", () => {
    for (const input of ["", "   ", "***", "😀😀", "..", "."]) {
      const out = sanitizeProfileId(input)
      expect(out).not.toBe("")
      expect(out).not.toBe(".")
      expect(out).not.toBe("..")
      expect(out).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })

  it("is deterministic for the same (even hostile) input", () => {
    expect(sanitizeProfileId("")).toBe(sanitizeProfileId(""))
    expect(sanitizeProfileId("***")).toBe(sanitizeProfileId("***"))
    expect(sanitizeProfileId("***")).not.toBe(sanitizeProfileId("@@@"))
  })
})

describe("isFamilyProfileId / familyProfileIdFromCaller", () => {
  it("treats owner ids and empties as not-family", () => {
    expect(isFamilyProfileId(undefined)).toBe(false)
    expect(isFamilyProfileId("")).toBe(false)
    expect(isFamilyProfileId("owner")).toBe(false)
    expect(isFamilyProfileId("  owner  ")).toBe(false)
  })

  it("treats real family profile ids as family", () => {
    expect(isFamilyProfileId("mom")).toBe(true)
    expect(isFamilyProfileId("sue-jane")).toBe(true)
  })

  it("decodes owner / no-caller contexts as unscoped", () => {
    expect(familyProfileIdFromCaller(undefined)).toBeUndefined()
    expect(
      familyProfileIdFromCaller({ isOwnerProfile: true, profileId: "owner" }),
    ).toBeUndefined()
  })

  it("decodes a family session to its profileId", () => {
    expect(
      familyProfileIdFromCaller({ isOwnerProfile: false, profileId: "mom" }),
    ).toBe("mom")
    // Degenerate family context with no id → no scoping rather than mis-scoping.
    expect(
      familyProfileIdFromCaller({ isOwnerProfile: false, profileId: "" }),
    ).toBeUndefined()
  })
})

describe("profileVaultNotesPrefix", () => {
  it("nests the sanitized profile under notes/veda", () => {
    expect(profileVaultNotesPrefix("mom")).toBe("notes/veda/mom")
    expect(profileVaultNotesPrefix("sue jane")).toBe("notes/veda/sue-jane")
  })
})

describe("isWithinOwnArea", () => {
  const OWNER_ITEM = "notes/veda/secret.md"
  const MY_ITEM = "notes/veda/mom/note.md"
  const SIBLING_ITEM = "notes/veda/dad/note.md"

  it("is unrestricted for owner / no profile", () => {
    expect(isWithinOwnArea(OWNER_ITEM, undefined)).toBe(true)
    expect(isWithinOwnArea("anything/at/all.md", "owner")).toBe(true)
  })

  it("accepts the profile's own area and rejects others", () => {
    expect(isWithinOwnArea(MY_ITEM, "mom")).toBe(true)
    expect(isWithinOwnArea("notes/veda/mom", "mom")).toBe(true)
    expect(isWithinOwnArea(OWNER_ITEM, "mom")).toBe(false)
    expect(isWithinOwnArea(SIBLING_ITEM, "mom")).toBe(false)
    expect(isWithinOwnArea("notes/imports/blog/x.md", "mom")).toBe(false)
  })

  it("rejects traversal and absolute forms", () => {
    expect(isWithinOwnArea("../mom/note.md", "mom")).toBe(false)
    expect(isWithinOwnArea("notes/veda/mom/../../owner.md", "mom")).toBe(false)
    expect(isWithinOwnArea("/notes/veda/mom/a.md", "mom")).toBe(false)
    expect(isWithinOwnArea("C:/notes/veda/mom/a.md", "mom")).toBe(false)
  })
})

describe("scopeVaultRelativePath", () => {
  it("returns the path unchanged for owner / no profile", () => {
    const p = "notes/veda/x.md"
    expect(scopeVaultRelativePath(p, undefined)).toBe(p)
    expect(scopeVaultRelativePath(p, "owner")).toBe(p)
  })

  it("passes family paths inside the own area through unchanged", () => {
    const p = "notes/veda/mom/x.md"
    expect(scopeVaultRelativePath(p, "mom")).toBe(p)
  })

  it("throws for family paths outside the own area", () => {
    expect(() => scopeVaultRelativePath("notes/hello.md", "mom")).toThrow(/restricted to your own area/)
    expect(() => scopeVaultRelativePath("notes/veda/dad/x.md", "mom")).toThrow(/restricted to your own area/)
  })

  it("throws for traversal / absolute paths", () => {
    expect(() => scopeVaultRelativePath("../x.md", "mom")).toThrow(/traversal/)
    expect(() => scopeVaultRelativePath("notes/veda/mom/../../x.md", "mom")).toThrow(/traversal/)
    expect(() => scopeVaultRelativePath("/notes/veda/mom/x.md", "mom")).toThrow(/absolute/)
    expect(() => scopeVaultRelativePath("", "mom")).toThrow(/Invalid vault path/)
  })
})

describe("nestVaultNoteUnderOwnArea", () => {
  it("nests a veda-marked note into the profile area", () => {
    expect(nestVaultNoteUnderOwnArea("notes/veda/uuid.md", "mom")).toBe("notes/veda/mom/uuid.md")
    expect(nestVaultNoteUnderOwnArea("notes/veda/journal/uuid.md", "mom")).toBe(
      "notes/veda/mom/journal/uuid.md",
    )
  })

  it("nests notes without a subfolder into the profile area", () => {
    expect(nestVaultNoteUnderOwnArea("notes/uuid.md", "mom")).toBe("notes/veda/mom/uuid.md")
    expect(nestVaultNoteUnderOwnArea("notes/projects/uuid.md", "mom")).toBe(
      "notes/veda/mom/projects/uuid.md",
    )
  })

  it("is idempotent for already-scoped round-trip paths (client edit)", () => {
    expect(nestVaultNoteUnderOwnArea("notes/veda/mom/uuid.md", "mom")).toBe(
      "notes/veda/mom/uuid.md",
    )
    expect(nestVaultNoteUnderOwnArea("notes/veda/mom/journal/uuid.md", "mom")).toBe(
      "notes/veda/mom/journal/uuid.md",
    )
  })
})
