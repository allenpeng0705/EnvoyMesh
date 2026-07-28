/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { ExtAgentSwitcher } from "../../src/components/ExtAgentSwitcher.js"

const updateNodeConfig = vi.fn()
const getBridgeStatus = vi.fn()
const probeExtAgent = vi.fn()

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    updateNodeConfig,
    getBridgeStatus,
    probeExtAgent,
  }),
}))

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

let bridgeStatus: {
  enabled: boolean
  activeExtAgentId: string
  agentName: string
  extAgents?: Array<{ id: string; name: string; adapter: string; url: string; enabled: boolean }>
} | null = {
  enabled: true,
  activeExtAgentId: "pi",
  agentName: "Pi",
  extAgents: undefined,
}

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ bridgeStatus }),
}))

describe("ExtAgentSwitcher", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    updateNodeConfig.mockReset()
    getBridgeStatus.mockReset()
    probeExtAgent.mockReset()
    updateNodeConfig.mockResolvedValue(undefined)
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "homeclaw" })
    probeExtAgent.mockResolvedValue({
      agentId: "hermes",
      agentName: "Hermes",
      builtIn: false,
      reachable: true,
      hint: "",
      checkedAt: new Date().toISOString(),
    })
    bridgeStatus = {
      enabled: true,
      activeExtAgentId: "pi",
      agentName: "Pi",
      extAgents: undefined,
    }
  })

  it("shows icon+name button and opens modal with all agents including OpenHuman", async () => {
    const { container } = render(<ExtAgentSwitcher />)
    const btn = screen.getByTestId("ext-agent-switcher-btn")
    expect(btn.textContent).toContain("Pi")
    expect(btn.querySelector("svg")).toBeTruthy()
    expect(screen.queryByTestId("ext-agent-switcher-menu")).toBeNull()

    fireEvent.click(btn)
    expect(screen.getByTestId("ext-agent-switcher-menu")).toBeTruthy()

    for (const id of ["pi", "homeclaw", "hermes", "openhuman"]) {
      expect(screen.getByTestId(`ext-agent-option-${id}`)).toBeTruthy()
    }

    fireEvent.click(screen.getByTestId("ext-agent-option-hermes"))
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ activeExtAgentId: "hermes" })
    })
    expect(updateNodeConfig).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(probeExtAgent).toHaveBeenCalledWith({ agentId: "hermes" })
    })
    expect(screen.queryByTestId("ext-agent-switcher-menu")).toBeNull()
    expect(container.querySelector(".ext-agent-switcher-btn--offline")).toBeNull()
  })

  it("marks switcher offline after soft-probe fails", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "homeclaw" })
    probeExtAgent.mockResolvedValue({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      builtIn: false,
      reachable: false,
      hint: "Start HomeClaw",
      checkedAt: new Date().toISOString(),
    })
    const { container } = render(<ExtAgentSwitcher />)
    const btn = container.querySelector("[data-testid='ext-agent-switcher-btn']")
    expect(btn).toBeTruthy()
    fireEvent.click(btn!)
    fireEvent.click(screen.getByTestId("ext-agent-option-homeclaw"))
    await waitFor(() => {
      expect(container.querySelector(".ext-agent-switcher-btn--offline")).toBeTruthy()
    })
  })

  it("hides when bridge is disabled", () => {
    bridgeStatus = { enabled: false, activeExtAgentId: "pi", agentName: "Pi" }
    const { container } = render(<ExtAgentSwitcher />)
    expect(container.querySelector("[data-testid='ext-agent-switcher']")).toBeNull()
  })
})
