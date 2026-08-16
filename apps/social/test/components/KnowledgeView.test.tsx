/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KnowledgeView } from "../../src/components/views/KnowledgeView.js";
import { OPEN_ENVOY_AI_EVENT, takeEnvoyAiDraftHint } from "../../src/lib/open-envoy-ai-nav.js";

const {
  knowledgeQuery,
  listKbPlugins,
  activateKbPlugin,
  getEnvoyLocalEmbedStatus,
  enableEnvoyLocalEmbed,
} = vi.hoisted(() => ({
  knowledgeQuery: vi.fn().mockResolvedValue("vault says hello"),
  listKbPlugins: vi.fn().mockResolvedValue([
    { pluginId: "obsidian", displayName: "Obsidian", status: "registered", version: "1" },
  ]),
  activateKbPlugin: vi.fn().mockResolvedValue({ ok: true }),
  getEnvoyLocalEmbedStatus: vi.fn().mockResolvedValue({
    running: true,
    phase: "ready",
    endpoint: "http://127.0.0.1:18791",
    activeModelId: "qwen3-embedding-0.6b-q8_0",
  }),
  enableEnvoyLocalEmbed: vi.fn().mockResolvedValue({
    running: false,
    phase: "downloading-model",
    operationInProgress: true,
    download: { label: "Downloading model", fraction: 0.1 },
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    knowledgeQuery,
    listKbPlugins,
    activateKbPlugin,
    deactivateKbPlugin: vi.fn().mockResolvedValue({ ok: true }),
    updateNodeConfig: vi.fn().mockResolvedValue(undefined),
    getEnvoyLocalEmbedStatus,
    enableEnvoyLocalEmbed,
    stopEnvoyLocalEmbed: vi.fn().mockResolvedValue({ running: false, phase: "idle" }),
    on: () => () => {},
    getRagIndexStatus: vi.fn().mockResolvedValue(null),
    listAllLocalFiles: vi.fn().mockResolvedValue({ items: [] }),
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { aiSettings: { knowledgeBase: { enabled: true } } },
    refreshNodeConfig: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => {
    const map: Record<string, string> = {
      "knowledge.title": "Knowledge",
      "knowledge.lede": "Lede",
      "knowledge.panelsAria": "Panels",
      "knowledge.panelBrowse": "Browse",
      "knowledge.panelPlugins": "Plugins",
      "knowledge.panelSetup": "Setup",
      "knowledge.askHeading": "Ask your vault",
      "knowledge.askHint": "Ask hint",
      "knowledge.askLabel": "Question",
      "knowledge.askPlaceholder": "Ask…",
      "knowledge.askSubmit": "Ask",
      "knowledge.askBusy": "Searching…",
      "knowledge.askAnswerHeading": "Answer",
      "knowledge.askContinueEnvoyAi": "Open in EnvoyAI",
      "knowledge.libraryHeading": "Your files",
      "knowledge.libraryCaption": "Notes and documents",
      "knowledge.setupHint": "Setup hint",
      "knowledge.plugins.obsidianAutoFail": "Auto fail",
      "knowledge.embedGate.titleNeeded": "Embedding model required",
      "knowledge.embedGate.bodyNeeded": "Need embed",
      "knowledge.embedGate.download": "Download embedding model",
      "knowledge.embedGate.openSetup": "Open Setup",
      "knowledge.embedGate.stripNeeded": "Knowledge unavailable",
      "knowledge.embedGate.downloadStartedToast": "Download started",
      "knowledge.embedGate.blockedToast": "Blocked",
      "settings.ai.rag.heading": "KB",
      "settings.ai.rag.sectionDesc": "KB desc",
      "library.hint": "Browse hint",
    };
    return map[key] ?? fallback ?? key;
  },
}));

vi.mock("../../src/components/views/LibraryView.js", () => ({
  LibraryView: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="library-stub">{embedded ? "embedded" : "standalone"}</div>
  ),
}));

vi.mock("../../src/components/views/KnowledgePluginsPanel.js", () => ({
  KnowledgePluginsPanel: () => <div data-testid="plugins-panel-stub" />,
}));

vi.mock("../../src/components/views/SettingsAITab.js", () => ({
  KnowledgeBaseSettings: () => <div data-testid="kb-settings-stub" />,
}));

describe("KnowledgeView", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    knowledgeQuery.mockClear();
    listKbPlugins.mockClear();
    activateKbPlugin.mockClear();
    getEnvoyLocalEmbedStatus.mockClear();
    enableEnvoyLocalEmbed.mockClear();
    knowledgeQuery.mockResolvedValue("vault says hello");
    listKbPlugins.mockResolvedValue([
      { pluginId: "obsidian", displayName: "Obsidian", status: "registered", version: "1" },
    ]);
    activateKbPlugin.mockResolvedValue({ ok: true });
    getEnvoyLocalEmbedStatus.mockResolvedValue({
      running: true,
      phase: "ready",
      endpoint: "http://127.0.0.1:18791",
      activeModelId: "qwen3-embedding-0.6b-q8_0",
    });
  });

  it("defaults to Browse with Ask embedded and auto-activates Obsidian", async () => {
    render(<KnowledgeView />);
    expect(await screen.findByTestId("knowledge-browse")).toBeTruthy();
    expect(screen.getByTestId("knowledge-ask")).toBeTruthy();
    expect(screen.getByTestId("library-stub").textContent).toBe("embedded");
    expect(screen.queryByTestId("knowledge-panel-ask")).toBeNull();
    await waitFor(() => {
      expect(activateKbPlugin).toHaveBeenCalledWith({ pluginId: "obsidian" });
    });
  });

  it("keeps Browse available when local embed is not ready (Ask stays gated)", async () => {
    getEnvoyLocalEmbedStatus.mockResolvedValue({
      running: false,
      phase: "idle",
      lastError: null,
    });
    render(<KnowledgeView />);
    expect(await screen.findByTestId("knowledge-browse")).toBeTruthy();
    expect(screen.getByTestId("knowledge-embed-strip")).toBeTruthy();
    expect(screen.queryByTestId("knowledge-embed-gate")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Ask" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // Opening Knowledge must NOT kick off enable — that is node/Tauri boot.
    await new Promise((r) => setTimeout(r, 50));
    expect(enableEnvoyLocalEmbed).not.toHaveBeenCalled();
  });

  it("runs knowledgeQuery from Browse Ask row", async () => {
    render(<KnowledgeView />);
    expect(await screen.findByTestId("knowledge-browse")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "what is onboarding?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => {
      expect(knowledgeQuery).toHaveBeenCalledWith("what is onboarding?");
    });
    expect(await screen.findByText("vault says hello")).toBeTruthy();
  });

  it("maps legacy ask initialPanel to Browse", async () => {
    render(<KnowledgeView initialPanel="ask" />);
    expect(await screen.findByTestId("knowledge-browse")).toBeTruthy();
    expect(screen.getByTestId("knowledge-panel-browse").getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("dispatches open EnvoyAI event from Ask handoff", async () => {
    const seen: unknown[] = [];
    const onOpen = (ev: Event) => {
      seen.push((ev as CustomEvent).detail);
    };
    window.addEventListener(OPEN_ENVOY_AI_EVENT, onOpen);
    render(<KnowledgeView />);
    expect(await screen.findByTestId("knowledge-browse")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Question"), {
      target: { value: "draft for envoy" },
    });
    fireEvent.click(screen.getByTestId("knowledge-ask-envoy-ai"));
    window.removeEventListener(OPEN_ENVOY_AI_EVENT, onOpen);
    expect(seen).toEqual([{ draftHint: "draft for envoy" }]);
    expect(takeEnvoyAiDraftHint()).toBe("draft for envoy");
  });

  it("shows Plugins panel", () => {
    render(<KnowledgeView initialPanel="plugins" />);
    expect(screen.getByTestId("plugins-panel-stub")).toBeTruthy();
  });

  it("shows Setup settings", () => {
    render(<KnowledgeView initialPanel="setup" />);
    expect(screen.getByTestId("knowledge-setup")).toBeTruthy();
  });
});
