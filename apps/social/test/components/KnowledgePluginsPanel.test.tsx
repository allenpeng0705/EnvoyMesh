/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
  });
});
