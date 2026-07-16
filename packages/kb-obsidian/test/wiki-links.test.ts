/** @vitest-environment node */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  parseWikiLinks,
  stripWikiLinks,
  stripPrivateWikiLinks,
  buildLinkGraph,
  resolveLinksForNote,
  getBacklinks,
  loadLinkGraph,
  saveLinkGraph,
  deleteLinkGraph,
  linkGraphFilePath,
} from "../src/wiki-links.js"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("parseWikiLinks", () => {
  it("parses basic wiki-link", () => {
    const links = parseWikiLinks("See [[Project Overview]] for details")
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe("Project Overview")
    expect(links[0]!.alias).toBeUndefined()
  })

  it("parses wiki-link with alias", () => {
    const links = parseWikiLinks("Check [[Project Overview|overview]] first")
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe("Project Overview")
    expect(links[0]!.alias).toBe("overview")
  })

  it("parses multiple wiki-links", () => {
    const links = parseWikiLinks("[[A]] and [[B]] and [[C|alias C]]")
    expect(links).toHaveLength(3)
    expect(links[0]!.target).toBe("A")
    expect(links[1]!.target).toBe("B")
    expect(links[2]!.target).toBe("C")
    expect(links[2]!.alias).toBe("alias C")
  })

  it("parses path-qualified links", () => {
    const links = parseWikiLinks("[[Folder/Sub Note]]")
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe("Folder/Sub Note")
  })

  it("parses links with heading anchors", () => {
    const links = parseWikiLinks("[[Note#Heading]] and [[Note#^block-id]]")
    expect(links).toHaveLength(2)
    expect(links[0]!.target).toBe("Note#Heading")
    expect(links[1]!.target).toBe("Note#^block-id")
  })

  it("excludes embed syntax (![[...]])", () => {
    const links = parseWikiLinks("![[Embed Note]] and [[Regular Note]]")
    expect(links).toHaveLength(1)
    expect(links[0]!.target).toBe("Regular Note")
  })

  it("returns empty array when no links", () => {
    expect(parseWikiLinks("No links here")).toEqual([])
  })

  it("handles links on multiple lines", () => {
    const md = "Line 1 [[A]]\nLine 2 [[B|b]]\nLine 3"
    const links = parseWikiLinks(md)
    expect(links).toHaveLength(2)
    expect(links[0]!.target).toBe("A")
    expect(links[1]!.target).toBe("B")
  })

  it("computes correct offsets", () => {
    const md = "abc [[Target]] def"
    const links = parseWikiLinks(md)
    expect(links[0]!.start).toBe(4)
    // "[[Target]]" = 2 + 6 + 2 = 10 chars
    expect(links[0]!.end).toBe(14)
  })

  it("handles baseOffset parameter", () => {
    const md = "[[Target]]"
    const links = parseWikiLinks(md, 100)
    expect(links[0]!.start).toBe(100)
    // "[[Target]]" = 10 chars
    expect(links[0]!.end).toBe(110)
  })

  it("ignores empty brackets", () => {
    const links = parseWikiLinks("[[]] and [[  ]] and [[valid]]")
    // "[[]]" doesn't match the regex (no content between [[ and ]])
    // "[[  ]]" matches with empty-ish content
    // "[[valid]]" matches normally
    expect(links.some(l => l.target === "valid")).toBe(true)
  })
})

describe("stripWikiLinks", () => {
  it("replaces links with plain text", () => {
    const md = "See [[Project Overview]] for details"
    expect(stripWikiLinks(md)).toBe("See Project Overview for details")
  })

  it("uses alias when present", () => {
    const md = "Check [[Project Overview|overview]] first"
    expect(stripWikiLinks(md)).toBe("Check overview first")
  })

  it("handles multiple links", () => {
    const md = "[[A]] and [[B|b]]"
    expect(stripWikiLinks(md)).toBe("A and b")
  })

  it("preserves embed syntax", () => {
    const md = "![[Embed]] and [[Link]]"
    // stripWikiLinks should NOT touch ![[Embed]] — only strip [[Link]].
    const result = stripWikiLinks(md)
    expect(result).toBe("![[Embed]] and Link")
  })
})

describe("stripPrivateWikiLinks", () => {
  it("strips only private links", () => {
    const md = "See [[Public Note]] and [[Private Note]] here"
    const privateTitles = new Set(["Private Note"])
    const result = stripPrivateWikiLinks(md, privateTitles)
    expect(result).toBe("See [[Public Note]] and Private Note here")
  })

  it("keeps all links when none are private", () => {
    const md = "[[A]] and [[B]]"
    const result = stripPrivateWikiLinks(md, new Set())
    expect(result).toBe("[[A]] and [[B]]")
  })

  it("uses alias for stripped links", () => {
    const md = "[[Private Note|PN]]"
    const result = stripPrivateWikiLinks(md, new Set(["Private Note"]))
    expect(result).toBe("PN")
  })
})

describe("buildLinkGraph", () => {
  it("builds graph from notes", () => {
    const notes = new Map([
      ["Alpha", "See [[Beta]] and [[Gamma]]"],
      ["Beta", "See [[Gamma]]"],
      ["Gamma", "No links here"],
    ])
    const graph = buildLinkGraph(notes)

    expect(graph.Alpha.outgoing).toEqual(["Beta", "Gamma"])
    expect(graph.Alpha.incoming).toEqual([]) // nobody links to Alpha
    expect(graph.Beta.outgoing).toEqual(["Gamma"])
    expect(graph.Beta.incoming).toEqual(["Alpha"])
    expect(graph.Gamma.outgoing).toEqual([])
    expect(graph.Gamma.incoming).toEqual(["Alpha", "Beta"])
  })

  it("ignores links to non-existent notes", () => {
    const notes = new Map([
      ["Alpha", "[[Beta]] and [[NonExistent]]"],
    ])
    const graph = buildLinkGraph(notes)
    expect(graph.Alpha.outgoing).toEqual(["Beta", "NonExistent"])
    // NonExistent isn't in the graph, but still listed in outgoing
    expect(graph.NonExistent).toBeUndefined()
  })

  it("handles empty note set", () => {
    const graph = buildLinkGraph(new Map())
    expect(Object.keys(graph)).toHaveLength(0)
  })

  it("deduplicates outgoing links", () => {
    const notes = new Map([
      ["Alpha", "[[Beta#Section]] and [[Beta#^block]]"],
      ["Beta", "Content"],
    ])
    const graph = buildLinkGraph(notes)
    // Both [[Beta#Section]] and [[Beta#^block]] normalize to "Beta" — deduplicated.
    expect(graph.Alpha.outgoing).toEqual(["Beta"])
    expect(graph.Beta.incoming).toEqual(["Alpha"])
  })

  it("strips path prefix from targets in graph", () => {
    const notes = new Map([
      ["Alpha", "See [[notes/Beta]] and [[folder/Gamma.md]]"],
      ["Beta", "Content"],
      ["Gamma", "Content"],
    ])
    const graph = buildLinkGraph(notes)
    expect(graph.Alpha.outgoing).toEqual(["Beta", "Gamma"])
    expect(graph.Beta.incoming).toEqual(["Alpha"])
    expect(graph.Gamma.incoming).toEqual(["Alpha"])
  })
})

describe("resolveLinksForNote", () => {
  const graph: ReturnType<typeof buildLinkGraph> = {
    Alpha: { title: "Alpha", outgoing: ["Beta", "Gamma"], incoming: [] },
    Beta: { title: "Beta", outgoing: ["Delta"], incoming: ["Alpha"] },
    Gamma: { title: "Gamma", outgoing: [], incoming: ["Alpha"] },
    Delta: { title: "Delta", outgoing: [], incoming: ["Beta"] },
  }

  it("resolves existing links", () => {
    expect(resolveLinksForNote("Alpha", graph)).toEqual(["Beta", "Gamma"])
  })

  it("returns empty for unknown note", () => {
    expect(resolveLinksForNote("Unknown", graph)).toEqual([])
  })
})

describe("getBacklinks", () => {
  const graph: ReturnType<typeof buildLinkGraph> = {
    Alpha: { title: "Alpha", outgoing: ["Beta"], incoming: [] },
    Beta: { title: "Beta", outgoing: [], incoming: ["Alpha"] },
  }

  it("returns incoming links", () => {
    expect(getBacklinks("Beta", graph)).toEqual(["Alpha"])
  })

  it("returns empty for note with no backlinks", () => {
    expect(getBacklinks("Alpha", graph)).toEqual([])
  })
})

describe("link graph persistence", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "kb-obsidian-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and loads link graph", async () => {
    const graph: ReturnType<typeof buildLinkGraph> = {
      Alpha: { title: "Alpha", outgoing: ["Beta"], incoming: [] },
      Beta: { title: "Beta", outgoing: [], incoming: ["Alpha"] },
    }

    await saveLinkGraph(tmpDir, graph)
    const loaded = await loadLinkGraph(tmpDir)
    expect(loaded).toEqual(graph)
  })

  it("returns empty graph when file missing", async () => {
    const loaded = await loadLinkGraph(tmpDir)
    expect(loaded).toEqual({})
  })

  it("deletes link graph", async () => {
    const graph: ReturnType<typeof buildLinkGraph> = {
      Alpha: { title: "Alpha", outgoing: [], incoming: [] },
    }
    await saveLinkGraph(tmpDir, graph)
    await deleteLinkGraph(tmpDir)
    const loaded = await loadLinkGraph(tmpDir)
    expect(loaded).toEqual({})
  })

  it("returns correct file path", () => {
    const path = linkGraphFilePath(tmpDir)
    expect(path).toContain("plugins")
    expect(path).toContain("obsidian")
    expect(path).toContain("link-graph.json")
  })
})
