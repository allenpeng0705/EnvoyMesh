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

const HEALTHY_PROBE = {
  agentId: "hermes",
  agentName: "Hermes",
  builtIn: false,
  reachable: true,
  installState: "installed",
  hint: "",
  checkedAt: new Date().toISOString(),
}

const INSTALLED_BUT_OFFLINE_PROBE = {
  agentId: "homeclaw",
  agentName: "HomeClaw",
  builtIn: false,
  reachable: false,
  installState: "installed",
  hint: "Start HomeClaw, then confirm http://127.0.0.1:8010/status responds.",
  checkedAt: new Date().toISOString(),
}

const NOT_INSTALLED_PROBE = {
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
}

describe("ExtAgentSwitcher (Phase 55D.1 tri-state UX)", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    updateNodeConfig.mockReset()
    getBridgeStatus.mockReset()
    probeExtAgent.mockReset()
    updateNodeConfig.mockResolvedValue(undefined)
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "homeclaw" })
    probeExtAgent.mockResolvedValue(HEALTHY_PROBE)
    bridgeStatus = {
      enabled: true,
      activeExtAgentId: "pi",
      agentName: "Pi",
      extAgents: undefined,
    }
  })

  it("shows icon+name button and opens modal with all agents including codex/claudecode", async () => {
    const { container } = render(<ExtAgentSwitcher />)
    const btn = screen.getByTestId("ext-agent-switcher-btn")
    expect(btn.textContent).toContain("Pi")
    expect(btn.querySelector("svg")).toBeTruthy()
    expect(screen.queryByTestId("ext-agent-switcher-menu")).toBeNull()

    fireEvent.click(btn)
    expect(screen.getByTestId("ext-agent-switcher-menu")).toBeTruthy()

    for (const id of ["pi", "homeclaw", "hermes", "openhuman", "codex", "claudecode"]) {
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
    // Healthy probe → no toast, no install dialog.
    expect(screen.queryByTestId("ext-agent-switcher-toast")).toBeNull()
    expect(screen.queryByTestId("ext-agent-install-dialog")).toBeNull()
    expect(screen.queryByTestId("ext-agent-switcher-menu")).toBeNull()
    expect(container.querySelector(".ext-agent-switcher-btn--offline")).toBeNull()
  })

  it("shows the offline toast when the agent is installed but not running (3rd state)", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "homeclaw" })
    probeExtAgent.mockResolvedValue(INSTALLED_BUT_OFFLINE_PROBE)
    render(<ExtAgentSwitcher />)
    fireEvent.click(screen.getByTestId("ext-agent-switcher-btn"))
    fireEvent.click(screen.getByTestId("ext-agent-option-homeclaw"))
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-switcher-toast")).toBeTruthy()
    })
    expect(screen.getByTestId("ext-agent-switcher-toast").textContent).toContain("Start HomeClaw")
    // No install dialog — agent IS installed.
    expect(screen.queryByTestId("ext-agent-install-dialog")).toBeNull()
  })

  it("shows the install dialog when the agent's installState is 'not-installed'", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "codex" })
    probeExtAgent.mockResolvedValue(NOT_INSTALLED_PROBE)
    render(<ExtAgentSwitcher />)
    fireEvent.click(screen.getByTestId("ext-agent-switcher-btn"))
    fireEvent.click(screen.getByTestId("ext-agent-option-codex"))
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-install-dialog")).toBeTruthy()
    })
    expect(screen.getByText(/Install Codex to continue/)).toBeTruthy()
    expect(screen.getByTestId("ext-agent-install-dialog-card-install-cmd").textContent).toBe(
      "npm install -g @openai/codex",
    )
  })

  it("auto-dismisses the install dialog when Retry reports the agent is now installed", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "codex" })
    probeExtAgent
      .mockResolvedValueOnce(NOT_INSTALLED_PROBE) // initial probe after switch
      .mockResolvedValueOnce(HEALTHY_PROBE); // retry probe
    render(<ExtAgentSwitcher />)
    fireEvent.click(screen.getByTestId("ext-agent-switcher-btn"))
    fireEvent.click(screen.getByTestId("ext-agent-option-codex"))
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-install-dialog")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("ext-agent-install-dialog-card-retry"))
    await waitFor(() => {
      expect(screen.queryByTestId("ext-agent-install-dialog")).toBeNull()
    })
  })

  it("Dismiss button closes the install dialog", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "codex" })
    probeExtAgent.mockResolvedValue(NOT_INSTALLED_PROBE)
    render(<ExtAgentSwitcher />)
    fireEvent.click(screen.getByTestId("ext-agent-switcher-btn"))
    fireEvent.click(screen.getByTestId("ext-agent-option-codex"))
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-install-dialog")).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId("ext-agent-install-dialog-card-dismiss"))
    await waitFor(() => {
      expect(screen.queryByTestId("ext-agent-install-dialog")).toBeNull()
    })
  })

  it("Retry on the offline toast re-probes", async () => {
    getBridgeStatus.mockResolvedValue({ activeExtAgentId: "homeclaw" })
    probeExtAgent
      .mockResolvedValueOnce(INSTALLED_BUT_OFFLINE_PROBE) // initial probe
      .mockResolvedValueOnce(HEALTHY_PROBE); // retry probe
    render(<ExtAgentSwitcher />)
    fireEvent.click(screen.getByTestId("ext-agent-switcher-btn"))
    fireEvent.click(screen.getByTestId("ext-agent-option-homeclaw"))
    await waitFor(() => {
      expect(screen.getByTestId("ext-agent-switcher-toast")).toBeTruthy()
    })
    const callsBeforeRetry = probeExtAgent.mock.calls.length
    fireEvent.click(screen.getByTestId("ext-agent-switcher-toast-retry"))
    await waitFor(() => {
      expect(probeExtAgent.mock.calls.length).toBeGreaterThan(callsBeforeRetry)
    })
    // After successful retry, the toast disappears (replaced by silent).
    await waitFor(() => {
      expect(screen.queryByTestId("ext-agent-switcher-toast")).toBeNull()
    })
  })

  it("hides when bridge is disabled", () => {
    bridgeStatus = { enabled: false, activeExtAgentId: "pi", agentName: "Pi" }
    const { container } = render(<ExtAgentSwitcher />)
    expect(container.querySelector("[data-testid='ext-agent-switcher']")).toBeNull()
  })
})
