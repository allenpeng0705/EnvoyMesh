/**
 * @vitest-environment jsdom
 *
 * Residual risk: step cancel must not toast success when home returns
 * `{ cancelled: [] }` (missing / already-finalized chain).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChainDetailPanel } from "../../src/components/ChainDetailPanel.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const chainGetState = vi.fn();
const chainCancel = vi.fn();
const chainReassignSubtask = vi.fn();

const mockNodeService = {
  chainGetState,
  chainCancel,
  chainReassignSubtask,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function liveState() {
  return {
    chainId: "chain_owner_1",
    chainMandateId: "m1",
    subtaskCount: 1,
    awardedCount: 1,
    partialCount: 0,
    cancelledCount: 0,
    chainCancelled: false,
    published: false,
    budgetSpentUsd: 0,
    budgetMaxUsd: 10,
    showCostUi: false,
    goal: "Do the thing",
    steps: [
      {
        subtaskId: "sub_1",
        objective: "Write the summary",
        state: "running",
        dependsOn: [],
      },
    ],
  };
}

function renderPanel() {
  return render(
    <I18nTestProvider locale="en">
      <ToastProvider>
        <ChainDetailPanel chainId="chain_owner_1" onBack={() => undefined} />
      </ToastProvider>
    </I18nTestProvider>,
  );
}

describe("ChainDetailPanel step cancel residual risk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chainGetState.mockResolvedValue(liveState());
  });
  afterEach(() => {
    cleanup();
  });

  it("does not toast success when cancelled list omits the subtask", async () => {
    chainCancel.mockResolvedValue({ chainId: "chain_owner_1", cancelled: [] });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chain-step-cancel-sub_1")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("chain-step-cancel-sub_1"));

    await waitFor(() => {
      expect(chainCancel).toHaveBeenCalledWith({
        chainId: "chain_owner_1",
        subtaskId: "sub_1",
        reason: "owner_cancel_step",
        cancelledBy: "owner",
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Could not cancel this step/i)).toBeDefined();
    });
    expect(screen.queryByText(/^Step cancelled$/i)).toBeNull();
  });

  it("toasts success when cancelled includes the subtask", async () => {
    chainCancel.mockResolvedValue({
      chainId: "chain_owner_1",
      cancelled: ["sub_1"],
    });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chain-step-cancel-sub_1")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("chain-step-cancel-sub_1"));

    await waitFor(() => {
      expect(screen.getByText(/^Step cancelled$/i)).toBeDefined();
    });
  });
});
