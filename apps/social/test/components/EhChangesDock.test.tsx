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
  it("summarizes changed files and wires review and dismiss", () => {
    const onReview = vi.fn()
    const onDismiss = vi.fn()
    const onRevert = vi.fn()
    renderWithI18n(
      <EhChangesDock
        files={["a.ts", "b.ts", "c.ts", "d.ts"]}
        onReview={onReview}
        onRevert={onRevert}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole("region", { name: /File changes/i })).toBeDefined()
    expect(screen.getByText(/4 file\(s\) changed/)).toBeDefined()
    expect(screen.getByText(/\+1/)).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Review diff/i }))
    expect(onReview).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Revert this turn/i }))
    expect(onRevert).toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /Dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
