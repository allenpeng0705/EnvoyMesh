/**
 * @vitest-environment jsdom
 *
 * U4 — EnvoyHarnessPanel component tests: status badge, cluster strip,
 * submit + response, not-ready hint, error surfacing.
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
const getEnvoyHarnessChatHistory = vi.fn()
const openEnvoyHarnessChat = vi.fn()
const resetEnvoyHarnessChat = vi.fn()
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

vi.mock("@envoymesh/envoy-harness-ehui", () => {
  const React = require("react")
  return {
    EhuiPanelModal: () => null,
    EhuiCommandLinks: () => null,
  }
})

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getEnvoyHarnessStatus,
    startEnvoyHarnessTurn,
    getEnvoyHarnessTurnStatus,
    cancelEnvoyHarnessTurn,
    getEnvoyHarnessChatHistory,
    openEnvoyHarnessChat,
    resetEnvoyHarnessChat,
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
  getEnvoyHarnessChatHistory.mockReset()
  openEnvoyHarnessChat.mockReset()
  resetEnvoyHarnessChat.mockReset()
  ehRespondToPermission.mockReset()
  listEnvoyHarnessPeers.mockReset()
  setEnvoyHarnessProjectPath.mockReset()
  invokeEnvoyHarnessEhui.mockReset()
  getEnvoyHarnessStatus.mockResolvedValue(status())
  getEnvoyHarnessTurnStatus.mockResolvedValue({ busy: false })
  openEnvoyHarnessChat.mockResolvedValue({
    sessionId: "sess-test",
    cwd: "/projects/app",
    turns: [],
  })
  getEnvoyHarnessChatHistory.mockResolvedValue({
    sessionId: "sess-test",
    cwd: "/projects/app",
    turns: [],
  })
  resetEnvoyHarnessChat.mockResolvedValue({
    sessionId: "sess-new",
    cwd: "/projects/app",
    turns: [],
  })
  listEnvoyHarnessPeers.mockResolvedValue([
    { id: "p1", model: "deepseek-chat", capabilities: ["research"] },
  ])
  invokeEnvoyHarnessEhui.mockImplementation(async (req: { op: string }) => {
    if (req.op === "clusterStatus") {
      return { peers: [{ id: "p1", health: { ok: true } }], connected: 1, failed: 0 }
    }
    if (req.op === "plan") return "(no plan)"
    if (req.op === "discoverySnapshot") return []
    return ""
  })
  setEnvoyHarnessProjectPath.mockResolvedValue(
    status({ cwd: "/projects/app" }),
  )
  startEnvoyHarnessTurn.mockImplementation(async (text: string) => {
    const turnId = "turn-test-1"
    setTimeout(() => {
      emitEvent("eh:turn_complete", {
        turnId,
        ok: true,
        text:
          text === "explain this"
            ? "<think>planning</think>\n\nHere is the answer."
            : text === "boom"
              ? undefined
              : "refactored the module",
      })
    }, 0)
    return { turnId }
  })
})

afterEach(() => cleanup())

describe("EnvoyHarnessPanel", () => {
  it("renders the header, status badge, and peer cluster strip", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    expect(await screen.findByText("Envoy")).toBeDefined()
    expect(await screen.findByText("Ready")).toBeDefined()
    expect(await screen.findByText(/cluster 1\/1/)).toBeDefined()
    expect(await screen.findByText(/p1/)).toBeDefined()
    expect((await screen.findAllByText(/deepseek-chat/)).length).toBeGreaterThan(0)
  })

  it("submits a prompt and renders the response", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, {
      target: { value: "refactor this" },
    })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() =>
      expect(startEnvoyHarnessTurn).toHaveBeenCalledWith("refactor this", []),
    )
    expect(await screen.findByText("refactored the module")).toBeDefined()
  })

  it("blocks submit with a hint when the runtime is not ready", async () => {
    getEnvoyHarnessStatus.mockResolvedValue(
      status({ state: "error", error: "no API key" }),
    )
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Error")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, {
      target: { value: "hi" },
    })
    fireEvent.submit(input.closest("form")!)
    expect(await screen.findByText(/not ready: no API key/)).toBeDefined()
    expect(startEnvoyHarnessTurn).not.toHaveBeenCalled()
  })

  it("surfaces an error when the turn fails", async () => {
    startEnvoyHarnessTurn.mockImplementation(async () => {
      const turnId = "turn-fail"
      setTimeout(() => {
        emitEvent("eh:turn_complete", {
          turnId,
          ok: false,
          error: "runtime crashed",
        })
      }, 0)
      return { turnId }
    })
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, {
      target: { value: "boom" },
    })
    fireEvent.submit(input.closest("form")!)
    expect(await screen.findByText(/Failed to reach envoy-harness: runtime crashed/)).toBeDefined()
  })

  it("shows a slash autocomplete menu with coding-agent commands", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "/" } })
    expect(await screen.findByRole("listbox")).toBeDefined()
    expect(screen.getByText("/help")).toBeDefined()
    expect(screen.getByText("/review")).toBeDefined()
  })

  it("loads persisted chat history on mount", async () => {
    getEnvoyHarnessStatus.mockResolvedValue(
      status({ cwd: "/projects/app" }),
    )
    getEnvoyHarnessChatHistory.mockResolvedValue({
      sessionId: "sess-hist",
      cwd: "/projects/app",
      turns: [
        { id: "u1", role: "user", text: "previous hello" },
        { id: "a1", role: "assistant", text: "previous reply" },
      ],
    })

    renderWithI18n(<EnvoyHarnessPanel />)
    await waitFor(() => expect(getEnvoyHarnessChatHistory).toHaveBeenCalled())
    expect(await screen.findByText("previous hello")).toBeDefined()
    expect(await screen.findByText("previous reply")).toBeDefined()
  })

  it("runs /help locally without calling the runtime", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "/help" } })
    fireEvent.submit(input.closest("form")!)
    expect(await screen.findByText(/envoy-harness slash commands:/)).toBeDefined()
    expect(startEnvoyHarnessTurn).not.toHaveBeenCalled()
  })

  it("strips model thinking tags from assistant replies", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "explain this" } })
    fireEvent.submit(input.closest("form")!)
    expect(await screen.findByText("Here is the answer.")).toBeDefined()
    expect(screen.queryByText(/redacted_thinking/)).toBeNull()
  })

  it("shows Thinking immediately after submit", async () => {
    startEnvoyHarnessTurn.mockImplementation(async () => ({ turnId: "turn-thinking" }))

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    expect(await screen.findByText(/envoy-harness is thinking/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeDefined()
  })

  it("renders hello response when turn completes", async () => {
    startEnvoyHarnessTurn.mockImplementation(async (text: string) => {
      const turnId = "turn-hello"
      setTimeout(() => {
        emitEvent("eh:turn_complete", {
          turnId,
          ok: true,
          text: `Hi! You said: ${text}`,
        })
      }, 0)
      return { turnId }
    })

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    expect(await screen.findByText("Hi! You said: hello")).toBeDefined()
    await waitFor(() => {
      expect(screen.queryByText(/envoy-harness is thinking/i)).toBeNull()
    })
  })

  it("streams partial assistant text before turn completes", async () => {
    startEnvoyHarnessTurn.mockImplementation(async () => ({ turnId: "turn-stream" }))

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    await waitFor(() => expect(startEnvoyHarnessTurn).toHaveBeenCalled())
    act(() => {
      emitEvent("eh:turn_token", {
        turnId: "turn-stream",
        delta: "Hel",
        streamingText: "Hel",
      })
    })
    expect(await screen.findByText(/Hel/)).toBeDefined()

    act(() => {
      emitEvent("eh:turn_complete", {
        turnId: "turn-stream",
        ok: true,
        text: "Hello world",
      })
    })
    expect(await screen.findByText(/Hello world/)).toBeDefined()
  })

  it("cancel clears the still-working indicator immediately", async () => {
    startEnvoyHarnessTurn.mockImplementation(async () => ({ turnId: "turn-slow" }))
    cancelEnvoyHarnessTurn.mockImplementation(async () => {
      setTimeout(() => {
        emitEvent("eh:turn_complete", {
          turnId: "turn-slow",
          ok: false,
          cancelled: true,
          error: "envoy_harness_cancelled",
        })
      }, 500)
      return { cancelled: true }
    })

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "hello" } })
    fireEvent.submit(input.closest("form")!)

    const cancelBtn = await screen.findByRole("button", { name: /Cancel/i })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull()
    })
    expect(cancelEnvoyHarnessTurn).toHaveBeenCalled()
  })

  it("cancel during permission wait clears busy UI", async () => {
    startEnvoyHarnessTurn.mockImplementation(async () => ({ turnId: "turn-perm" }))
    cancelEnvoyHarnessTurn.mockResolvedValue({ cancelled: true })

    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    const input = screen.getByPlaceholderText(/Ask envoy-harness/)
    fireEvent.change(input, { target: { value: "run tests" } })
    fireEvent.submit(input.closest("form")!)

    emitEvent("eh:permission", {
      requestId: "perm-cancel",
      sessionId: "sess-1",
      toolName: "bash",
      description: "Run npm test",
      args: { command: "npm test" },
      preview: "$ npm test",
      timeoutMs: 300_000,
    })
    expect(await screen.findByText("Run npm test")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }))
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Cancel/i })).toBeNull()
      expect(screen.queryByText(/envoy-harness is thinking/i)).toBeNull()
    })
    expect(cancelEnvoyHarnessTurn).toHaveBeenCalled()
    expect(screen.getByText("Run npm test")).toBeDefined()
  })

  it("shows permission dock when eh:permission fires", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    emitEvent("eh:permission", {
      requestId: "perm-1",
      sessionId: "sess-1",
      toolName: "bash",
      description: "Run npm test",
      args: { command: "npm test" },
      preview: "$ npm test",
      timeoutMs: 300_000,
    })
    expect(await screen.findByText("Run npm test")).toBeDefined()
    expect(screen.getByText("$ npm test")).toBeDefined()
    fireEvent.click(screen.getByRole("button", { name: /Allow/i }))
    await waitFor(() =>
      expect(ehRespondToPermission).toHaveBeenCalledWith({
        requestId: "perm-1",
        allowed: true,
      }),
    )
  })

  it("sets the project folder via the folder link modal", async () => {
    renderWithI18n(<EnvoyHarnessPanel />)
    await screen.findByText("Ready")
    fireEvent.click(screen.getByRole("button", { name: /envoy harness project folder/i }))
    const picker = await screen.findByTestId("eh-project-picker-mock")
    fireEvent.change(picker, { target: { value: "/projects/app" } })
    fireEvent.click(screen.getByRole("button", { name: /set project folder/i }))
    await waitFor(() =>
      expect(setEnvoyHarnessProjectPath).toHaveBeenCalledWith("/projects/app"),
    )
    expect(await screen.findByText(/Project folder → \/projects\/app/)).toBeDefined()
  })
})
