/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChainDetailPanel } from "../../src/components/ChainDetailPanel.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const chainGetState = vi.fn();
const chainResolveIteration = vi.fn();

const mockNodeService = {
  chainGetState,
  chainResolveIteration,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function renderPanel() {
  return render(
    <I18nTestProvider locale="en">
      <ToastProvider>
        <ChainDetailPanel chainId="chain_owner_1" onBack={() => undefined} />
      </ToastProvider>
    </I18nTestProvider>,
  );
}

describe("ChainDetailPanel iteration owner surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows ask_owner actions and resolves stop", async () => {
    chainGetState.mockResolvedValue({
      chainId: "chain_owner_1",
      chainMandateId: "m1",
      subtaskCount: 1,
      awardedCount: 1,
      partialCount: 1,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 10,
      showCostUi: false,
      iteration: {
        round: 1,
        maxRounds: 2,
        extendsInRound: 0,
        maxExtendsInRound: 2,
        waitingForOwner: true,
        drafts: [{ round: 1, summary: "Draft summary for owner" }],
      },
    });
    chainResolveIteration.mockResolvedValue({ ok: true, published: true });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chain-iteration-owner")).toBeDefined();
    });
    expect(screen.getByText(/Draft summary for owner/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Accept & publish/i }));
    await waitFor(() => {
      expect(chainResolveIteration).toHaveBeenCalledWith({
        chainId: "chain_owner_1",
        decision: "stop",
      });
    });
  });

  it("shows continue action and resolves continue", async () => {
    chainGetState.mockResolvedValue({
      chainId: "chain_owner_1",
      chainMandateId: "m1",
      subtaskCount: 1,
      awardedCount: 1,
      partialCount: 1,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 10,
      showCostUi: false,
      iteration: {
        round: 1,
        maxRounds: 2,
        extendsInRound: 0,
        maxExtendsInRound: 2,
        waitingForOwner: true,
        drafts: [{ round: 1, summary: "Draft summary for owner" }],
      },
    });
    chainResolveIteration.mockResolvedValue({ ok: true, continued: true });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chain-iteration-owner")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue refining/i }));
    await waitFor(() => {
      expect(chainResolveIteration).toHaveBeenCalledWith({
        chainId: "chain_owner_1",
        decision: "continue",
      });
    });
  });

  it("shows assignment mode and plan warnings from chainGetState", async () => {
    chainGetState.mockResolvedValue({
      chainId: "chain_owner_1",
      chainMandateId: "m1",
      subtaskCount: 1,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 10,
      showCostUi: false,
      assignmentMode: "role",
      planWarnings: [
        {
          code: "role_substitute",
          message: "No tester — used programmer",
          assignKind: "role_substitute",
        },
      ],
    });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByTestId("chain-detail-assignment-mode")).toBeDefined();
    });
    expect(screen.getByTestId("chain-detail-assignment-mode").textContent).toMatch(
      /Role-based/i,
    );
    expect(screen.getByTestId("chain-detail-plan-warnings").textContent).toMatch(
      /No tester/,
    );
  });
});
