/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhInputQueue } from "../../src/components/ehui/EhInputQueue.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhInputQueue", () => {
  it("renders nothing when queue is empty", () => {
    const { container } = renderWithI18n(
      <EhInputQueue items={[]} onUpdate={() => {}} onRemove={() => {}} />,
    )
    expect(container.querySelector(".eh-input-queue")).toBeNull()
  })

  it("lists queued items and supports edit, remove, and clear", () => {
    const onUpdate = vi.fn()
    const onRemove = vi.fn()
    const onClear = vi.fn()
    renderWithI18n(
      <EhInputQueue
        items={[
          { id: "q1", text: "first" },
          { id: "q2", text: "second" },
        ]}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onClear={onClear}
      />,
    )

    expect(screen.getByRole("region", { name: /Queued messages/i })).toBeDefined()
    expect(screen.getByText(/Queued \(2\)/)).toBeDefined()

    fireEvent.change(screen.getByDisplayValue("first"), {
      target: { value: "first edited" },
    })
    expect(onUpdate).toHaveBeenCalledWith("q1", "first edited")

    fireEvent.click(screen.getAllByRole("button", { name: /Remove from queue/i })[0])
    expect(onRemove).toHaveBeenCalledWith("q1")

    fireEvent.click(screen.getByRole("button", { name: /Clear all/i }))
    expect(onClear).toHaveBeenCalled()
  })
})
