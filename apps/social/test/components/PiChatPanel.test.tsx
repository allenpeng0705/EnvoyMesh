/**
 * @vitest-environment jsdom
 *
 * Phase 49 — PiChatPanel component tests.
 *
 * Covers the lightweight chat panel's behavior:
 *   - renders header + empty state when no status / no turns
 *   - shows status badge from getPiStatus()
 *   - blocks submit when Pi isn't ready, with a hint
 *   - sends a prompt and renders the response on success
 *   - surfaces an error message on failure
 *   - restart button calls restartPi() and refreshes status
 *
 * Uses the project's assertion style (toBeDefined / toBeNull / toContain),
 * not jest-dom's toBeInTheDocument — matches ChatSidebar.test.tsx.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { PiStatus } from "@envoymesh/api"
import { PiChatPanel } from "../../src/components/views/PiChatPanel.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

// --- Mocks ---

const getPiStatus = vi.fn()
const sendToPi = vi.fn()
const restartPi = vi.fn()
const piRespondToProposal = vi.fn()
// Capture the latest pi:proposal handler registered by the component, so
// tests can emit events via it. Reset per-test in beforeEach.
let piProposalHandler: ((event: { proposal: unknown }) => void) | null = null
const onMock = vi.fn((event: string, handler: (event: unknown) => void) => {
  if (event === "pi:proposal") piProposalHandler = handler as (e: { proposal: unknown }) => void
  return () => {}
})

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getPiStatus,
    sendToPi,
    restartPi,
    piRespondToProposal,
    isConnected: true,
    on: onMock,
  }),
}))

// --- Helpers ---

function status(overrides: Partial<PiStatus> = {}): PiStatus {
  return {
    enabled: true,
    state: "ready",
    modelInherited: true,
    ...overrides,
  }
}

beforeEach(() => {
  getPiStatus.mockReset()
  sendToPi.mockReset()
  restartPi.mockReset()
  piRespondToProposal.mockReset()
  piRespondToProposal.mockResolvedValue({ uiRequestId: "", delivered: true })
  onMock.mockClear()
  piProposalHandler = null
  // Default: Pi is ready.
  getPiStatus.mockResolvedValue(status())
})

afterEach(() => cleanup())

// --- Tests ---

describe("PiChatPanel", () => {
  it("renders the header and empty state on first mount", async () => {
    renderWithI18n(<PiChatPanel />)
    // Title appears immediately (rendered from constants, not RPC).
    expect(screen.getAllByText("Pi").length).toBeGreaterThan(0)
    expect(screen.getByText(/Local coding agent/)).toBeDefined()
    // Empty-state copy appears after the status probe settles.
    expect(
      await screen.findByText(/your local coding agent/i),
    ).toBeDefined()
  })

  it("shows the ready status badge after the initial probe", async () => {
    renderWithI18n(<PiChatPanel />)
    expect(await screen.findByText("Ready")).toBeDefined()
  })

  it("shows the disabled badge when status.state is disabled", async () => {
    getPiStatus.mockResolvedValue(status({ state: "disabled" }))
    renderWithI18n(<PiChatPanel />)
    expect(await screen.findByText("Disabled")).toBeDefined()
  })

  it("shows the error badge + restart button when status.state is error", async () => {
    // Use mockResolvedValue (not Once) so the 5s poll doesn't flip status
    // back to ready between findByText and the button assertion.
    getPiStatus.mockResolvedValue(status({ state: "error", error: "spawn failed" }))
    renderWithI18n(<PiChatPanel />)
    expect(await screen.findByText("Error")).toBeDefined()
    expect(screen.getByRole("button", { name: /restart/i })).toBeDefined()
  })

  it("blocks submit and shows a hint when Pi is starting", async () => {
    getPiStatus.mockResolvedValue(status({ state: "starting" }))
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Starting…")

    const input = screen.getByPlaceholderText(/ask pi/i)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    // The submit was rejected with an inline system message.
    expect(await screen.findByText(/pi is starting/i)).toBeDefined()
    expect(sendToPi).not.toHaveBeenCalled()
  })

  it("sends a prompt and renders the assistant response on success", async () => {
    sendToPi.mockResolvedValue("Here is the refactored code.")
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    const input = screen.getByPlaceholderText(/ask pi/i)
    fireEvent.change(input, { target: { value: "refactor this" } })
    fireEvent.submit(input.closest("form")!)

    // User turn appears immediately (optimistic).
    expect(await screen.findByText("refactor this")).toBeDefined()
    // Assistant response renders once the RPC resolves.
    expect(await screen.findByText("Here is the refactored code.")).toBeDefined()
    expect(sendToPi).toHaveBeenCalledWith("refactor this")
  })

  it("surfaces an error message when sendToPi throws", async () => {
    sendToPi.mockRejectedValue(new Error("child crashed"))
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    const input = screen.getByPlaceholderText(/ask pi/i)
    fireEvent.change(input, { target: { value: "test" } })
    fireEvent.submit(input.closest("form")!)

    expect(await screen.findByText(/failed to reach pi/i)).toBeDefined()
  })

  it("surfaces an info message when sendToPi returns an empty response", async () => {
    sendToPi.mockResolvedValue("")
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    const input = screen.getByPlaceholderText(/ask pi/i)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    expect(await screen.findByText(/empty response/i)).toBeDefined()
  })

  it("does not show a restart button when state is not-installed", async () => {
    // Restart can't conjure a missing sidecar — hide the button.
    getPiStatus.mockResolvedValue(status({ state: "not-installed" }))
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Not installed")
    const restartButtons = screen.queryAllByRole("button", { name: /^restart$/i })
    expect(restartButtons.length).toBe(0)
  })

  it("restart button calls restartPi() and refreshes status to ready", async () => {
    // Start in error so the restart button renders.
    getPiStatus.mockResolvedValue(status({ state: "error" }))
    restartPi.mockResolvedValue(status({ state: "ready" }))
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Error")

    // After the click, subsequent getPiStatus polls should also report
    // ready (the restart succeeded). Switch the mock BEFORE clicking so
    // any poll that fires after restartPi resolves sees ready.
    getPiStatus.mockResolvedValue(status({ state: "ready" }))

    fireEvent.click(screen.getByRole("button", { name: /restart/i }))

    await waitFor(() => {
      expect(restartPi).toHaveBeenCalledTimes(1)
    })
    expect(await screen.findByText("Ready")).toBeDefined()
  })

  it("does not show a restart button when Pi is ready", async () => {
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")
    // No element with role=button named exactly "restart".
    const restartButtons = screen.queryAllByRole("button", { name: /^restart$/i })
    expect(restartButtons.length).toBe(0)
  })

  // ---- Phase 49D — tool-action confirm dialog ----

  it("renders the proposal dialog when a pi:proposal event arrives", async () => {
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    // Emit a pi:proposal event through the mocked nodeService.on() subscription.
    emitPiProposalEvent({
      uiRequestId: "req-1",
      title: "Run bash command?",
      message: "rm -rf node_modules",
      timeoutMs: 5000,
      receivedAt: new Date().toISOString(),
    })

    expect(await screen.findByText(/Run bash command/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /allow/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /deny/i })).toBeDefined()
  })

  it("Allow button calls piRespondToProposal(confirmed:true)", async () => {
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    emitPiProposalEvent({
      uiRequestId: "req-2",
      title: "Save file",
      message: "src/index.ts",
      timeoutMs: 5000,
      receivedAt: new Date().toISOString(),
    })

    await screen.findByText(/Save file/i)
    fireEvent.click(screen.getByRole("button", { name: /allow/i }))

    await waitFor(() => {
      expect(piRespondToProposal).toHaveBeenCalledWith({
        uiRequestId: "req-2",
        confirmed: true,
      })
    })
  })

  it("Deny button calls piRespondToProposal(confirmed:false)", async () => {
    renderWithI18n(<PiChatPanel />)
    await screen.findByText("Ready")

    emitPiProposalEvent({
      uiRequestId: "req-3",
      title: "Run bash",
      message: "rm -rf /",
      timeoutMs: 5000,
      receivedAt: new Date().toISOString(),
    })

    await screen.findByText(/Run bash/i)
    fireEvent.click(screen.getByRole("button", { name: /deny/i }))

    await waitFor(() => {
      expect(piRespondToProposal).toHaveBeenCalledWith({
        uiRequestId: "req-3",
        confirmed: false,
      })
    })
  })
})

// --- Helper: emit a pi:proposal event through the captured handler ---
function emitPiProposalEvent(proposal: {
  uiRequestId: string
  title: string
  message: string
  timeoutMs: number
  receivedAt: string
}): void {
  if (!piProposalHandler) throw new Error("no pi:proposal handler registered")
  piProposalHandler({ proposal })
}
