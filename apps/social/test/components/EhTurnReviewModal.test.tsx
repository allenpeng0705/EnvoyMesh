/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhTurnReviewModal } from "../../src/components/ehui/EhTurnReviewModal.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

afterEach(() => cleanup())

describe("EhTurnReviewModal", () => {
  it("renders split diff and per-file actions", () => {
    const onKeepFile = vi.fn()
    const onRevertFile = vi.fn()
    const onKeepAll = vi.fn()
    renderWithI18n(
      <EhTurnReviewModal
        review={{
          turnId: "turn-1",
          checkpointId: "checkpoint-1",
          canRevert: true,
          files: [{
            path: "src/app.ts",
            status: "modified",
            diff: "--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-old\n+new",
            revertible: true,
          }],
        }}
        onClose={() => undefined}
        onKeepAll={onKeepAll}
        onKeepFile={onKeepFile}
        onRevertFile={onRevertFile}
        onRevertAll={() => undefined}
      />,
    )
    expect(screen.getByRole("dialog", { name: /Review changes/i })).toBeDefined()
    expect(screen.getByText("src/app.ts")).toBeDefined()
    expect(document.querySelector(".eh-split-diff")).not.toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /^Keep$/i }))
    expect(onKeepFile).toHaveBeenCalledWith("src/app.ts")
    fireEvent.click(screen.getByRole("button", { name: /^Revert$/i }))
    expect(onRevertFile).toHaveBeenCalledWith("src/app.ts")
    fireEvent.click(screen.getByRole("button", { name: /Keep all/i }))
    expect(onKeepAll).toHaveBeenCalled()
  })
})
