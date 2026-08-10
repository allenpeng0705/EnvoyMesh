/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react"
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

describe("ExtAgentOfflineBanner (Phase 55D.1 — install card for not-installed)", () => {
  beforeEach(() => {
    probeExtAgent.mockReset()
    bridgeStatus = { enabled: true, activeExtAgentId: "homeclaw" }
  })

  afterEach(() => {
    cleanup()
  })

  it("shows the simple hint when the agent is installed but offline", async () => {
    probeExtAgent.mockResolvedValue({
      agentId: "homeclaw",
      agentName: "HomeClaw",
      builtIn: false,
      reachable: false,
      installState: "installed",
      hint: "Start HomeClaw",
      checkedAt: new Date().toISOString(),
    })
    render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-offline-banner")).toBeTruthy()
    })
    expect(screen.getByText(/HomeClaw is not running/)).toBeTruthy()
    expect(screen.getByText(/Start HomeClaw/)).toBeTruthy()
    // No install card — agent is installed.
    expect(screen.queryByTestId("ext-agent-offline-banner-card")).toBeNull()
  })

  it("renders the install card when installState is 'not-installed'", async () => {
    bridgeStatus = { enabled: true, activeExtAgentId: "codex" }
    probeExtAgent.mockResolvedValue({
      agentId: "codex",
      agentName: "Codex",
      builtIn: false,
      reachable: false,
      installState: "not-installed",
      installGuide: {
        agentId: "codex",
        installed: false,
        command: "codex",
        installCommand: "npm install -g @openai/codex",
        verifyCommand: "codex --version",
        startHint: "Install the Codex CLI...",
        homepageUrl: "https://github.com/openai/codex",
        homepageLabel: "Codex on GitHub",
        commonIssues: ["Set OPENAI_API_KEY before running codex."],
      },
      hint: "codex isn't on this machine yet.",
      checkedAt: new Date().toISOString(),
    })
    render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-offline-banner")).toBeTruthy()
    })
    // The shared install card is inlined in the banner with a
    // banner-specific testid prefix.
    const card = screen.getByTestId("ext-agent-offline-banner-card")
    expect(card).toBeTruthy()
    expect(card.getAttribute("data-agent-id")).toBe("codex")
    expect(card.getAttribute("data-install-state")).toBe("not-installed")
    expect(screen.getByTestId("ext-agent-offline-banner-card-install-cmd").textContent).toBe(
      "npm install -g @openai/codex",
    )
    // The Retry button is wired to refresh().
    const retry = screen.getByTestId("ext-agent-offline-banner-card-retry")
    expect(retry).toBeTruthy()
  })

  it("hides for built-in Pi when reachable", async () => {
    bridgeStatus = { enabled: true, activeExtAgentId: "pi" }
    probeExtAgent.mockResolvedValue({
      agentId: "pi",
      agentName: "Pi",
      builtIn: true,
      reachable: true,
      installState: "installed",
      hint: "",
      checkedAt: new Date().toISOString(),
    })
    const { container } = render(<ExtAgentOfflineBanner />)
    await waitFor(() => {
      expect(probeExtAgent).toHaveBeenCalled()
    })
    expect(container.querySelector("[data-testid='ext-agent-offline-banner']")).toBeNull()
  })

  it("shows the simple hint when built-in Pi sidecar is missing (installState='installed')", async () => {
    bridgeStatus = { enabled: true, activeExtAgentId: "pi" }
    probeExtAgent.mockResolvedValue({
      agentId: "pi",
      agentName: "Pi",
      builtIn: true,
      reachable: false,
      installState: "installed",
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
      installState: "installed",
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

  it("rechecks on the simple Recheck button (installed-but-offline path)", async () => {
    probeExtAgent
      .mockResolvedValueOnce({
        agentId: "openhuman",
        agentName: "OpenHuman",
        builtIn: false,
        reachable: false,
        installState: "installed",
        hint: "Start OpenHuman",
        checkedAt: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        agentId: "openhuman",
        agentName: "OpenHuman",
        builtIn: false,
        reachable: true,
        installState: "installed",
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
