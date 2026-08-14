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
export const chainListObserved = vi.fn();
export const chainListReports = vi.fn();
export const chainDeleteReport = vi.fn();
export const chainCancel = vi.fn();

const chainGetDefaults = vi.fn(async () => ({
  defaults: { awardMode: "direct", showCostUi: false, iterationMaxRounds: 1, assignmentMode: "skill" },
}));

const mockNodeService = {
  chainListActive,
  chainListObserved,
  chainListReports,
  chainDeleteReport,
  chainCancel,
  chainGetDefaults,
  chainProbeReachability: vi.fn(async () => ({ rows: [] })),
  refreshAgentNetworkWorkers: vi.fn(async () => ({})),
  getLocalAgentNetworkWorkerCard: vi.fn(async () => undefined),
  getOpenClawStatus: vi.fn(async () => ({ running: false })),
  getNodeConfig: vi.fn(async () => ({})),
  updateNodeConfig: vi.fn(async () => ({})),
  isConnected: true,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/components/ChainStartDialog.js", () => ({
  ChainStartDialog: (props: {
    goal: string;
    displayGoal?: string;
    assignmentMode?: "skill" | "role";
    attachments?: Array<{ fileName: string; relativePath: string; label?: string }>;
  }) => (
    <div
      data-testid="chain-start-dialog-stub"
      data-assignment-mode={props.assignmentMode ?? ""}
      data-goal={props.goal}
      data-display-goal={props.displayGoal ?? ""}
      data-attachment-count={String(props.attachments?.length ?? 0)}
    />
  ),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useTransportWsOpen: () => true,
  useAgentCards: () => [],
  useIsInProcessMobileNode: () => false,
}));

// Stable references — a fresh `bonds: []` / `nodeConfig: {}` per call
// retriggers ChainsView reachability effects → infinite setState → OOM.
const mockNodeState = {
  bonds: [] as const,
  nodeConfig: { capabilityProviderEnabled: false },
  profile: null,
  refreshNodeConfig: () => undefined,
};
vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => mockNodeState,
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
    chainListObserved.mockResolvedValue({ chains: [] });
    chainListReports.mockResolvedValue({ reports: [] });
    chainDeleteReport.mockResolvedValue({ chainId: "", deleted: false });
  });
  afterEach(() => {
    cleanup();
  });

  it("shows empty state when no chains are active", async () => {
    chainListActive.mockResolvedValueOnce({ chains: [] });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/No active team jobs yet/)).toBeDefined();
      expect(screen.getAllByText(/Join Agent Network/i).length).toBeGreaterThan(0);
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

    const cancelBtns = document.querySelectorAll("button");
    const cancelBtn = Array.from(cancelBtns).find((b) => b.textContent === "Cancel");
    expect(cancelBtn).toBeTruthy();
    cancelBtn && fireEvent.click(cancelBtn);

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDefined();
    const confirmBtn = within(dialog).getByRole("button", { name: "Yes, cancel job" });
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
    chainListReports.mockResolvedValueOnce({
      reports: [
        {
          chainId: "chain_done",
          chainMandateId: "mandate_done",
          orchestratorOwnerId: "owner_a",
          orchestratorPeerId: "peer_a",
          pinned: false,
          createdAt: "2026-01-01T12:30:00.000Z",
          goal: "Produce a short brief on quantum entanglement",
          chainSummary: { subtaskCount: 2, workerCount: 1, synthesisCostUsd: 0 },
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByText(/Published/)).toBeDefined();
      expect(screen.getByTestId("chain-report-card")).toBeDefined();
      expect(screen.getByText(/Produce a short brief on quantum entanglement/)).toBeDefined();
      expect(screen.getByText((_, el) => el?.tagName === "TIME")).toBeDefined();
      expect(screen.queryByText(/chain_done/i)).toBeNull();
      expect(screen.queryByText(/of 2 subtasks/i)).toBeNull();
    });
  });

  it("shows report cards from chainListReports even when active list is stale", async () => {
    chainListActive.mockResolvedValue({
      chains: [
        {
          chainId: "chain_stale",
          chainMandateId: "mandate_stale",
          subtaskCount: 2,
          awardedCount: 1,
          partialCount: 0,
          cancelledCount: 0,
          chainCancelled: false,
          published: false,
          budgetSpentUsd: 0,
          budgetMaxUsd: 10,
          awardMode: "direct",
          showCostUi: false,
        },
      ],
    });
    chainListReports.mockResolvedValue({
      reports: [
        {
          chainId: "chain_stale",
          chainMandateId: "mandate_stale",
          orchestratorOwnerId: "owner_a",
          orchestratorPeerId: "peer_a",
          pinned: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          goal: "Produce a short brief for software engineers on entanglement",
          chainSummary: { subtaskCount: 2, workerCount: 1, synthesisCostUsd: 0 },
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByTestId("chain-report-card")).toBeDefined();
      expect(screen.getByText(/Published/)).toBeDefined();
      expect(
        screen.getByText(/Produce a short brief for software engineers on entanglement/),
      ).toBeDefined();
    });
    // Stale Assigning/Running row must not remain once a report exists.
    expect(screen.queryByText(/^Assigning$/i)).toBeNull();
    expect(screen.queryByText(/chain_stale/i)).toBeNull();
    expect(screen.queryByText(/of 2 subtasks/i)).toBeNull();
  });

  it("deletes a report after confirmation", async () => {
    chainListActive.mockResolvedValue({ chains: [] });
    chainListReports.mockResolvedValue({
      reports: [
        {
          chainId: "chain_del",
          chainMandateId: "mandate_del",
          orchestratorOwnerId: "owner_a",
          orchestratorPeerId: "peer_a",
          pinned: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          chainSummary: { subtaskCount: 1, workerCount: 1, synthesisCostUsd: 0 },
        },
      ],
    });
    chainDeleteReport.mockResolvedValueOnce({ chainId: "chain_del", deleted: true });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByTestId("chain-report-card")).toBeDefined();
      expect(screen.getByText(/^Reports$/i)).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Yes, delete report/i }));
    await waitFor(() => {
      expect(chainDeleteReport).toHaveBeenCalledWith({ chainId: "chain_del" });
      expect(screen.queryByTestId("chain-report-card")).toBeNull();
    });
  });

  it("passes composer assignment mode into ChainStartDialog", async () => {
    chainListActive.mockResolvedValueOnce({ chains: [] });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^New team job$/i })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /^New team job$/i }));
    await waitFor(() => {
      expect(screen.getByTestId("chain-composer-assignment-mode")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("radio", { name: /Role-based/i }));
    await waitFor(() => {
      expect(screen.getByTestId("chain-composer-empty-role")).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/What do you want your agents to accomplish/i), {
      target: { value: "Research local LLMs and summarize findings" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview plan/i }));
    await waitFor(() => {
      const dialog = screen.getByTestId("chain-start-dialog-stub");
      expect(dialog.getAttribute("data-assignment-mode")).toBe("role");
    });
  });

  it("renders observed worker jobs as view-only (no Bidding in direct mode)", async () => {
    chainListActive.mockResolvedValueOnce({ chains: [] });
    chainListObserved.mockResolvedValueOnce({
      chains: [
        {
          chainId: "chain_obs_001",
          goal: "Help with research",
          phase: "waitingWorkers",
          awardMode: "direct",
          subtaskCount: 1,
          awardedCount: 0,
          partialCount: 0,
          bidCount: 0,
          steps: [],
          orchestratorPeerId: "12D3KooW-orch",
          updatedAt: new Date().toISOString(),
          readOnly: true as const,
        },
      ],
    });
    renderChainsView();
    await waitFor(() => {
      expect(screen.getByTestId("chains-observed")).toBeDefined();
      expect(screen.getByText(/Waiting for workers/i)).toBeDefined();
      expect(screen.getByText(/View only/i)).toBeDefined();
    });
    expect(screen.queryByText(/^Bidding$/i)).toBeNull();
  });
});
