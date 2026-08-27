/**
 * @vitest-environment jsdom
 *
 * Tests for the rewritten ChainDefaultsPanel — every field shown now
 * persists via chainSetDefaults (the old non-persisting bid-weights UI
 * was removed). Verifies load, edit, save, and error states.
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
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    expect(screen.getByText(/Default settings for new team jobs/)).toBeDefined();
  });

  it("loads rebalancePolicy from chainGetDefaults on mount", async () => {
    chainGetDefaults.mockResolvedValueOnce({ defaults: { rebalancePolicy: "auto" } });
    renderPanel();
    await waitFor(() => {
      const select = screen.getByLabelText(/When a worker stalls/);
      expect((select as HTMLSelectElement).value).toBe("auto");
    });
  });

  it("loads all persistent fields from chainGetDefaults on mount", async () => {
    chainGetDefaults.mockResolvedValueOnce({
      defaults: {
        rebalancePolicy: "auto",
        stallTimeoutMs: 30_000,
        maxAutoRebalances: 5,
        autoRebalanceIncrementUsd: 3,
        lowConfidenceThreshold: 0.3,
        allowLlmDecompose: true,
      },
    });
    renderPanel();
    await waitFor(() => {
      const stallTimeout = screen.getByLabelText(/Stall timeout/) as HTMLInputElement;
      expect(stallTimeout.value).toBe("30000");
      const maxRebalances = screen.getByLabelText(/Max auto-rebalances/) as HTMLInputElement;
      expect(maxRebalances.value).toBe("5");
    });
  });

  it("save calls chainSetDefaults with all persistent fields", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    const saveBtn = screen.getByRole("button", { name: /Save defaults/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(chainSetDefaults).toHaveBeenCalledTimes(1);
      const call = chainSetDefaults.mock.calls[0][0];
      expect(call.defaults.rebalancePolicy).toBe("never"); // default
      expect(call.defaults.stallTimeoutMs).toBeDefined();
      expect(call.defaults.maxAutoRebalances).toBeDefined();
      expect(call.defaults.allowLlmDecompose).toBeDefined();
    });
  });

  it("reflects edited rebalancePolicy in the save call", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    const select = screen.getByLabelText(/When a worker stalls/) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "never" } });
    const saveBtn = screen.getByRole("button", { name: /Save defaults/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(chainSetDefaults).toHaveBeenCalledWith(
        expect.objectContaining({
          defaults: expect.objectContaining({ rebalancePolicy: "never" }),
        }),
      );
    });
  });

  it("toggles allowLlmDecompose and persists it", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    const llmToggle = screen.getByLabelText(/Allow LLM task decomposition/);
    fireEvent.click(llmToggle);
    const saveBtn = screen.getByRole("button", { name: /Save defaults/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const call = chainSetDefaults.mock.calls[0][0];
      expect(call.defaults.allowLlmDecompose).toBe(true);
    });
  });

  it("shows saved state after successful save", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    const saveBtn = screen.getByRole("button", { name: /Save defaults/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeDefined();
    });
  });

  it("shows error state when chainSetDefaults rejects", async () => {
    chainSetDefaults.mockRejectedValueOnce(new Error("rpc failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Team job defaults")).toBeDefined();
    });
    const saveBtn = screen.getByRole("button", { name: /Save defaults/ });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeDefined();
    });
    consoleErrorSpy.mockRestore();
  });
});
