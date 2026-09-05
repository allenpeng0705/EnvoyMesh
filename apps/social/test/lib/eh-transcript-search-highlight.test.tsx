/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SearchHighlightedText } from "../../src/lib/eh-transcript-search-highlight.js"

afterEach(() => cleanup())

describe("SearchHighlightedText", () => {
  it("wraps matches in mark elements", () => {
    render(
      <SearchHighlightedText text="hello world hello" query="hello" active={false} />,
    )
    const marks = document.querySelectorAll(".eh-transcript-highlight")
    expect(marks).toHaveLength(2)
    expect(marks[0]?.textContent).toBe("hello")
  })

  it("marks the active match class when active", () => {
    render(<SearchHighlightedText text="find me" query="me" active />)
    expect(document.querySelector(".eh-transcript-highlight--active")).not.toBeNull()
  })

  it("returns plain text when query is empty", () => {
    render(<SearchHighlightedText text="plain" query="" />)
    expect(screen.getByText("plain").textContent).toBe("plain")
    expect(document.querySelector("mark")).toBeNull()
  })
})
