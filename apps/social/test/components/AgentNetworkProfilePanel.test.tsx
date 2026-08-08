/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AgentNetworkProfilePanel } from "../../src/components/views/settings/AgentNetworkProfilePanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getNodeConfig = vi.fn();
const updateNodeConfig = vi.fn();
const showToast = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({ getNodeConfig, updateNodeConfig }),
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
});
