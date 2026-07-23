/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChainsView } from "../../src/components/views/ChainsView.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

export const chainListActive = vi.fn();
export const chainCancel = vi.fn();

const mockNodeService = {
  chainListActive,
  chainCancel,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function renderChainsView() {
  return render(
    <I18nTestProvider locale="en">
      <ToastProvider>
        <ChainsView />
      </ToastProvider>
    </I18nTestProvider>,
  );
}

describe("ChainsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows empty state when no chains are active", async () => {
    chainListActive.mockResolvedValueOnce({ chains: [] });
    renderChainsView();
    await waitFor(() => {
      // New empty state invites the user to click "New team job"
      expect(screen.getByText(/No active team jobs yet/)).toBeDefined();
      expect(screen.getByText(/solo node cannot run multi-agent/i)).toBeDefined();
      expect(screen.getByText(/Join Agent Network/i)).toBeDefined();
    });
  });

  it("renders active chains with budget info", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_test_001",
          chainMandateId: "mandate_001",
          subtaskCount: 3,
          awardedCount: 2,
          partialCount: 1,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 1.5,
          budgetMaxUsd: 10,
          showCostUi: true,
          awardMode: "competitive",
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/\$1\.50/)).toBeDefined();
    });
  });

  it("shows iteration progress and awaiting-owner status", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_iter_001",
          chainMandateId: "mandate_001",
          goal: "Iterate me",
          subtaskCount: 2,
          awardedCount: 2,
          partialCount: 2,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 1,
          budgetMaxUsd: 10,
          showCostUi: false,
          iteration: {
            round: 1,
            maxRounds: 2,
            extendsInRound: 1,
            maxExtendsInRound: 2,
            waitingForOwner: true,
            drafts: [{ round: 1, summary: "draft one" }],
          },
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByTestId("chain-iteration-progress")).toBeDefined();
      expect(screen.getByText(/Round 1\/2/)).toBeDefined();
      expect(screen.getByText(/Awaiting your decision/i)).toBeDefined();
    });
  });

  it("hides budget spend in direct mode", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_direct_001",
          chainMandateId: "mandate_001",
          subtaskCount: 2,
          awardedCount: 1,
          partialCount: 0,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 1.5,
          budgetMaxUsd: 10,
          awardMode: "direct",
          showCostUi: false,
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/Assigning|Running/i)).toBeDefined();
    });
    expect(screen.queryByText(/\$1\.50/)).toBeNull();
  });

  it("shows Waiting for workers instead of Bidding when no awards and no bids", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_solo_001",
          chainMandateId: "mandate_001",
          subtaskCount: 2,
          awardedCount: 0,
          partialCount: 0,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 0,
          budgetMaxUsd: 10,
          bidsBySubtask: [],
          awardMode: "direct",
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/Waiting for workers/i)).toBeDefined();
    });
    expect(screen.queryByText(/^Bidding$/i)).toBeNull();
  });

  it("calls chainCancel when confirm dialog is accepted", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_cancel_001",
          chainMandateId: "mandate_001",
          subtaskCount: 2,
          awardedCount: 1,
          partialCount: 0,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 0.5,
          budgetMaxUsd: 10,
          awardMode: "direct",
          showCostUi: false,
        },
      ],
    });
    chainCancel.mockResolvedValueOnce({ chainId: "chain_cancel_001", cancelled: [] });
    renderChainsView();

    await waitFor(() => {
      expect(screen.getByText(/1\/1 of 2 subtasks|Assigning|Running/i)).toBeDefined();
    });

    // Click the Cancel button on the active chain card
    const cancelBtns = document.querySelectorAll("button");
    const cancelBtn = Array.from(cancelBtns).find((b) => b.textContent === "Cancel");
    expect(cancelBtn).toBeTruthy();
    cancelBtn && fireEvent.click(cancelBtn);

    // ConfirmDialog should now be rendered — scope to the alertdialog so
    // the trigger "Cancel" button on the chain card is not matched. The
    // dialog's confirm button is labeled with `chains.active.cancel` so
    // it also reads "Cancel"; the alertdialog is the unique structural
    // anchor that distinguishes the two.
    const dialog = await screen.findByRole("alertdialog");
    const dialogCancelBtns = within(dialog).getAllByRole("button", { name: "Cancel" });
    // The confirm button is the rightmost action inside the dialog
    expect(dialogCancelBtns.length).toBe(2);
    const confirmBtn = dialogCancelBtns[dialogCancelBtns.length - 1];
    if (!confirmBtn) throw new Error("ConfirmDialog confirm button not found");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(chainCancel).toHaveBeenCalledWith({
        chainId: "chain_cancel_001",
        reason: "Cancelled by owner",
        cancelledBy: "owner",
      });
    });
  });

  it("renders completed chains with published badge", async () => {
    chainListActive.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_done",
          chainMandateId: "mandate_done",
          subtaskCount: 2,
          awardedCount: 2,
          partialCount: 2,
          cancelledCount: 0,
          chainCancelled: false,
          published: true,
          budgetSpentUsd: 3.0,
          budgetMaxUsd: 5,
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/Published/)).toBeDefined();
    });
  });
});
