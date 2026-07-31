import { describe, expect, it } from "vitest"
import {
  familyThreadKey,
  isFamilyThreadKey,
  parseFamilyThreadKey,
  threadVisibleTo,
  OWNER_FAMILY_PROFILE_ID,
  slugifyFamilyProfileId,
} from "../src/family-profile.js"

describe("familyThreadKey", () => {
  it("sorts profile ids stably", () => {
    expect(familyThreadKey("mom", "dad")).toBe("family:dad:mom")
    expect(familyThreadKey("dad", "mom")).toBe("family:dad:mom")
    expect(isFamilyThreadKey("family:dad:mom")).toBe(true)
    expect(parseFamilyThreadKey("family:dad:mom")).toEqual({
      profileIdA: "dad",
      profileIdB: "mom",
    })
  })

  it("rejects invalid pairs", () => {
    expect(() => familyThreadKey("dad", "dad")).toThrow()
    expect(parseFamilyThreadKey("family:only")).toBeNull()
  })
})

describe("threadVisibleTo", () => {
  it("allows family DM for both members", () => {
    const key = familyThreadKey("dad", "mom")
    expect(threadVisibleTo(key, "dad")).toBe(true)
    expect(threadVisibleTo(key, "mom")).toBe(true)
    expect(threadVisibleTo(key, "alex")).toBe(false)
  })

  it("scopes AI / bot / bridge threads by profile suffix", () => {
    expect(threadVisibleTo("__envoy_ai__:mom", "mom")).toBe(true)
    expect(threadVisibleTo("__envoy_ai__:mom", "dad")).toBe(false)
    expect(threadVisibleTo("bot:luna:mom", "mom")).toBe(true)
    expect(threadVisibleTo("bridge:pi:alex", "alex")).toBe(true)
    expect(threadVisibleTo("__envoy_ai__", OWNER_FAMILY_PROFILE_ID)).toBe(true)
    expect(threadVisibleTo("__envoy_ai__", "mom")).toBe(false)
    // Legacy bare bot key → owner only
    expect(threadVisibleTo("bot:luna", OWNER_FAMILY_PROFILE_ID)).toBe(true)
    expect(threadVisibleTo("bot:luna", "mom")).toBe(false)
  })
})

describe("slugifyFamilyProfileId", () => {
  it("slugifies display names", () => {
    expect(slugifyFamilyProfileId("Chef Marco!")).toBe("chef-marco")
    expect(slugifyFamilyProfileId("   ")).toBe("member")
  })
})
