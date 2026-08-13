/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { DEFAULT_DOCUMENT_AUTONOMY_POLICY } from "@envoymesh/api";
import { SettingsAITab } from "../../src/components/views/SettingsAITab.js";

const updateNodeConfig = vi.fn();
const refreshNodeConfig = vi.fn();
const getRagIndexStatus = vi.fn().mockResolvedValue(null);
const reindexRagKnowledge = vi.fn().mockResolvedValue(null);
const getAgentIdentity = vi.fn().mockResolvedValue({ content: "", updatedAt: null });
const updateAgentIdentity = vi.fn().mockResolvedValue({ content: "", updatedAt: null });
const on = vi.fn(() => () => {});

let nodeConfig: {
  aiSettings?: {
    status: { onlineAssistantEnabled: boolean; offlineAgentEnabled: boolean; statusMode: "automatic" };
    identity: { mode: "transparent" };
    defaultModeForNewContacts: "manual";
    rules: [];
    documentAutonomy?: typeof DEFAULT_DOCUMENT_AUTONOMY_POLICY;
  };
  chatAssistEnabled?: boolean;
  modelProviders?: { mode: "disabled" };
} = {
  aiSettings: {
    status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
    identity: { mode: "transparent" },
    defaultModeForNewContacts: "manual",
    rules: [],
    documentAutonomy: { ...DEFAULT_DOCUMENT_AUTONOMY_POLICY },
  },
  chatAssistEnabled: false,
  modelProviders: { mode: "disabled" },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    updateNodeConfig,
    getRagIndexStatus,
    reindexRagKnowledge,
    getAgentIdentity,
    updateAgentIdentity,
    getEnvoyLocalStatus: vi.fn().mockResolvedValue({
      enabled: false,
      running: false,
      phase: "disabled",
      runtimeInstalled: false,
      serverParams: {},
    }),
    listEnvoyLocalInstalledModels: vi.fn().mockResolvedValue([]),
    searchEnvoyLocalModels: vi.fn().mockResolvedValue({ models: [] }),
    checkEnvoyLocalEngineUpdate: vi.fn().mockResolvedValue({
      pinnedVersion: "b0",
      updateAvailable: false,
    }),
    on,
  }),
  useModelProviderUiScope: () => "full",
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig,
    refreshNodeConfig,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  nodeConfig = {
    aiSettings: {
      status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
      identity: { mode: "transparent" },
      defaultModeForNewContacts: "manual",
      rules: [],
      documentAutonomy: { ...DEFAULT_DOCUMENT_AUTONOMY_POLICY },
    },
    chatAssistEnabled: false,
    modelProviders: { mode: "disabled" },
  };
  updateNodeConfig.mockResolvedValue(undefined);
  refreshNodeConfig.mockResolvedValue(undefined);
});

describe("SettingsAITab — document autonomy", () => {
  it("updates share autonomy tier via updateNodeConfig", async () => {
    renderWithI18n(<SettingsAITab />);

    const shareTierSection = screen.getByText("Share autonomy tier").closest(".form-group");
    const tierSelect = within(shareTierSection as HTMLElement).getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(tierSelect, { target: { value: "2" } });

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({
        aiSettings: expect.objectContaining({
          documentAutonomy: expect.objectContaining({ maxAutonomousShareTier: 2 }),
        }),
      });
    });
    expect(refreshNodeConfig).toHaveBeenCalled();
  });

  it("toggles autonomous publish metadata via updateNodeConfig", async () => {
    renderWithI18n(<SettingsAITab />);

    const publishRow = screen.getByText("Autonomous publish metadata").closest(".settings-toggle-row");
    const toggle = within(publishRow as HTMLElement).getByRole("checkbox");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({
        aiSettings: expect.objectContaining({
          documentAutonomy: expect.objectContaining({ allowAutonomousPublish: true }),
        }),
      });
    });
  });
});
