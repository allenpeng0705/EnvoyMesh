import { describe, it, expect } from "vitest"
import {
  parseFrontmatter,
  frontmatterString,
  frontmatterBoolean,
  frontmatterStringArray,
  setFrontmatterBoolean,
} from "../src/frontmatter.js"

describe("parseFrontmatter", () => {
  it("returns empty data when no frontmatter", () => {
    const result = parseFrontmatter("# Hello\nWorld")
    expect(result.data).toEqual({})
    expect(result.content).toBe("# Hello\nWorld")
  })

  it("parses basic frontmatter with string value", () => {
    const md = "---\ntitle: My Note\n---\n\nContent here"
    const result = parseFrontmatter(md)
    expect(result.data).toEqual({ title: "My Note" })
    expect(result.content).toBe("Content here")
  })

  it("parses multiple fields", () => {
    const md = "---\ntitle: Test\ndate: 2024-01-15\ncategory: project\n---\n\nBody"
    const result = parseFrontmatter(md)
    expect(result.data.title).toBe("Test")
    expect(result.data.date).toBe("2024-01-15")
    expect(result.data.category).toBe("project")
    expect(result.content).toBe("Body")
  })

  it("parses boolean values", () => {
    const md = "---\npublished: true\ndraft: false\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.published).toBe(true)
    expect(result.data.draft).toBe(false)
  })

  it("parses number values", () => {
    const md = "---\npriority: 5\nweight: 3.14\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.priority).toBe(5)
    expect(result.data.weight).toBe(3.14)
  })

  it("parses inline array", () => {
    const md = "---\ntags: [react, typescript, vite]\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.tags).toEqual(["react", "typescript", "vite"])
  })

  it("parses multiline array", () => {
    const md = "---\ntags:\n  - react\n  - typescript\n  - vite\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.tags).toEqual(["react", "typescript", "vite"])
  })

  it("parses quoted string values", () => {
    const md = `---\ntitle: "My Note"\ndescription: 'A test note'\n---\n\nContent`
    const result = parseFrontmatter(md)
    expect(result.data.title).toBe("My Note")
    expect(result.data.description).toBe("A test note")
  })

  it("handles key with hyphens and spaces", () => {
    const md = "---\nmy-key: value\nmy key: value2\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data["my-key"]).toBe("value")
    expect(result.data["my key"]).toBe("value2")
  })

  it("skips comments and empty lines", () => {
    const md = "---\ntitle: Test\n\n# comment\n\nauthor: Me\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.title).toBe("Test")
    expect(result.data.author).toBe("Me")
    expect(Object.keys(result.data).length).toBe(2)
  })

  it("returns empty data when no closing delimiter", () => {
    const md = "---\ntitle: Test\nNo closing"
    const result = parseFrontmatter(md)
    expect(result.data).toEqual({})
    expect(result.content).toBe(md)
  })

  it("handles CRLF line endings", () => {
    const md = "---\r\ntitle: Test\r\n---\r\n\r\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.title).toBe("Test")
    expect(result.content).toBe("Content")
  })

  it("handles value with colon in string", () => {
    const md = "---\ntime: 10:30 AM\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.time).toBe("10:30 AM")
  })

  it("preserves content after frontmatter including blank lines", () => {
    const md = "---\ntitle: Test\n---\n\n# Header\n\nParagraph"
    const result = parseFrontmatter(md)
    expect(result.content).toBe("# Header\n\nParagraph")
  })

  it("handles empty frontmatter block", () => {
    const md = "---\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data).toEqual({})
    expect(result.content).toBe("Content")
  })

  it("handles array values in both bracket and multiline forms", () => {
    const md = "---\naliases: [alt1, alt2]\ntags:\n  - a\n  - b\n---\n\nContent"
    const result = parseFrontmatter(md)
    expect(result.data.aliases).toEqual(["alt1", "alt2"])
    expect(result.data.tags).toEqual(["a", "b"])
  })
})

describe("frontmatterString", () => {
  it("returns string value", () => {
    expect(frontmatterString({ title: "Hello" }, "title")).toBe("Hello")
  })

  it("returns undefined for missing key", () => {
    expect(frontmatterString({}, "title")).toBeUndefined()
  })

  it("returns undefined for non-string value", () => {
    expect(frontmatterString({ count: 5 }, "count")).toBeUndefined()
  })
})

describe("frontmatterBoolean", () => {
  it("returns boolean value", () => {
    expect(frontmatterBoolean({ published: true }, "published")).toBe(true)
    expect(frontmatterBoolean({ draft: false }, "draft")).toBe(false)
  })

  it("returns undefined for missing key", () => {
    expect(frontmatterBoolean({}, "published")).toBeUndefined()
  })

  it("returns undefined for non-boolean value", () => {
    expect(frontmatterBoolean({ published: "yes" }, "published")).toBeUndefined()
  })
})

describe("frontmatterStringArray", () => {
  it("returns array value", () => {
    expect(frontmatterStringArray({ tags: ["a", "b"] }, "tags")).toEqual(["a", "b"])
  })

  it("returns undefined for missing key", () => {
    expect(frontmatterStringArray({}, "tags")).toBeUndefined()
  })

  it("returns undefined for non-array value", () => {
    expect(frontmatterStringArray({ tags: "single" }, "tags")).toBeUndefined()
  })

  it("returns undefined for mixed-type array", () => {
    expect(frontmatterStringArray({ tags: ["a", 5] }, "tags")).toBeUndefined()
  })
})

describe("setFrontmatterBoolean", () => {
  it("prepends frontmatter when none exists", () => {
    const next = setFrontmatterBoolean("# Hello\n", "published", true)
    expect(next.startsWith("---\npublished: true\n---\n")).toBe(true)
    expect(next).toContain("# Hello")
  })

  it("updates an existing published key", () => {
    const src = `---\ntitle: Note\npublished: false\n---\n\nBody\n`
    const next = setFrontmatterBoolean(src, "published", true)
    expect(next).toContain("published: true")
    expect(next).not.toContain("published: false")
    expect(parseFrontmatter(next).data.published).toBe(true)
  })

  it("appends published when frontmatter lacks the key", () => {
    const src = `---\ntags: [a]\n---\n\nBody\n`
    const next = setFrontmatterBoolean(src, "published", true)
    expect(parseFrontmatter(next).data.published).toBe(true)
    expect(parseFrontmatter(next).data.tags).toEqual(["a"])
  })
})
