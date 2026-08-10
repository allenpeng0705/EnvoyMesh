/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { ExtAgentSwitcherInstallDialog } from "../../src/components/ExtAgentSwitcherInstallDialog.js"
import type { ExtAgentInstallGuide } from "@envoymesh/api"

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

const GUIDE: ExtAgentInstallGuide = {
  agentId: "codex",
  installed: false,
  command: "codex",
  installCommand: "npm install -g @openai/codex",
  verifyCommand: "codex --version",
  startHint: "Install the Codex CLI...",
  homepageUrl: "https://github.com/openai/codex",
  homepageLabel: "Codex on GitHub",
  commonIssues: ["Set OPENAI_API_KEY before running codex."],
}

describe("ExtAgentSwitcherInstallDialog (Phase 55D.1)", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders the install card with the agent name in the title", () => {
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByTestId("ext-agent-install-dialog")
    expect(dialog).toBeTruthy()
    expect(screen.getByRole("dialog")).toBeTruthy()
    const title = screen.getByRole("heading", { level: 2 })
    expect(title.textContent).toBe("Install Codex to continue")
    // The card body (from the shared install card) should be present.
    expect(screen.getByTestId("ext-agent-install-dialog-card-install-cmd").textContent).toBe(
      "npm install -g @openai/codex",
    )
    expect(screen.getByText(/Set OPENAI_API_KEY/)).toBeTruthy()
  })

  it("calls onRetry when the card's Retry button is clicked", () => {
    const onRetry = vi.fn()
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId("ext-agent-install-dialog-card-retry"))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when the card's Dismiss button is clicked", () => {
    const onClose = vi.fn()
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTestId("ext-agent-install-dialog-card-dismiss"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when ESC is pressed", () => {
    const onClose = vi.fn()
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("calls onClose when the overlay backdrop is clicked", () => {
    const onClose = vi.fn()
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={onClose}
      />,
    )
    // The overlay div carries data-testid="ext-agent-install-dialog".
    fireEvent.click(screen.getByTestId("ext-agent-install-dialog"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("auto-closes when the parent reports the agent is now installed (resolved=true)", () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={onClose}
        resolved={false}
      />,
    )
    expect(onClose).not.toHaveBeenCalled()
    rerender(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="not-installed"
        onRetry={vi.fn()}
        onClose={onClose}
        resolved={true}
      />,
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders the unknown body copy when installState is 'unknown'", () => {
    render(
      <ExtAgentSwitcherInstallDialog
        agentId="codex"
        agentName="Codex"
        installGuide={GUIDE}
        installState="unknown"
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Couldn't detect whether/)).toBeTruthy()
  })
})
