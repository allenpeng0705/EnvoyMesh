/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, act } from "@testing-library/react"

import { EhStillWorkingIndicator } from "../../src/components/ehui/EhStillWorkingIndicator.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhStillWorkingIndicator", () => {
  it("shows cancel button and invokes onCancel when clicked", () => {
    const onCancel = vi.fn()
    renderWithI18n(
      <EhStillWorkingIndicator active={true} onCancel={onCancel} />,
    )

    expect(screen.getByText(/Thinking/i)).toBeDefined()
    const cancelBtn = screen.getByRole("button", { name: /Cancel/i })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("upgrades to still-working label after delay", () => {
    vi.useFakeTimers()
    renderWithI18n(<EhStillWorkingIndicator active={true} />)
    expect(screen.getByText(/Thinking/i)).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(8_000)
    })
    expect(screen.getByText(/Still working/)).toBeDefined()
  })

  it("hides when not active", () => {
    renderWithI18n(
      <EhStillWorkingIndicator active={false} onCancel={() => {}} />,
    )
    expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull()
  })
})
