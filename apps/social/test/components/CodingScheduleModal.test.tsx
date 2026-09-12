/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"
import { CodingScheduleModal } from "../../src/components/CodingScheduleModal.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

describe("CodingScheduleModal (Phase 68-C7)", () => {
  afterEach(() => cleanup())

  it("saves with preset cron, project, and harness", () => {
    const onSave = vi.fn()
    renderWithI18n(
      <CodingScheduleModal
        projects={[
          {
            path: "/projects/demo",
            label: "demo",
            addedAt: "2026-01-01T00:00:00.000Z",
          },
        ]}
        onCancel={() => {}}
        onSave={onSave}
      />,
    )

    expect(screen.getByTestId("coding-schedule-modal")).toBeTruthy()
    fireEvent.click(screen.getByTestId("coding-schedule-preset-5m"))
    fireEvent.change(screen.getByTestId("coding-schedule-harness"), {
      target: { value: "pi" },
    })
    fireEvent.click(screen.getByTestId("coding-schedule-save"))

    expect(onSave).toHaveBeenCalledTimes(1)
    const input = onSave.mock.calls[0]![0]
    expect(input.cron).toBe("*/5 * * * *")
    expect(input.cwd).toBe("/projects/demo")
    expect(input.harness).toBe("pi")
    expect(input.enabled).toBe(true)
    expect(String(input.prompt).length).toBeGreaterThan(0)
  })
})
