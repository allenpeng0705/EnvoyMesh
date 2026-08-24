/**
 * @vitest-environment jsdom
 *
 * UI integration E2E: EnvoyHarnessPanel multi-step chat lifecycle with mocked node.
 */
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react"
import type { EnvoyHarnessStatus } from "@envoymesh/api"
import { EnvoyHarnessPanel } from "../../src/components/views/EnvoyHarnessPanel.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

const getEnvoyHarnessStatus = vi.fn()
const startEnvoyHarnessTurn = vi.fn()
const getEnvoyHarnessTurnStatus = vi.fn()
const cancelEnvoyHarnessTurn = vi.fn()
const ehRespondToPermission = vi.fn()
const listEnvoyHarnessPeers = vi.fn()
const setEnvoyHarnessProjectPath = vi.fn()
const invokeEnvoyHarnessEhui = vi.fn()

const eventHandlers = new Map<string, Set<(payload: unknown) => void>>()

function emitEvent(event: string, payload: unknown) {
  for (const handler of eventHandlers.get(event) ?? []) {
    handler(payload)
  }
}

vi.mock("../../src/components/ehui/EnvoyHarnessEhuiRail.js", () => {
  const React = require("react")
  return {
    EnvoyHarnessEhuiRail: () =>
      React.createElement("div", { "data-testid": "ehui-rail-mock" }),
  }
})

vi.mock("@envoymesh/envoy-harness-ehui", () => ({
  EhuiPanelModal: () => null,
  EhuiCommandLinks: () => null,
}))

vi.mock("../../src/components/HomeFolderPicker.js", () => ({
  HomeFolderPicker: ({
    value,
    onChange,
  }: {
    value?: string
    onChange: (path: string | undefined) => void
  }) => (
    <input
      data-testid="eh-project-picker-mock"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}))

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getEnvoyHarnessStatus,
    startEnvoyHarnessTurn,
    getEnvoyHarnessTurnStatus,
    cancelEnvoyHarnessTurn,
    ehRespondToPermission,
    listEnvoyHarnessPeers,
    setEnvoyHarnessProjectPath,
    invokeEnvoyHarnessEhui,
    isConnected: true,
    on: (event: string, handler: (payload: unknown) => void) => {
      if (!eventHandlers.has(event)) eventHandlers.set(event, new Set())
      eventHandlers.get(event)!.add(handler)
      return () => eventHandlers.get(event)?.delete(handler)
    },
  }),
}))

function status(overrides: Partial<EnvoyHarnessStatus> = {}): EnvoyHarnessStatus {
  return {
    state: "ready",
    model: "deepseek:deepseek-chat",
    peers: { connected: 1, failed: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  eventHandlers.clear()
  getEnvoyHarnessStatus.mockReset()
  startEnvoyHarnessTurn.mockReset()
  getEnvoyHarnessTurnStatus.mockReset()
  cancelEnvoyHarnessTurn.mockReset()
  ehRespondToPermission.mockReset()
  listEnvoyHarnessPeers.mockReset()
  setEnvoyHarnessProjectPath.mockReset()
  invokeEnvoyHarnessEhui.mockReset()
  getEnvoyHarnessStatus.mockResolvedValue(status())
  getEnvoyHarnessTurnStatus.mockResolvedValue({ busy: false })
  listEnvoyHarnessPeers.mockResolvedValue([
    { id: "p1", model: "deepseek-chat", capabilities: ["research"] },
  ])
  invokeEnvoyHarnessEhui.mockImplementation(async (req: { op: string }) => {
    if (req.op === "clusterStatus") {
      return { peers: [{ id: "p1", health: { ok: true } }], connected: 1, failed: 0 }
    }
    return ""
  })
})

afterEach(() => cleanup())

describe("EnvoyHarnessPanel E2E (mocked node)", () => {
  it("runs hello → thinking → stream → complete, then queues while busy and drains", async () => {
    let turnCounter = 0
    startEnvoyHarnessTurn.mockImplementation(async (text: string) => ({
      turnId: `e2e-turn-${++turnCounter}`,
      text,
    }))

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")

    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    expect(screen.getByText(/envoy-harness is thinking/i)).toBeDefined()
    await waitFor(() => expect(startEnvoyHarnessTurn).toHaveBeenCalledWith("hello", []))

    act(() => {
      emitEvent("eh:turn_token", {
        turnId: "e2e-turn-1",
        delta: "Hi",
        streamingText: "Hi",
      })
    })
    expect(await screen.findByText(/^Hi$/)).toBeDefined()

    act(() => {
      emitEvent("eh:turn_complete", {
        turnId: "e2e-turn-1",
        ok: true,
        text: "Hello! (hello)",
      })
    })
    expect(await screen.findByText("Hello! (hello)")).toBeDefined()

    fireEvent.change(input, { target: { value: "slow task" } })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() =>
      expect(startEnvoyHarnessTurn).toHaveBeenCalledWith("slow task", []),
    )
    expect(await screen.findByText(/envoy-harness is thinking/i)).toBeDefined()

    fireEvent.change(input, { target: { value: "queued follow-up" } })
    fireEvent.submit(input.closest("form")!)
    expect(await screen.findByDisplayValue("queued follow-up")).toBeDefined()

    act(() => {
      emitEvent("eh:turn_complete", {
        turnId: "e2e-turn-2",
        ok: true,
        text: "slow done",
      })
    })

    await waitFor(() =>
      expect(startEnvoyHarnessTurn).toHaveBeenCalledWith("queued follow-up", []),
    )
    act(() => {
      emitEvent("eh:turn_complete", {
        turnId: "e2e-turn-3",
        ok: true,
        text: "queued: follow-up",
      })
    })
    expect(await screen.findByText("queued: follow-up")).toBeDefined()
  })
})
