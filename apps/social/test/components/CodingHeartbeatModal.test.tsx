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
    expect(screen.getByTestId("coding-heartbeat-cron-preview").textContent).toMatch(
      /Every 5 minutes/i,
    )
    fireEvent.click(screen.getByTestId("coding-heartbeat-save"))

    expect(onSave).toHaveBeenCalledTimes(1)
    const input = onSave.mock.calls[0]![0]
    expect(input.cron).toBe("*/5 * * * *")
    expect(input.target).toEqual({ kind: "eh", chatId: "chat-1" })
    expect(input.enabled).toBe(true)
    expect(String(input.prompt).length).toBeGreaterThan(0)
  })

  it("builds custom interval without raw cron typing", () => {
    const onSave = vi.fn()
    renderWithI18n(
      <CodingHeartbeatModal
        workspaceTitle="Demo"
        target={{ kind: "pi", sessionId: "pi-1" }}
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByTestId("coding-heartbeat-preset-custom"))
    expect(screen.getByTestId("coding-heartbeat-custom-interval")).toBeTruthy()
    fireEvent.change(screen.getByTestId("coding-heartbeat-custom-amount"), {
      target: { value: "20" },
    })
    fireEvent.change(screen.getByTestId("coding-heartbeat-custom-unit"), {
      target: { value: "minutes" },
    })
    expect(screen.getByTestId("coding-heartbeat-cron")).toHaveProperty(
      "value",
      "*/20 * * * *",
    )
    fireEvent.click(screen.getByTestId("coding-heartbeat-save"))
    expect(onSave.mock.calls[0]![0].cron).toBe("*/20 * * * *")
  })
})
