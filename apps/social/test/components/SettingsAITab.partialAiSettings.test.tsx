/** @vitest-environment jsdom */
/**
 * Regression: partial aiSettings (missing rules) used to crash Settings → AI on render.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SettingsAITab } from "../../src/components/views/SettingsAITab.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const refreshNodeConfig = vi.fn().mockResolvedValue(undefined);
const updateNodeConfig = vi.fn().mockResolvedValue(undefined);
const on = vi.fn(() => () => {});

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn() }),
  useToastOptional: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    updateNodeConfig,
    getOpenClawStatus: vi.fn().mockResolvedValue({ enabled: true, running: false, url: "" }),
    getPiStatus: vi.fn().mockResolvedValue({ enabled: false, state: "disabled" }),
    restartPi: vi.fn(),
    getRagIndexStatus: vi.fn().mockResolvedValue(null),
    getAgentIdentity: vi.fn().mockResolvedValue({ content: "", updatedAt: null }),
    getEnvoyLocalStatus: vi.fn().mockResolvedValue({
      enabled: false,
      running: false,
      phase: "disabled",
      runtimeInstalled: false,
      endpoint: "http://127.0.0.1:18790/v1",
      port: 18790,
      serverParams: { ctxSize: 4096, nGpuLayers: "auto", parallel: 1 },
    }),
    listEnvoyLocalInstalledModels: vi.fn().mockResolvedValue([]),
    searchEnvoyLocalModels: vi.fn().mockResolvedValue({ models: [] }),
    checkEnvoyLocalEngineUpdate: vi.fn().mockResolvedValue({
      pinnedVersion: "b0",
      updateAvailable: false,
    }),
    on,
    isConnected: true,
  }),
  useModelProviderUiScope: () => "full",
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    // Intentionally incomplete — missing rules / nested defaults.
    nodeConfig: {
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      openclawEnabled: true,
      aiSettings: {
        status: { onlineAssistantEnabled: true },
        identity: { mode: "transparent" },
      },
    },
    refreshNodeConfig,
    bridgeStatus: null,
  }),
}));

describe("SettingsAITab — partial aiSettings", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders without crashing when aiSettings.rules is missing", async () => {
    render(
      <I18nTestProvider>
        <SettingsAITab />
      </I18nTestProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("envoy-local-settings")).toBeTruthy();
    });
  });
});
