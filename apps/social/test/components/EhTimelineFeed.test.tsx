/** @vitest-environment jsdom */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { EhTimelineFeed } from "../../src/components/ehui/EhTimelineFeed.js"

afterEach(() => cleanup())

describe("EhTimelineFeed turn actions", () => {
  it("routes a restored change card to its exact turn", () => {
    const onReviewTurn = vi.fn()
    const onRevertTurn = vi.fn()
    render(<EhTimelineFeed items={[{
      id: "turn:turn-7:changes",
      chatId: "chat-1",
      turnId: "turn-7",
      type: "changes",
      files: ["src/app.ts"],
      createdAt: "2026-08-25T00:00:00.000Z",
    }]} onReviewTurn={onReviewTurn} onRevertTurn={onRevertTurn} />)
    fireEvent.click(screen.getByRole("button", { name: /Review changes/i }))
    fireEvent.click(screen.getByRole("button", { name: /Revert all/i }))
    expect(onReviewTurn).toHaveBeenCalledWith("turn-7")
    expect(onRevertTurn).toHaveBeenCalledWith("turn-7")
  })
})
