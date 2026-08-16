/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { KnowledgeBaseSettings } from "../../src/components/views/SettingsAITab.js";
import { DEFAULT_AI_KNOWLEDGE_BASE } from "@envoymesh/api";

const listEnvoyLocalInstalledEmbedModels = vi.fn();
const setEnvoyLocalEmbedActiveModel = vi.fn();
const enableEnvoyLocalEmbed = vi.fn();
const getEnvoyLocalEmbedStatus = vi.fn();
const getEnvoyLocalStatus = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listEnvoyLocalInstalledEmbedModels,
    setEnvoyLocalEmbedActiveModel,
    enableEnvoyLocalEmbed,
    getEnvoyLocalEmbedStatus,
    getEnvoyLocalStatus,
    getRagIndexStatus: vi.fn(async () => ({
      progress: { phase: "idle", processed: 0, total: 0, updatedAt: new Date().toISOString() },
    })),
    on: vi.fn(() => () => undefined),
    reindexRagKnowledge: vi.fn(async () => undefined),
    listKbPlugins: vi.fn(async () => []),
  }),
  useModelProviderUiScope: () => "full",
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallbackOrParams?: string | Record<string, unknown>) => {
    if (typeof fallbackOrParams === "string") return fallbackOrParams;
    if (key === "settings.ai.rag.embeddingLocalModelInstalled") return "installed";
    if (key === "settings.ai.rag.embeddingLocalRefreshModels") return "Refresh embed models";
    if (key === "settings.ai.rag.embeddingLocalModelsFolder") return "Embed models folder";
    if (key === "settings.ai.rag.chatModelsFolder") return "Chat models folder";
    if (key === "settings.ai.rag.embeddingModel") return "Embedding model";
    if (key === "settings.ai.envoyLocal.activeBadge") return "Active";
    return key;
  },
}));

vi.mock("../../src/hooks/useEnvoyLocalEmbedReadiness.js", () => ({
  useEnvoyLocalEmbedReadiness: () => ({
    required: true,
    ready: true,
    blocked: false,
    kind: "ready",
    status: {
      enabled: true,
      running: true,
      phase: "ready",
      port: 18791,
      endpoint: "http://127.0.0.1:18791/v1",
      runtimeInstalled: true,
      activeModelId: "local:my-custom-embed",
      modelsDir: "/tmp/profile/envoy-local/embed-models",
      serverParams: {},
    },
    loadError: null,
    inFlight: false,
    refresh: vi.fn(async () => null),
    startDownload: enableEnvoyLocalEmbed,
    stop: vi.fn(async () => null),
  }),
  usesEnvoyLocalEmbed: () => true,
  isEmbedOperationInFlight: () => false,
}));

describe("KnowledgeBaseSettings embed model discovery", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listEnvoyLocalInstalledEmbedModels.mockReset();
    setEnvoyLocalEmbedActiveModel.mockReset();
    enableEnvoyLocalEmbed.mockReset();
    getEnvoyLocalEmbedStatus.mockReset();
    getEnvoyLocalStatus.mockReset();
    getEnvoyLocalStatus.mockResolvedValue({
      modelsDir: "/tmp/profile/envoy-local/models",
    });
    listEnvoyLocalInstalledEmbedModels.mockResolvedValue([
      {
        id: "local:my-custom-embed",
        fileName: "My-Custom-Embed.gguf",
        path: "/tmp/profile/envoy-local/embed-models/My-Custom-Embed.gguf",
        sizeBytes: 60_000_000,
        active: true,
      },
      {
        id: "qwen3-embedding-0.6b-q8_0",
        fileName: "Qwen3-Embedding-0.6B-Q8_0.gguf",
        path: "/tmp/profile/envoy-local/embed-models/Qwen3-Embedding-0.6B-Q8_0.gguf",
        sizeBytes: 639_000_000,
        active: false,
      },
    ]);
    setEnvoyLocalEmbedActiveModel.mockResolvedValue({
      enabled: true,
      running: true,
      phase: "ready",
      port: 18791,
      endpoint: "http://127.0.0.1:18791/v1",
      runtimeInstalled: true,
      activeModelId: "local:my-custom-embed",
      serverParams: {},
    });
    window.confirm = vi.fn(() => true);
  });

  it("lists discovered local embed models and shows drop folder", async () => {
    render(
      <KnowledgeBaseSettings
        value={{
          ...DEFAULT_AI_KNOWLEDGE_BASE,
          embedding: {
            mode: "envoy-local",
            modelName: "local:my-custom-embed",
          },
        }}
        onChange={async () => undefined}
      />,
    );

    expect(await screen.findByTestId("kb-chat-models-dir")).toBeTruthy();
    expect(screen.getByText(/\/tmp\/profile\/envoy-local\/models/)).toBeTruthy();
    expect(await screen.findByTestId("kb-embed-models-dir")).toBeTruthy();
    expect(screen.getByText(/\/tmp\/profile\/envoy-local\/embed-models/)).toBeTruthy();

    await waitFor(() => {
      expect(listEnvoyLocalInstalledEmbedModels).toHaveBeenCalled();
    });

    const select = await screen.findByTestId("kb-embed-model");
    expect(select.querySelector('option[value="local:my-custom-embed"]')).toBeTruthy();
    expect(select.querySelector('option[value="qwen3-embedding-0.6b-q8_0"]')?.textContent).toMatch(
      /installed/i,
    );
  });

  it("activates an installed model without calling enable download", async () => {
    const onChange = vi.fn(async () => undefined);
    render(
      <KnowledgeBaseSettings
        value={{
          ...DEFAULT_AI_KNOWLEDGE_BASE,
          embedding: {
            mode: "envoy-local",
            modelName: "qwen3-embedding-0.6b-q8_0",
          },
        }}
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(listEnvoyLocalInstalledEmbedModels).toHaveBeenCalled();
    });

    const select = (await screen.findAllByTestId("kb-embed-model"))[0]!;
    fireEvent.change(select, { target: { value: "local:my-custom-embed" } });

    await waitFor(() => {
      expect(setEnvoyLocalEmbedActiveModel).toHaveBeenCalledWith({
        modelId: "local:my-custom-embed",
      });
    });
    expect(enableEnvoyLocalEmbed).not.toHaveBeenCalled();
  });
});
