/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { SettingsAITab } from "../../src/components/views/SettingsAITab.js";

const updateNodeConfig = vi.fn();
const refreshNodeConfig = vi.fn();
const getRagIndexStatus = vi.fn().mockResolvedValue(null);
const getAgentIdentity = vi.fn().mockResolvedValue({ content: "", updatedAt: null });
const updateAgentIdentity = vi.fn().mockResolvedValue({ content: "", updatedAt: null });
const getOpenClawStatus = vi.fn();
const getBridgeStatus = vi.fn();
const getBridgeConfig = vi.fn();
const updateBridgeConfig = vi.fn();
const probeExtAgents = vi.fn();
const on = vi.fn(() => () => {});

let nodeConfig: { bridgeEnabled?: boolean; openclawEnabled?: boolean; chatAssistEnabled?: boolean; modelProviders?: { mode: "disabled" } } = {
  bridgeEnabled: true,
  openclawEnabled: true,
  chatAssistEnabled: false,
  modelProviders: { mode: "disabled" },
};

const nodeServiceApi = {
  updateNodeConfig,
  getRagIndexStatus,
  getAgentIdentity,
  updateAgentIdentity,
  getOpenClawStatus,
  getBridgeStatus,
  getBridgeConfig,
  updateBridgeConfig,
  probeExtAgents,
  on,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => nodeServiceApi,
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
    bridgeEnabled: true,
    openclawEnabled: true,
    chatAssistEnabled: false,
    modelProviders: { mode: "disabled" },
  };
  updateNodeConfig.mockResolvedValue(undefined);
  refreshNodeConfig.mockResolvedValue(undefined);
  getOpenClawStatus.mockResolvedValue({
    enabled: true,
    running: true,
    url: "http://127.0.0.1:18789/webhook/envoymesh",
  });
  getBridgeStatus.mockResolvedValue({
    enabled: true,
    agentPeerId: "envoy_agent_test",
    agentUrl: "http://127.0.0.1:8010/message",
    listenPort: 3031,
    agentName: "HomeClaw",
    activeExtAgentId: "homeclaw",
    adapter: "envoymesh-message",
    agentType: "external",
  });
  getBridgeConfig.mockResolvedValue({
    enabled: true,
    listenPort: 3031,
    activeExtAgent: "homeclaw",
    activeExtAgentId: "homeclaw",
    agentUrl: "http://127.0.0.1:8010/message",
    agentName: "HomeClaw",
    adapter: "envoymesh-message",
    extAgents: [
      {
        id: "homeclaw",
        name: "HomeClaw",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8010/message",
        enabled: true,
      },
      {
        id: "hermes",
        name: "Hermes",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8020/message",
        enabled: true,
      },
    ],
  });
  updateBridgeConfig.mockResolvedValue({ ok: true });
  probeExtAgents.mockResolvedValue({
    activeExtAgentId: "homeclaw",
    activeHealthy: true,
    entries: [
      {
        id: "homeclaw",
        name: "HomeClaw",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8010/message",
        enabled: true,
        healthy: true,
        reachability: "running",
      },
      {
        id: "hermes",
        name: "Hermes",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8020/message",
        enabled: true,
        healthy: false,
        reachability: "stopped",
      },
    ],
  });
});

describe("SettingsAITab — Ext Agent multi-agent (phase 44)", () => {
  it("quick-switches active backend from the read-only dropdown", async () => {
    renderWithI18n(<SettingsAITab />);

    await waitFor(() => expect(probeExtAgents).toHaveBeenCalled());
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hermes" } });

    await waitFor(() => {
      expect(updateBridgeConfig).toHaveBeenCalledWith({ activeExtAgent: "hermes" });
    });
  });

  it("shows reachability in the registry table", async () => {
    renderWithI18n(<SettingsAITab />);
    await waitFor(() => expect(probeExtAgents).toHaveBeenCalled());
    const table = await screen.findByRole("table");
    expect(table.textContent).toMatch(/Running/);
    expect(table.textContent).toMatch(/Stopped/);
  });

  it("switches via Configure + Save in edit mode", async () => {
    renderWithI18n(<SettingsAITab />);

    await waitFor(() => expect(getBridgeConfig).toHaveBeenCalled());
    const table = await screen.findByRole("table");
    expect(table.textContent).toMatch(/Hermes/);

    fireEvent.click(screen.getByText(/^Configure$/));
    const select = await screen.findByRole("combobox", { name: /Active backend/i }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "hermes" } });
    fireEvent.click(screen.getByText(/^Save$/));

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ bridgeEnabled: true });
      expect(updateBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          activeExtAgent: "hermes",
        }),
      );
    });
  });

  it("surfaces updateBridgeConfig failure to the console caller", async () => {
    updateBridgeConfig.mockResolvedValue({ ok: false, reason: "invalid config" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithI18n(<SettingsAITab />);
    await waitFor(() => expect(getBridgeConfig).toHaveBeenCalled());

    fireEvent.click(await screen.findByText(/^Configure$/));
    fireEvent.click(screen.getByText(/^Save$/));

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });
});
