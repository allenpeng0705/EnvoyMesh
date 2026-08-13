/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { KnowledgePluginsPanel } from "../../src/components/views/KnowledgePluginsPanel.js";

const { listKbPlugins } = vi.hoisted(() => ({
  listKbPlugins: vi.fn(),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listKbPlugins,
    activateKbPlugin: vi.fn().mockResolvedValue({ ok: true }),
    deactivateKbPlugin: vi.fn().mockResolvedValue({ ok: true }),
    updateNodeConfig: vi.fn().mockResolvedValue(undefined),
    discoverObsidianVaults: vi.fn().mockResolvedValue({ paths: [], sources: [] }),
    openDesktopApp: vi.fn().mockResolvedValue({ ok: true }),
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: {
      aiSettings: {
        knowledgeBase: { enabled: true, externalProvider: "none" },
      },
    },
    refreshNodeConfig: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string) => key,
}));

describe("KnowledgePluginsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listKbPlugins.mockResolvedValue([
      {
        pluginId: "obsidian",
        displayName: "Obsidian",
        status: "active",
        version: "1",
        description: "wiki",
      },
    ]);
  });

  it("renders Obsidian and Notion/MCP cards with collapsible help", async () => {
    render(<KnowledgePluginsPanel />);
    expect(screen.getByTestId("plugin-card-obsidian")).toBeTruthy();
    expect(screen.getByTestId("plugin-card-notion-mcp")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("knowledge.plugins.obsidianTagline")).toBeTruthy();
      expect(screen.getByText("knowledge.plugins.notionTagline")).toBeTruthy();
    });
    expect(screen.getAllByText("knowledge.plugins.showHelp").length).toBeGreaterThan(0);
    expect(screen.getByText("knowledge.plugins.obsidianInstall")).toBeTruthy();
    expect(screen.getByText("knowledge.plugins.notionInstall")).toBeTruthy();
    expect(screen.getByTestId("linked-obsidian-vault-paths")).toBeTruthy();
    expect(screen.getByTestId("linked-obsidian-vault-empty")).toBeTruthy();
    expect(screen.getByText("knowledge.plugins.linkedVaultAdd")).toBeTruthy();
    expect(screen.getByTestId("open-desktop-obsidian")).toBeTruthy();
    expect(screen.getByTestId("open-desktop-notion")).toBeTruthy();
    const obsidianFooter = screen
      .getByTestId("plugin-card-obsidian")
      .querySelector(".knowledge-plugin-card__footer");
    expect(obsidianFooter).toBeTruthy();
    expect(obsidianFooter?.querySelector('[data-testid="download-obsidian"]')).toBeTruthy();
    expect(
      (screen.getByTestId("download-obsidian") as HTMLAnchorElement).href,
    ).toContain("https://obsidian.md/download");
    expect(
      (screen.getByTestId("download-notion") as HTMLAnchorElement).href,
    ).toContain("https://www.notion.com/desktop");
  });

  it("opens and closes both Install & use sections together", async () => {
    const { container } = render(<KnowledgePluginsPanel />);
    const details = Array.from(
      container.querySelectorAll<HTMLDetailsElement>(
        "[data-testid='plugin-card-obsidian'] details, [data-testid='plugin-card-notion-mcp'] details",
      ),
    );
    expect(details.length).toBe(2);
    expect(details.every((d) => !d.open)).toBe(true);

    fireEvent.click(details[0]!.querySelector("summary")!);
    await waitFor(() => {
      expect(details.every((d) => d.open)).toBe(true);
    });

    fireEvent.click(details[1]!.querySelector("summary")!);
    await waitFor(() => {
      expect(details.every((d) => !d.open)).toBe(true);
    });
  });
});
