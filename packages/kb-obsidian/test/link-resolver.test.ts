import { describe, it, expect } from "vitest"
import {
  isAccessible,
  resolveLinksWithSensitivity,
  resolveBacklinksWithSensitivity,
  filterContentLinks,
  traverseLinks,
  type SensitivityLevel,
  type NoteSensitivityMap,
  type LinkGraph,
} from "../src/link-resolver.js"
import { buildLinkGraph } from "../src/wiki-links.js"

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOTES = new Map([
  [
    "Public Note",
    "---\npublished: true\n---\nSee [[Friends Note]] and [[Private Note]] and [[Another Public]]",
  ],
  [
    "Friends Note",
    "---\ntags: [internal]\n---\nSee [[Public Note]] and [[Private Note]]",
  ],
  [
    "Private Note",
    "---\npublished: false\n---\nSee [[Public Note]]",
  ],
  [
    "Another Public",
    "---\npublished: true\n---\nSee [[Public Note]] and [[Deep Friend]]",
  ],
  [
    "Deep Friend",
    "---\ntags: [internal]\n---\nSee [[Private Note]]",
  ],
])

const GRAPH: LinkGraph = buildLinkGraph(NOTES)

const SENSITIVITY: NoteSensitivityMap = new Map<SensitivityLevel>([
  ["Public Note", "public"],
  ["Another Public", "public"],
  ["Friends Note", "friends"],
  ["Deep Friend", "friends"],
  ["Private Note", "private"],
])

describe("isAccessible", () => {
  it("public is accessible from all levels", () => {
    expect(isAccessible("public", "public")).toBe(true)
    expect(isAccessible("public", "friends")).toBe(true)
    expect(isAccessible("public", "private")).toBe(true)
  })

  it("friends is accessible from friends and private", () => {
    expect(isAccessible("friends", "public")).toBe(false)
    expect(isAccessible("friends", "friends")).toBe(true)
    expect(isAccessible("friends", "private")).toBe(true)
  })

  it("private is only accessible from private", () => {
    expect(isAccessible("private", "public")).toBe(false)
    expect(isAccessible("private", "friends")).toBe(false)
    expect(isAccessible("private", "private")).toBe(true)
  })
})

describe("resolveLinksWithSensitivity", () => {
  it("public access sees only public links", () => {
    // Public Note links to Friends Note, Private Note, Another Public
    // Public access: Friends Note (friends → not accessible), Private Note (private → not), Another Public (public → yes)
    const links = resolveLinksWithSensitivity("Public Note", GRAPH, SENSITIVITY, "public")
    expect(links).toEqual(["Another Public"])
  })

  it("friends access sees public + friends links", () => {
    const links = resolveLinksWithSensitivity("Public Note", GRAPH, SENSITIVITY, "friends")
    // Friends Note (friends) and Another Public (public) are accessible
    expect(links).toContain("Friends Note")
    expect(links).toContain("Another Public")
    expect(links).not.toContain("Private Note")
  })

  it("private access sees all links", () => {
    const links = resolveLinksWithSensitivity("Public Note", GRAPH, SENSITIVITY, "private")
    expect(links).toContain("Friends Note")
    expect(links).toContain("Private Note")
    expect(links).toContain("Another Public")
  })

  it("returns empty for unknown note", () => {
    expect(resolveLinksWithSensitivity("Unknown", GRAPH, SENSITIVITY, "public")).toEqual([])
  })
})

describe("resolveBacklinksWithSensitivity", () => {
  it("public access filters backlinks from non-public sources", () => {
    // Another Public has incoming from Public Note (public) — visible at public
    const backlinks = resolveBacklinksWithSensitivity("Another Public", GRAPH, SENSITIVITY, "public")
    expect(backlinks).toContain("Public Note")
    expect(backlinks).not.toContain("Friends Note")
  })

  it("friends access sees backlinks from friends notes too", () => {
    const backlinks = resolveBacklinksWithSensitivity("Public Note", GRAPH, SENSITIVITY, "friends")
    // Incoming to Public Note: Friends Note, Private Note, Another Public
    // At friends level: Friends Note (friends ✓), Another Public (public ✓), Private Note (private ✗)
    expect(backlinks).toContain("Friends Note")
    expect(backlinks).toContain("Another Public")
    expect(backlinks).not.toContain("Private Note")
  })
})

describe("filterContentLinks", () => {
  it("strips private links from content for public access", () => {
    const md = "See [[Friends Note]] and [[Private Note]] and [[Another Public]]"
    const result = filterContentLinks(md, GRAPH, SENSITIVITY, "public")
    expect(result).toBe("See Friends Note and Private Note and [[Another Public]]")
  })

  it("keeps friends links for friends access", () => {
    const md = "See [[Friends Note]] and [[Private Note]]"
    const result = filterContentLinks(md, GRAPH, SENSITIVITY, "friends")
    expect(result).toBe("See [[Friends Note]] and Private Note")
  })

  it("keeps all links for private access", () => {
    const md = "[[Friends Note]] and [[Private Note]]"
    const result = filterContentLinks(md, GRAPH, SENSITIVITY, "private")
    expect(result).toBe(md)
  })

  it("returns unchanged content when no links", () => {
    const md = "No links here"
    expect(filterContentLinks(md, GRAPH, SENSITIVITY, "public")).toBe("No links here")
  })
})

describe("traverseLinks", () => {
  it("traverses links within sensitivity bound", () => {
    // Starting from Public Note with public access:
    // Public Note → Another Public (public, accessible)
    // Another Public → Public Note (already visited), Deep Friend (friends, not accessible at public)
    const reachable = traverseLinks("Public Note", GRAPH, SENSITIVITY, "public", 3)
    expect(reachable).toContain("Public Note")
    expect(reachable).toContain("Another Public")
    expect(reachable).not.toContain("Friends Note")
    expect(reachable).not.toContain("Private Note")
    expect(reachable).not.toContain("Deep Friend")
  })

  it("traverses links at friends level", () => {
    const reachable = traverseLinks("Public Note", GRAPH, SENSITIVITY, "friends", 3)
    expect(reachable).toContain("Public Note")
    expect(reachable).toContain("Another Public")
    expect(reachable).toContain("Friends Note")
    expect(reachable).toContain("Deep Friend")
    expect(reachable).not.toContain("Private Note")
  })

  it("respects maxDepth", () => {
    // At depth 1 from Public Note: only direct outgoing links that are accessible
    const reachable = traverseLinks("Public Note", GRAPH, SENSITIVITY, "friends", 1)
    expect(reachable).toContain("Public Note")
    // Direct outgoing: Friends Note (friends ✓), Private Note (private ✗), Another Public (public ✓)
    expect(reachable).toContain("Friends Note")
    expect(reachable).toContain("Another Public")
    expect(reachable).not.toContain("Deep Friend") // depth 2
    expect(reachable).not.toContain("Private Note")
  })

  it("handles start note not in graph", () => {
    const reachable = traverseLinks("Unknown", GRAPH, SENSITIVITY, "public")
    expect(reachable.size).toBe(0)
  })

  it("handles start note above sensitivity", () => {
    // Starting from Private Note with public access — note itself isn't accessible
    const reachable = traverseLinks("Private Note", GRAPH, SENSITIVITY, "public")
    expect(reachable.size).toBe(0)
  })
})
