/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChainDefaultsPanel } from "../../src/components/views/settings/ChainDefaultsPanel.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const chainGetDefaults = vi.fn();
const chainSetDefaults = vi.fn();
const mockNodeService = { chainGetDefaults, chainSetDefaults };

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function renderPanel() {
  return render(
    <I18nTestProvider locale="en">
      <ChainDefaultsPanel />
    </I18nTestProvider>,
  );
}

describe("ChainDefaultsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainGetDefaults.mockResolvedValue({});
    chainSetDefaults.mockResolvedValue({});
  });
  afterEach(() => {
    cleanup();
  });

  it("renders the panel with default state", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    expect(screen.getByText(/Default settings for new agent chains/)).toBeDefined();
  });

  it("loads rebalancePolicy from chainGetDefaults on mount", async () => {
    chainGetDefaults.mockResolvedValueOnce({ defaults: { rebalancePolicy: "auto" } });
    renderPanel();
    // After load, the stall policy select should reflect "auto"
    await waitFor(() => {
      const select = screen.getByLabelText(/When a worker stalls/);
      expect((select as HTMLSelectElement).value).toBe("auto");
    });
  });

  it("preserves user-edited bid weights when chainGetDefaults returns", async () => {
    chainGetDefaults.mockResolvedValueOnce({ defaults: { rebalancePolicy: "auto" } });
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    // The user edits a bid weight input
    const costInput = screen.getByLabelText(/Cost \(%\)/);
    fireEvent.change(costInput, { target: { value: "50" } });
    // The state update should be reflected
    expect((costInput as HTMLInputElement).value).toBe("50");
  });

  it("save calls chainSetDefaults with only the rebalancePolicy", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    const saveBtn = screen.getByRole("button", { name: /Save Rebalance Policy/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(chainSetDefaults).toHaveBeenCalledWith({
        defaults: { rebalancePolicy: "manual" },
      });
    });
  });

  it("shows weight validation error when bid weights do not sum to 100", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    // Change one weight so the sum is no longer 100
    const costInput = screen.getByLabelText(/Cost \(%\)/);
    fireEvent.change(costInput, { target: { value: "10" } });
    await waitFor(() => {
      expect(screen.getByText(/Weights must sum to 100%/)).toBeDefined();
    });
  });

  it("disables the save button when weights are invalid", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    const costInput = screen.getByLabelText(/Cost \(%\)/);
    fireEvent.change(costInput, { target: { value: "10" } });
    const saveBtn = screen.getByRole("button", { name: /Save Rebalance Policy/ }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("shows error state when chainSetDefaults rejects", async () => {
    chainSetDefaults.mockRejectedValueOnce(new Error("rpc failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Chain Defaults")).toBeDefined();
    });
    const saveBtn = screen.getByRole("button", { name: /Save Rebalance Policy/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
    consoleErrorSpy.mockRestore();
  });
});
