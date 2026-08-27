/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AgentNetworkProfilePanel } from "../../src/components/views/settings/AgentNetworkProfilePanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getNodeConfig = vi.fn();
const updateNodeConfig = vi.fn();
const showToast = vi.fn();

const nodeService = { getNodeConfig, updateNodeConfig };

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => nodeService,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast, toasts: [] }),
  useToastOptional: () => ({ showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentNetworkProfilePanel", () => {
  beforeEach(() => {
    getNodeConfig.mockResolvedValue({ agentNetworkProfile: undefined });
    updateNodeConfig.mockResolvedValue({});
  });

  it("saves a custom collaboration role via updateNodeConfig", async () => {
    renderWithI18n(<AgentNetworkProfilePanel enabled />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-network-custom-role-input")).toBeTruthy();
    });

    const input = screen.getByTestId("agent-network-custom-role-input");
    fireEvent.change(input, { target: { value: "qa_lead" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          agentNetworkProfile: expect.objectContaining({
            roles: ["custom:qa_lead"],
          }),
        }),
      );
    });

    await waitFor(() => {
      const select = screen.getByLabelText(/Collaboration role/i) as HTMLSelectElement;
      expect(select.value).toBe("custom:qa_lead");
      expect(screen.getByRole("option", { name: /qa lead/i })).toBeTruthy();
    });
  });

  it("toggles the MAP worker path (useMAP) and shows status", async () => {
    renderWithI18n(<AgentNetworkProfilePanel enabled />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-network-map-worker-path")).toBeTruthy();
    });

    const group = screen.getByTestId("agent-network-map-worker-path");
    const checkbox = within(group).getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ useMAP: true });
    });
    await waitFor(() => {
      expect(screen.getByText(/Status:.*primary/i)).toBeTruthy();
    });
  });

  it("hides the MAP worker path when the Ext Agent engine is selected", async () => {
    getNodeConfig.mockResolvedValue({
      agentNetworkProfile: undefined,
      agentNetworkWorkerEngine: "ext",
    });
    renderWithI18n(<AgentNetworkProfilePanel enabled />);

    await waitFor(() => {
      expect(screen.getByTestId("agent-network-worker-engine")).toBeTruthy();
    });

    expect(screen.queryByTestId("agent-network-map-worker-path")).toBeNull();
  });

  it("preserves and saves the Envoy Harness worker engine", async () => {
    getNodeConfig.mockResolvedValue({
      agentNetworkProfile: undefined,
      agentNetworkWorkerEngine: "envoy-harness",
    });
    renderWithI18n(<AgentNetworkProfilePanel enabled />);

    const select = await screen.findByLabelText(/Team job engine/i) as HTMLSelectElement;
    expect(select.value).toBe("envoy-harness");
    expect(screen.queryByTestId("agent-network-map-worker-path")).toBeNull();

    fireEvent.change(select, { target: { value: "openclaw" } });
    await waitFor(() => {
      expect(updateNodeConfig).toHaveBeenCalledWith({ agentNetworkWorkerEngine: "openclaw" });
    });
  });
});
