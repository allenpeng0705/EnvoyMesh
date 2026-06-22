/**
 * Phase 40D — ChainBidInbox + ChainRebalanceBar tests.
 *
 * Validates the multi-bid collection UI:
 *   - Empty inbox shows a placeholder.
 *   - Per-subtask rows list every bid with cost / ETA / TTL.
 *   - The cheapest bid is marked `data-suggested="true"`.
 *   - Clicking "Award" calls `onAward` with the picked worker peer-id.
 *   - Clicking "Counter-bid" opens the inline form; submit calls
 *     `onCounterBid` with the entered ceiling.
 *   - Invalid (non-positive) ceiling surfaces an error and skips the call.
 *
 * Also covers ChainRebalanceBar:
 *   - Spent / max summary renders.
 *   - Submitting a positive amount calls `onRebalance`.
 *   - Result message is shown after a successful rebalance.
 */

/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

afterEach(() => cleanup());

import type { ChainEvaluateBidsResult, ChainCounterBidResult, ChainRebalanceResult, ChainGetStateResult } from "@envoymesh/api";

import { ChainBidInbox, type ChainBidInboxSubtask, suggestCheapestBid } from "../../src/components/ChainBidInbox.js";
import { ChainRebalanceBar } from "../../src/components/ChainRebalanceBar.js";
import { I18nContext, type TFunction } from "../../src/context/i18n-context.js";
import { en } from "../../src/i18n/messages/en.js";
import { translate } from "../../src/i18n/translate.js";

const stubT: TFunction = (key, fallbackOrParams, params) => {
  return translate(en, key, fallbackOrParams, params);
};

function wrap(node: React.ReactNode): React.ReactElement {
  return (
    <I18nContext.Provider value={{ locale: "en", setLocale: () => undefined, t: stubT, localeOptions: [] }}>
      {node}
    </I18nContext.Provider>
  );
}

function makeBid(overrides: Partial<{ bidKey: string; workerPeerId: string; workerOwnerId: string; proposedCostUsd: number; proposedEtaAt: string; bidExpiresAt: string }> = {}) {
  return {
    bidKey: `${overrides.workerPeerId ?? "12D3KooW-w1"}::${overrides.workerPeerId ?? "12D3KooW-w1"}`,
    workerPeerId: overrides.workerPeerId ?? "12D3KooW-w1",
    workerOwnerId: overrides.workerOwnerId ?? "envoy:owner:w1",
    proposedCostUsd: overrides.proposedCostUsd ?? 1.5,
    proposedEtaAt: overrides.proposedEtaAt ?? "2026-06-18T10:30:00.000Z",
    bidExpiresAt: overrides.bidExpiresAt ?? "2026-06-18T11:00:00.000Z",
  };
}

function makeSubtask(overrides: Partial<ChainBidInboxSubtask> = {}): ChainBidInboxSubtask {
  return {
    subtaskId: overrides.subtaskId ?? "subtask_a",
    label: overrides.label,
    costCeilingUsd: overrides.costCeilingUsd ?? 5,
    bids: overrides.bids ?? [],
  };
}

describe("ChainBidInbox — rendering", () => {
  it("renders an empty-state placeholder when there are no subtasks", () => {
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={[]} onAward={vi.fn()} onCounterBid={vi.fn()} t={stubT} />));
    const empty = screen.getByTestId("chain-bid-inbox-empty");
    expect(empty.textContent).toMatch(/no subtasks/i);
  });

  it("renders one row per subtask and lists each bid", () => {
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({
        subtaskId: "subtask_a",
        bids: [
          makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.5 }),
          makeBid({ workerPeerId: "12D3KooW-w2", proposedCostUsd: 2.5 }),
        ],
      }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={vi.fn()} t={stubT} />));
    const table = screen.getByTestId("chain-bid-inbox-table-subtask_a");
    const rows = within(table).getAllByRole("row");
    // 1 header row + 2 bid rows.
    expect(rows.length).toBe(3);
  });

  it("marks the cheapest bid as suggested", () => {
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({
        bids: [
          makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 3.0 }),
          makeBid({ workerPeerId: "12D3KooW-w2", proposedCostUsd: 1.0 }),
        ],
      }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={vi.fn()} t={stubT} />));
    const cheapest = document.querySelector('[data-suggested="true"][data-worker="12D3KooW-w2"]');
    expect(cheapest).not.toBeNull();
  });

  it("shows 'No live bids' when a subtask has an empty bids array", () => {
    const subtasks: ChainBidInboxSubtask[] = [makeSubtask({ bids: [] })];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={vi.fn()} t={stubT} />));
    expect(screen.getAllByText(/no live bids/i).length).toBeGreaterThan(0);
  });
});

describe("ChainBidInbox — interactions", () => {
  it("calls onAward with the picked worker when Award is clicked", async () => {
    const onAward = vi.fn().mockResolvedValue({
      chainId: "chain_1",
      subtaskId: "subtask_a",
      awarded: true,
      workerPeerId: "12D3KooW-w2",
      round: 1,
    } satisfies ChainEvaluateBidsResult);
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({
        bids: [
          makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.0 }),
          makeBid({ workerPeerId: "12D3KooW-w2", proposedCostUsd: 2.0 }),
        ],
      }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={onAward} onCounterBid={vi.fn()} t={stubT} />));
    const button = document.querySelector('[data-action="award"][data-worker="12D3KooW-w2"]') as HTMLButtonElement;
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect(onAward).toHaveBeenCalledWith({
      chainId: "chain_1",
      subtaskId: "subtask_a",
      pickWorkerPeerId: "12D3KooW-w2",
    });
  });

  it("opens the counter-bid form when 'Counter-bid' is clicked", () => {
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({
        bids: [makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.0 })],
      }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={vi.fn()} t={stubT} />));
    const openBtn = document.querySelector('[data-action="counter-open"]') as HTMLButtonElement;
    expect(openBtn).not.toBeNull();
    fireEvent.click(openBtn);
    const form = screen.getByTestId("chain-bid-inbox-counter-form");
    expect(form).not.toBeNull();
  });

  it("calls onCounterBid when the counter-bid form is submitted with a positive value", () => {
    const onCounterBid = vi.fn().mockResolvedValue({
      chainId: "chain_1",
      subtaskId: "subtask_a",
      ok: true,
      rebroadcastAt: "2026-06-18T10:30:00.000Z",
      clearedBids: 1,
      newRound: 2,
    } satisfies ChainCounterBidResult);
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({ bids: [makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.0 })] }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={onCounterBid} t={stubT} />));
    fireEvent.click(document.querySelector('[data-action="counter-open"]') as HTMLButtonElement);
    const input = screen.getByTestId("chain-bid-inbox-counter-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "3.50" } });
    fireEvent.click(document.querySelector('[data-action="counter-submit"]') as HTMLButtonElement);
    expect(onCounterBid).toHaveBeenCalledWith({
      chainId: "chain_1",
      subtaskId: "subtask_a",
      newCostCeilingUsd: 3.5,
    });
  });

  it("surfaces an error when the ceiling is non-positive", () => {
    const onCounterBid = vi.fn();
    const subtasks: ChainBidInboxSubtask[] = [
      makeSubtask({ bids: [makeBid({ workerPeerId: "12D3KooW-w1" })] }),
    ];
    render(wrap(<ChainBidInbox chainId="chain_1" subtasks={subtasks} onAward={vi.fn()} onCounterBid={onCounterBid} t={stubT} />));
    fireEvent.click(document.querySelector('[data-action="counter-open"]') as HTMLButtonElement);
    const input = screen.getByTestId("chain-bid-inbox-counter-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-1" } });
    fireEvent.click(document.querySelector('[data-action="counter-submit"]') as HTMLButtonElement);
    expect(onCounterBid).not.toHaveBeenCalled();
    expect(screen.getAllByText(/positive number/i).length).toBeGreaterThan(0);
  });
});

describe("suggestCheapestBid", () => {
  it("returns null when there are no bids", () => {
    expect(suggestCheapestBid([])).toBeNull();
  });
  it("returns the lowest-cost bid", () => {
    const bid = suggestCheapestBid([
      makeBid({ workerPeerId: "12D3KooW-w1", proposedCostUsd: 3.0 }),
      makeBid({ workerPeerId: "12D3KooW-w2", proposedCostUsd: 1.0 }),
    ]);
    expect(bid?.workerPeerId).toBe("12D3KooW-w2");
  });
});

describe("ChainRebalanceBar — rendering", () => {
  it("renders spent and max when liveState is provided", () => {
    const liveState: ChainGetStateResult = {
      chainId: "chain_1",
      chainMandateId: "chainmandate_1",
      subtaskCount: 2,
      bidCount: 0,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 4,
      budgetMaxUsd: 10,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    };
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    const bar = screen.getByTestId("chain-rebalance-bar");
    expect(bar.textContent).toMatch(/4\.00/);
    expect(bar.textContent).toMatch(/10\.00/);
  });

  it("is hidden once the chain is published", () => {
    const liveState: ChainGetStateResult = {
      chainId: "chain_1",
      chainMandateId: "chainmandate_1",
      subtaskCount: 1,
      bidCount: 0,
      awardedCount: 1,
      partialCount: 1,
      cancelledCount: 0,
      chainCancelled: false,
      published: true,
      budgetSpentUsd: 2,
      budgetMaxUsd: 10,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 1,
    };
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    expect(screen.queryByTestId("chain-rebalance-bar")).toBeNull();
  });
});

describe("ChainRebalanceBar — interactions", () => {
  it("calls onRebalance with a positive amount when submitted", async () => {
    const onRebalance = vi.fn().mockResolvedValue({
      chainId: "chain_1",
      ok: true,
      previousMaxUsd: 10,
      newMaxUsd: 15,
      reEvaluated: [
        { subtaskId: "subtask_a", awarded: true, workerPeerId: "12D3KooW-w1" },
        { subtaskId: "subtask_b", awarded: false, reason: "no_bids" },
      ],
    } satisfies ChainRebalanceResult);
    const liveState: ChainGetStateResult = {
      chainId: "chain_1",
      chainMandateId: "chainmandate_1",
      subtaskCount: 2,
      bidCount: 1,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 5,
      budgetMaxUsd: 10,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    };
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={onRebalance} t={stubT} />));
    fireEvent.click(document.querySelector('[data-action="rebalance-open"]') as HTMLButtonElement);
    const input = screen.getByTestId("chain-rebalance-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5.00" } });
    fireEvent.click(document.querySelector('[data-action="rebalance-submit"]') as HTMLButtonElement);
    expect(onRebalance).toHaveBeenCalledWith({
      chainId: "chain_1",
      additionalBudgetUsd: 5,
    });
  });

  it("surfaces an error when the amount is non-positive", () => {
    const onRebalance = vi.fn();
    const liveState: ChainGetStateResult = {
      chainId: "chain_1",
      chainMandateId: "chainmandate_1",
      subtaskCount: 1,
      bidCount: 0,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 10,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    };
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={onRebalance} t={stubT} />));
    fireEvent.click(document.querySelector('[data-action="rebalance-open"]') as HTMLButtonElement);
    const input = screen.getByTestId("chain-rebalance-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(document.querySelector('[data-action="rebalance-submit"]') as HTMLButtonElement);
    expect(onRebalance).not.toHaveBeenCalled();
    expect(screen.getAllByText(/positive number/i).length).toBeGreaterThan(0);
  });

  it("shows a result line after a successful rebalance", async () => {
    const onRebalance = vi.fn().mockResolvedValue({
      chainId: "chain_1",
      ok: true,
      previousMaxUsd: 10,
      newMaxUsd: 15,
      reEvaluated: [{ subtaskId: "subtask_a", awarded: true, workerPeerId: "12D3KooW-w1" }],
    } satisfies ChainRebalanceResult);
    const liveState: ChainGetStateResult = {
      chainId: "chain_1",
      chainMandateId: "chainmandate_1",
      subtaskCount: 1,
      bidCount: 1,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 5,
      budgetMaxUsd: 10,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    };
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={onRebalance} t={stubT} />));
    fireEvent.click(document.querySelector('[data-action="rebalance-open"]') as HTMLButtonElement);
    fireEvent.change(screen.getByTestId("chain-rebalance-input"), { target: { value: "5" } });
    fireEvent.click(document.querySelector('[data-action="rebalance-submit"]') as HTMLButtonElement);
    // Wait for the state update.
    await Promise.resolve();
    const result = await screen.findByTestId("chain-rebalance-result");
    expect(result.textContent).toMatch(/10\.00/);
    expect(result.textContent).toMatch(/15\.00/);
  });
});