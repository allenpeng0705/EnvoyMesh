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
      // New empty state invites the user to click "New chain"
      expect(screen.getByText(/No active chains yet/)).toBeDefined();
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
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/\$1\.50/)).toBeDefined();
    });
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
        },
      ],
    });
    chainCancel.mockResolvedValueOnce({ chainId: "chain_cancel_001", cancelled: [] });
    renderChainsView();

    await waitFor(() => {
      expect(screen.getByText(/\$0\.50/)).toBeDefined();
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
