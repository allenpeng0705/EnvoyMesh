/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { ExtAgentInstallGuideCard } from "../../src/components/ExtAgentInstallGuideCard.js"
import type { ExtAgentInstallGuide } from "@envoymesh/api"

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => fallback ?? key,
}))

const SAMPLE_GUIDE: ExtAgentInstallGuide = {
  agentId: "codex",
  installed: false,
  command: "codex",
  installCommand: "npm install -g @openai/codex",
  verifyCommand: "codex --version",
  startHint: "Install the Codex CLI...",
  homepageUrl: "https://github.com/openai/codex",
  homepageLabel: "Codex on GitHub",
  commonIssues: [
    "Set OPENAI_API_KEY in your shell before running codex.",
    "If `codex app-server` fails, run `codex --version` to confirm the CLI is on PATH.",
  ],
}

describe("ExtAgentInstallGuideCard (Phase 55D.1)", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("renders install command, verify command, docs link, and common issues", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
      />,
    )
    const card = screen.getByTestId("ext-agent-install-card")
    expect(card).toBeTruthy()
    expect(card.getAttribute("data-agent-id")).toBe("codex")
    expect(card.getAttribute("data-install-state")).toBe("not-installed")
    expect(screen.getByTestId("ext-agent-install-card-install-cmd").textContent).toBe(
      "npm install -g @openai/codex",
    )
    expect(screen.getByTestId("ext-agent-install-card-verify-cmd").textContent).toBe(
      "codex --version",
    )
    const docs = screen.getByTestId("ext-agent-install-card-docs")
    expect(docs.getAttribute("href")).toBe("https://github.com/openai/codex")
    expect(docs.getAttribute("target")).toBe("_blank")
    expect(docs.getAttribute("rel")).toBe("noopener noreferrer")
    const issues = screen.getByTestId("ext-agent-install-card-issues")
    expect(issues.textContent).toContain("OPENAI_API_KEY")
    expect(issues.textContent).toContain("codex --version")
  })

  it("renders the notInstalledBody when installState is 'not-installed'", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
      />,
    )
    const body = screen.getByText(/isn't on this machine yet/)
    expect(body).toBeTruthy()
    expect(body.textContent).toContain("codex")
  })

  it("renders the unknownBody when installState is 'unknown'", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="unknown"
      />,
    )
    const body = screen.getByText(/Couldn't detect whether/)
    expect(body).toBeTruthy()
    expect(body.textContent).toContain("codex")
  })

  it("copies the install command to clipboard on Copy click and shows Copied label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    ;(navigator as unknown as { clipboard: { writeText: typeof writeText } }).clipboard = {
      writeText,
    }
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
      />,
    )
    const copy = screen.getByTestId("ext-agent-install-card-copy")
    expect(copy.textContent).toBe("Copy")
    fireEvent.click(copy)
    expect(writeText).toHaveBeenCalledWith("npm install -g @openai/codex")
    // After click, the label should flip to "Copied" once the
    // awaited `writeText` resolves. waitFor handles the async update.
    await waitFor(() => {
      expect(copy.textContent).toBe("Copied")
    })
  })

  it("returns null (renders nothing) when the agent is already installed", () => {
    const { container } = render(
      <ExtAgentInstallGuideCard
        agentId="pi"
        installGuide={{ ...SAMPLE_GUIDE, agentId: "pi", installed: true }}
        installState="installed"
      />,
    )
    expect(container.querySelector("[data-testid='ext-agent-install-card']")).toBeNull()
  })

  it("shows the Retry / Dismiss buttons when their handlers are provided", () => {
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />,
    )
    const retry = screen.getByTestId("ext-agent-install-card-retry")
    const dismiss = screen.getByTestId("ext-agent-install-card-dismiss")
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledTimes(1)
    fireEvent.click(dismiss)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("hides the Retry / Dismiss buttons when their handlers are not provided", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
      />,
    )
    expect(screen.queryByTestId("ext-agent-install-card-retry")).toBeNull()
    expect(screen.queryByTestId("ext-agent-install-card-dismiss")).toBeNull()
  })

  it("renders without a docs link when homepageUrl is missing", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={{ ...SAMPLE_GUIDE, homepageUrl: undefined }}
        installState="not-installed"
      />,
    )
    expect(screen.queryByTestId("ext-agent-install-card-docs")).toBeNull()
  })

  it("renders without commonIssues when the list is empty", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={{ ...SAMPLE_GUIDE, commonIssues: [] }}
        installState="not-installed"
      />,
    )
    expect(screen.queryByTestId("ext-agent-install-card-issues")).toBeNull()
  })

  it("accepts a custom testId prefix", () => {
    render(
      <ExtAgentInstallGuideCard
        agentId="codex"
        installGuide={SAMPLE_GUIDE}
        installState="not-installed"
        testId="custom-card"
      />,
    )
    expect(screen.getByTestId("custom-card")).toBeTruthy()
    expect(screen.getByTestId("custom-card-install-cmd").textContent).toBe(
      "npm install -g @openai/codex",
    )
  })
})
