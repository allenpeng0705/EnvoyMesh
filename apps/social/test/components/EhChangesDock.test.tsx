/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhChangesDock } from "../../src/components/ehui/EhChangesDock.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhChangesDock", () => {
  it("summarizes changed files and wires review, keep all, and revert", () => {
    const onReview = vi.fn()
    const onKeepAll = vi.fn()
    const onRevert = vi.fn()
    renderWithI18n(
      <EhChangesDock
        files={["a.ts", "b.ts", "c.ts", "d.ts"]}
        onReview={onReview}
        onRevert={onRevert}
        onKeepAll={onKeepAll}
      />,
    )

    expect(screen.getByRole("region", { name: /File changes/i })).toBeDefined()
    expect(screen.getByText(/4 file\(s\) changed/)).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Review changes/i }))
    expect(onReview).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Revert all/i }))
    expect(onRevert).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Keep all/i }))
    expect(onKeepAll).toHaveBeenCalled()
  })

  it("opens review for a specific file from the list", () => {
    const onReviewFile = vi.fn()
    renderWithI18n(
      <EhChangesDock
        files={["src/a.ts", "src/b.ts"]}
        onReviewFile={onReviewFile}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /src\/a\.ts/i }))
    expect(onReviewFile).toHaveBeenCalledWith("src/a.ts")
  })
})
