/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhContextStrip } from "../../src/components/ehui/EhContextStrip.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhContextStrip", () => {
  it("renders file chips with remove on attached paths (project lives in the header)", () => {
    const onRemoveAttached = vi.fn()
    renderWithI18n(
      <EhContextStrip
        files={["src/main.ts", "notes.md"]}
        attachedPaths={["notes.md"]}
        onRemoveAttached={onRemoveAttached}
      />,
    )

    expect(screen.getByRole("region", { name: /Context/i })).toBeDefined()
    expect(screen.queryByText(/Project/)).toBeNull()
    expect(screen.getByText("main.ts")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Remove notes\.md/i }))
    expect(onRemoveAttached).toHaveBeenCalledWith("notes.md")
  })
})
