/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { CodingHeartbeatModal } from "../../src/components/CodingHeartbeatModal.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

describe("CodingHeartbeatModal (Phase 68-C6)", () => {
  afterEach(() => cleanup())

  it("saves with preset cron and target", () => {
    const onSave = vi.fn()
    renderWithI18n(
      <CodingHeartbeatModal
        workspaceTitle="Demo"
        target={{ kind: "eh", chatId: "chat-1" }}
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    expect(screen.getByTestId("coding-heartbeat-modal")).toBeTruthy()
    fireEvent.click(screen.getByTestId("coding-heartbeat-preset-5m"))
    fireEvent.click(screen.getByTestId("coding-heartbeat-save"))

    expect(onSave).toHaveBeenCalledTimes(1)
    const input = onSave.mock.calls[0]![0]
    expect(input.cron).toBe("*/5 * * * *")
    expect(input.target).toEqual({ kind: "eh", chatId: "chat-1" })
    expect(input.enabled).toBe(true)
    expect(String(input.prompt).length).toBeGreaterThan(0)
  })
})
