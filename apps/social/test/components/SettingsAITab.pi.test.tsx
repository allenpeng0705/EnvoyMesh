/**
 * @vitest-environment jsdom
 *
 * Phase 49F — tests for the Pi settings block in SettingsAITab.
 *
 * Covers:
 *   - the Pi block renders when status is fetched
 *   - status badge reflects piStatus.state
 *   - toggling enablePi persists config AND triggers restartPi
 *   - changing auto-run policy persists piSettings
 *   - restart button calls restartPi()
 *   - not-installed state shows the install hint instead of controls
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import type { PiStatus } from "@envoymesh/api"
import { renderWithI18n } from "../helpers/render-with-i18n.js"
import { SettingsAITab } from "../../src/components/views/SettingsAITab.js"

// --- Mocks ---

const updateNodeConfig = vi.fn().mockResolvedValue(undefined)
const refreshNodeConfig = vi.fn().mockResolvedValue(undefined)
const getOpenClawStatus = vi.fn().mockResolvedValue({
  enabled: true,
  running: false,
  url: "",
})
const getPiStatus = vi.fn()
const restartPi = vi.fn()
const on = vi.fn(() => () => {})

let nodeConfig: {
  piEnabled?: boolean
  piSettings?: { autoRunPolicy?: "always-confirm" | "safe-only" | "off" }
  openclawEnabled?: boolean
  bridgeEnabled?: boolean
  chatAssistEnabled?: boolean
  modelProviders?: { mode: "disabled" }
} = {}

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    updateNodeConfig,
    getOpenClawStatus,
    getPiStatus,
    restartPi,
    getRagIndexStatus: vi.fn().mockResolvedValue(null),
    reindexRagKnowledge: vi.fn().mockResolvedValue(null),
    testRagEmbedding: vi.fn().mockResolvedValue({ ok: true, dimensions: 8, latencyMs: 1, modelKey: "mock", mode: "mock", modelName: "mock", endpoint: "mock://local", hasApiKey: false }),
    testChatModel: vi.fn().mockResolvedValue({ ok: true, providerId: "mock", modelName: "mock", replyPreview: "pong", latencyMs: 1 }),
    getAgentIdentity: vi.fn().mockResolvedValue({ content: "", updatedAt: null }),
    getEnvoyLocalStatus: vi.fn().mockResolvedValue({
      enabled: false,
      running: false,
      phase: "disabled",
      runtimeInstalled: false,
      serverParams: {},
    }),
    listEnvoyLocalInstalledModels: vi.fn().mockResolvedValue([]),
    searchEnvoyLocalModels: vi.fn().mockResolvedValue({ models: [] }),
    checkEnvoyLocalEngineUpdate: vi.fn().mockResolvedValue({
      pinnedVersion: "b0",
      updateAvailable: false,
    }),
    on,
    isConnected: true,
  }),
  useModelProviderUiScope: () => "full",
  useIsInProcessMobileNode: () => false,
}))

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig, refreshNodeConfig }),
}))

// --- Helpers ---

function piStatus(overrides: Partial<PiStatus> = {}): PiStatus {
  return {
    enabled: true,
    state: "ready",
    modelInherited: true,
    piVersion: "0.82.1",
    modelSpec: "anthropic/claude-sonnet-4-20250514",
    ...overrides,
  }
}

beforeEach(() => {
  updateNodeConfig.mockReset()
  updateNodeConfig.mockResolvedValue(undefined)
  refreshNodeConfig.mockReset()
  refreshNodeConfig.mockResolvedValue(undefined)
  getPiStatus.mockReset()
  restartPi.mockReset()
  restartPi.mockResolvedValue(piStatus())
  getOpenClawStatus.mockResolvedValue({ enabled: true, running: false, url: "" })
  nodeConfig = {
    piEnabled: true,
    piSettings: { autoRunPolicy: "always-confirm" },
    openclawEnabled: true,
    chatAssistEnabled: false,
    modelProviders: { mode: "disabled" },
  }
  // Default: Pi is ready.
  getPiStatus.mockResolvedValue(piStatus())
})

afterEach(() => cleanup())

// --- Tests ---

describe("SettingsAITab — Pi block (Phase 49F)", () => {
  /**
   * Helper: locate the Pi settings block (the `.agent-block` containing the
   * `.agent-block-icon--pi` element). Avoids ambiguity with the section `<h4>`,
   * which also contains "Pi (Local Coding Agent)".
   */
  async function findPiBlock(): Promise<HTMLElement> {
    const icon = await screen.findByText("π")
    const block = icon.closest(".agent-block") as HTMLElement | null
    if (!block) throw new Error("Pi .agent-block not rendered")
    return block
  }

  it("renders the Pi section with title and status badge", async () => {
    renderWithI18n(<SettingsAITab />)
    const piBlock = await findPiBlock()
    // Status badge uses class agent-block-status--on for ready state.
    expect(piBlock.querySelector(".agent-block-status--on")).toBeDefined()
  })

  it("shows the 'Disabled' badge when piStatus.state is disabled", async () => {
    getPiStatus.mockResolvedValue(piStatus({ state: "disabled" }))
    renderWithI18n(<SettingsAITab />)
    expect(await screen.findByText("Disabled")).toBeDefined()
  })

  it("shows the 'Error' badge + restart button when state is error", async () => {
    getPiStatus.mockResolvedValue(piStatus({ state: "error", error: "spawn failed" }))
    renderWithI18n(<SettingsAITab />)
    expect(await screen.findByText("Error")).toBeDefined()
    expect(screen.getByRole("button", { name: /restart now/i })).toBeDefined()
  })

  it("shows the install hint and hides the restart button when not-installed", async () => {
    getPiStatus.mockResolvedValue(piStatus({ state: "not-installed" }))
    renderWithI18n(<SettingsAITab />)
    expect(await screen.findByText(/not bundled/i)).toBeDefined()
    // No restart button — restart can't fix not-installed.
    expect(screen.queryByRole("button", { name: /restart now/i })).toBeNull()
  })

  it("toggling the enable checkbox persists piEnabled + calls restartPi", async () => {
    renderWithI18n(<SettingsAITab />)
    await screen.findByText("Ready")

    const checkbox = screen.getByRole("checkbox", { name: /enable pi/i })
    // Starts checked (nodeConfig.piEnabled = true).
    expect((checkbox as HTMLInputElement).checked).toBe(true)

    // Uncheck it.
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(expect.objectContaining({ piEnabled: false }))
      expect(restartPi).toHaveBeenCalledTimes(1)
    })
  })

  it("changing the auto-run policy persists piSettings (no restart)", async () => {
    renderWithI18n(<SettingsAITab />)
    const piBlock = await findPiBlock()

    // The select lives inside the Pi block. Lookup by tagname since the
    // <label> isn't htmlFor-linked (matches the existing Ext Agent pattern).
    const select = piBlock.querySelector("select") as HTMLSelectElement
    expect(select).toBeDefined()
    expect(select.value).toBe("always-confirm")

    // Switch to off (always preview / confirm).
    fireEvent.change(select, { target: { value: "off" } })

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          piSettings: expect.objectContaining({ autoRunPolicy: "off" }),
        }),
      )
    })
    // CRITICAL: auto-run policy change must NOT trigger a Pi restart —
    // the policy is read fresh on the next tool-call request.
    expect(restartPi).not.toHaveBeenCalled()
  })

  it("Restart now button calls restartPi", async () => {
    getPiStatus.mockResolvedValue(piStatus({ state: "error" }))
    renderWithI18n(<SettingsAITab />)
    await screen.findByText("Error")

    fireEvent.click(screen.getByRole("button", { name: /restart now/i }))

    await waitFor(() => {
      expect(restartPi).toHaveBeenCalledTimes(1)
    })
  })

  it("saving a Pi custom model persists override and restarts Pi", async () => {
    renderWithI18n(<SettingsAITab />)
    const piBlock = await findPiBlock()

    const customCheckbox = Array.from(piBlock.querySelectorAll('input[type="checkbox"]')).find(
      (el) => (el as HTMLInputElement).parentElement?.textContent?.includes("Custom model for Pi"),
    ) as HTMLInputElement | undefined
    expect(customCheckbox).toBeDefined()
    fireEvent.click(customCheckbox!)

    // Provider + model are selects (Pi-native catalog). Default is MiniMax CN / MiniMax-M3.
    const selects = Array.from(piBlock.querySelectorAll("select"))
    expect(selects.length).toBeGreaterThanOrEqual(2)
    const providerSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "minimax-cn"),
    ) as HTMLSelectElement
    expect(providerSelect).toBeDefined()
    fireEvent.change(providerSelect, { target: { value: "minimax-cn" } })

    const modelSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === "MiniMax-M3"),
    ) as HTMLSelectElement
    expect(modelSelect).toBeDefined()
    fireEvent.change(modelSelect, { target: { value: "MiniMax-M3" } })

    const saveBtn = Array.from(piBlock.querySelectorAll("button")).find(
      (b) => /save model/i.test(b.textContent?.trim() ?? ""),
    )
    expect(saveBtn).toBeDefined()
    fireEvent.click(saveBtn!)

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          piSettings: expect.objectContaining({
            modelOverride: expect.objectContaining({
              provider: "minimax-cn",
              model: "MiniMax-M3",
            }),
          }),
        }),
      )
      expect(restartPi).toHaveBeenCalledTimes(1)
    })
  })
})
