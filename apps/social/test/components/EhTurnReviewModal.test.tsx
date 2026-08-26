/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhTurnReviewModal } from "../../src/components/ehui/EhTurnReviewModal.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhTurnReviewModal", () => {
  it("renders the exact turn diff and exposes safe actions", () => {
    const onClose = vi.fn()
    const onRevert = vi.fn()
    const onOpenFile = vi.fn()
    renderWithI18n(
      <EhTurnReviewModal
        review={{
          turnId: "turn-1",
          checkpointId: "checkpoint-1",
          canRevert: true,
          files: [{ path: "src/app.ts", status: "modified", diff: "-old\n+new" }],
        }}
        onClose={onClose}
        onRevert={onRevert}
        onOpenFile={onOpenFile}
      />,
    )
    expect(screen.getByRole("dialog", { name: /Review this turn/i })).toBeDefined()
    expect(screen.getByText("src/app.ts")).toBeDefined()
    expect(screen.getByText(/-old/)).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /Open file/i }))
    expect(onOpenFile).toHaveBeenCalledWith("src/app.ts")
    fireEvent.click(screen.getByRole("button", { name: /Revert this turn/i }))
    expect(onRevert).toHaveBeenCalledOnce()
  })
})
