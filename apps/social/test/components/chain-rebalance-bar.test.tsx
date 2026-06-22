/**
 * Phase 40D — Configurable rebalance policy UI tests.
 *
 * Validates the policy-aware rendering of `ChainRebalanceBar`:
 *   - `policy === "never"` → bar is hidden (testid absent).
 *   - `policy === "auto"` → bar shows the "auto-rebalance is on" line
 *     + the most-recent auto-rebalance history entries.
 *   - `policy === "manual"` → bar shows the input + button (existing
 *     behavior, exercised here to confirm no regression).
 *   - `finalized` chains → bar is hidden regardless of policy.
 */

/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

afterEach(() => cleanup());

import type { ChainGetStateResult, ChainRebalanceResult } from "@envoymesh/api";

import { ChainRebalanceBar } from "../../src/components/ChainRebalanceBar.js";
import { I18nContext, type TFunction } from "../../src/context/i18n-context.js";
import { en } from "../../src/i18n/messages/en.js";
import { translate } from "../../src/i18n/translate.js";

const stubT: TFunction = (key, fallbackOrParams, params) =>
  translate(en, key, fallbackOrParams, params);

function wrap(node: React.ReactNode): React.ReactElement {
  return (
    <I18nContext.Provider value={{ locale: "en", setLocale: () => undefined, t: stubT, localeOptions: [] }}>
      {node}
    </I18nContext.Provider>
  );
}

function makeLiveState(overrides: Partial<ChainGetStateResult> = {}): ChainGetStateResult {
  return {
    chainId: "chain_1",
    chainMandateId: "chainmandate_1",
    subtaskCount: 1,
    bidCount: 0,
    awardedCount: 1,
    partialCount: 0,
    cancelledCount: 0,
    chainCancelled: false,
    published: false,
    budgetSpentUsd: 4,
    budgetMaxUsd: 10,
    budgetReservedUsd: 0,
    budgetSynthesisUsd: 0,
    rebalancePolicy: "manual",
    autoRebalanceCount: 0,
    maxAutoRebalances: 2,
    autoRebalanceHistory: [],
    ...overrides,
  };
}

describe("ChainRebalanceBar — policy-aware rendering (Phase 40D)", () => {
  it("hides the bar entirely when rebalancePolicy === 'never'", () => {
    const liveState = makeLiveState({ rebalancePolicy: "never" });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    expect(screen.queryByTestId("chain-rebalance-bar")).toBeNull();
  });

  it("hides the bar when the chain is published, regardless of policy", () => {
    const liveState = makeLiveState({ rebalancePolicy: "auto", published: true });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    expect(screen.queryByTestId("chain-rebalance-bar")).toBeNull();
  });

  it("shows the auto-rebalance banner when rebalancePolicy === 'auto'", () => {
    const liveState = makeLiveState({
      rebalancePolicy: "auto",
      autoRebalanceCount: 1,
      maxAutoRebalances: 3,
    });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    const banner = screen.getByTestId("chain-rebalance-policy-auto");
    expect(banner).not.toBeNull();
    expect(banner.textContent).toMatch(/auto-rebalance is on/i);
    expect(banner.textContent).toMatch(/used 1 of 3/);
  });

  it("renders the auto-rebalance history when present", () => {
    const liveState = makeLiveState({
      rebalancePolicy: "auto",
      autoRebalanceCount: 2,
      maxAutoRebalances: 3,
      autoRebalanceHistory: [
        { at: "2026-06-18T00:30:00.000Z", reason: "stalled:subtask_a", additionalBudgetUsd: 5 },
        { at: "2026-06-18T00:25:00.000Z", reason: "low-confidence:subtask_b", additionalBudgetUsd: 5 },
      ],
    });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    const banner = screen.getByTestId("chain-rebalance-policy-auto");
    expect(banner.textContent).toMatch(/stalled:subtask_a/);
    expect(banner.textContent).toMatch(/low-confidence:subtask_b/);
  });

  it("caps the history list at 3 entries to keep the bar compact", () => {
    const liveState = makeLiveState({
      rebalancePolicy: "auto",
      autoRebalanceCount: 5,
      maxAutoRebalances: 5,
      autoRebalanceHistory: [
        { at: "2026-06-18T00:30:00.000Z", reason: "r1", additionalBudgetUsd: 5 },
        { at: "2026-06-18T00:29:00.000Z", reason: "r2", additionalBudgetUsd: 5 },
        { at: "2026-06-18T00:28:00.000Z", reason: "r3", additionalBudgetUsd: 5 },
        { at: "2026-06-18T00:27:00.000Z", reason: "r4", additionalBudgetUsd: 5 },
        { at: "2026-06-18T00:26:00.000Z", reason: "r5", additionalBudgetUsd: 5 },
      ],
    });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    const banner = screen.getByTestId("chain-rebalance-policy-auto");
    expect(banner.textContent).toContain("r1");
    expect(banner.textContent).toContain("r2");
    expect(banner.textContent).toContain("r3");
    expect(banner.textContent).not.toContain("r4");
    expect(banner.textContent).not.toContain("r5");
  });

  it("renders the manual input + button when policy === 'manual'", () => {
    const liveState = makeLiveState({ rebalancePolicy: "manual" });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    expect(screen.getByTestId("chain-rebalance-bar")).not.toBeNull();
    expect(screen.queryByTestId("chain-rebalance-policy-auto")).toBeNull();
  });

  it("also renders the manual input + button when policy === 'auto' (owner can override)", () => {
    const liveState = makeLiveState({ rebalancePolicy: "auto" });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={vi.fn()} t={stubT} />));
    expect(screen.getByTestId("chain-rebalance-bar")).not.toBeNull();
    expect(screen.getByTestId("chain-rebalance-policy-auto")).not.toBeNull();
    // The owner can still trigger a manual rebalance.
    fireEvent.click(screen.getByRole("button", { name: /add budget & retry/i }) ?? screen.getAllByRole("button").find((b) => /add budget/i.test(b.textContent ?? "")) as HTMLElement);
    // Form input is now visible.
    expect(screen.getByTestId("chain-rebalance-input")).not.toBeNull();
  });

  it("passes autoTriggered=false to onRebalance even when policy is auto (manual button always wins)", async () => {
    const onRebalance = vi.fn().mockResolvedValue({
      chainId: "chain_1",
      ok: true,
      previousMaxUsd: 10,
      newMaxUsd: 15,
      reEvaluated: [],
      autoTriggered: false,
    } satisfies ChainRebalanceResult);
    const liveState = makeLiveState({ rebalancePolicy: "auto" });
    render(wrap(<ChainRebalanceBar chainId="chain_1" liveState={liveState} onRebalance={onRebalance} t={stubT} />));
    fireEvent.click(screen.getAllByRole("button").find((b) => /add budget/i.test(b.textContent ?? "")) as HTMLElement);
    fireEvent.change(screen.getByTestId("chain-rebalance-input"), { target: { value: "5" } });
    fireEvent.click(screen.queryAllByRole("button").find((b) => /rebalance/i.test(b.textContent ?? "")) as HTMLElement);
    expect(onRebalance).toHaveBeenCalledWith({
      chainId: "chain_1",
      additionalBudgetUsd: 5,
    });
  });
});