/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import { ExtAgentOfflineBanner } from "../../src/components/views/ExtAgentOfflineBanner.js"

const probeExtAgent = vi.fn()

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({ probeExtAgent }),
}))

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

let bridgeStatus: {
  enabled: boolean
  activeExtAgentId: string
} | null = {
  enabled: true,
  activeExtAgentId: "homeclaw",
}

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ bridgeStatus }),
}))

describe("ExtAgentOfflineBanner", () => {
  beforeEach(() => {
    probeExtAgent.mockReset()
    bridgeStatus = { enabled: true, activeExtAgentId: "homeclaw" }
  })

  it("shows guide when HomeClaw is unreachable", async () => {
    probeExtAgent.mockResolvedValue({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      builtIn: false,
      reachable: false,
      hint: "Start HomeClaw",
      checkedAt: new Date().toISOString(),
    })
    render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-offline-banner")).toBeTruthy()
    })
    expect(screen.getByText(/HomeClaw is not running/)).toBeTruthy()
    expect(screen.getByText(/Start HomeClaw/)).toBeTruthy()
  })

  it("hides for built-in Pi when reachable", async () => {
    bridgeStatus = { enabled: true, activeExtAgentId: "pi" }
    probeExtAgent.mockResolvedValue({
      agentId: "pi",
      agentName: "Pi",
      builtIn: true,
      reachable: true,
      hint: "",
      checkedAt: new Date().toISOString(),
    })
    const { container } = render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(probeExtAgent).toHaveBeenCalled()
    })
    expect(container.querySelector("[data-testid='ext-agent-offline-banner']")).toBeNull()
  })

  it("shows guide when built-in Pi sidecar is missing", async () => {
    bridgeStatus = { enabled: true, activeExtAgentId: "pi" }
    probeExtAgent.mockResolvedValue({
      agentId: "pi",
      agentName: "Pi",
      builtIn: true,
      reachable: false,
      hint: "Pi sidecar missing",
      checkedAt: new Date().toISOString(),
    })
    render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-offline-banner")).toBeTruthy()
    })
    expect(screen.getByText(/Pi is not running/)).toBeTruthy()
    expect(screen.getByText(/Pi sidecar missing/)).toBeTruthy()
  })

  it("hides when reachable", async () => {
    probeExtAgent.mockResolvedValue({
      agentId: "hermes",
      agentName: "Hermes",
      builtIn: false,
      reachable: true,
      hint: "",
      checkedAt: new Date().toISOString(),
    })
    bridgeStatus = { enabled: true, activeExtAgentId: "hermes" }
    const { container } = render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(probeExtAgent).toHaveBeenCalled()
    })
    expect(container.querySelector("[data-testid='ext-agent-offline-banner']")).toBeNull()
  })

  it("rechecks on button click", async () => {
    probeExtAgent
      .mockResolvedValueOnce({
        agentId: "openhuman",
        agentName: "OpenHuman",
        builtIn: false,
        reachable: false,
        hint: "Start OpenHuman",
        checkedAt: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        agentId: "openhuman",
        agentName: "OpenHuman",
        builtIn: false,
        reachable: true,
        hint: "",
        checkedAt: new Date().toISOString(),
      })
    bridgeStatus = { enabled: true, activeExtAgentId: "openhuman" }
    const { container } = render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-offline-banner")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("ext-agent-offline-recheck"))
    await waitFor(() => {
      expect(container.querySelector("[data-testid='ext-agent-offline-banner']")).toBeNull()
    })
  })
})
