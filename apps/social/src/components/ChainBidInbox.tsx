/**
 * Phase 40D — ChainBidInbox.
 *
 * The owner-facing inbox of every live bid across a single multi-agent chain.
 * For each subtask with at least one bid, it lists:
 *   - the worker peer-id and proposed cost / ETA
 *   - an "Award" button that triggers `chainEvaluateBids` with
 *     `pickWorkerPeerId` set (bypasses the cheapest/fastest policy)
 *   - a "Counter-bid" button that opens an inline form to set a new
 *     cost ceiling, then calls `chainCounterBid`
 *
 * The component is purely presentational: it never reads or mutates state
 * outside of the callbacks passed in via props. All RPC work is owned by
 * the parent (ChainsView), which is responsible for refreshing the chain
 * state after an award/counter so the inbox re-renders.
 */

import { useCallback, useMemo, useState } from "react";

import type { ChainCounterBidResult, ChainEvaluateBidsResult } from "@envoymesh/api";

import type { TFunction } from "../context/I18nContext.js";

export interface ChainBid {
  bidKey: string;
  workerPeerId: string;
  workerOwnerId: string;
  proposedCostUsd: number;
  proposedEtaAt: string;
  bidExpiresAt: string;
}

export interface ChainBidInboxSubtask {
  subtaskId: string;
  /** Label shown next to the subtask heading (capability, etc.). */
  label?: string;
  /** Per-subtask cost ceiling in USD (used to seed the counter-bid input). */
  costCeilingUsd: number;
  bids: ChainBid[];
}

export interface ChainBidInboxProps {
  chainId: string;
  subtasks: ChainBidInboxSubtask[];
  /**
   * Award a specific worker. Resolves with the `chainEvaluateBids` result so
   * the parent can decide whether to re-fetch state.
   */
  onAward: (params: {
    chainId: string;
    subtaskId: string;
    pickWorkerPeerId: string;
  }) => Promise<ChainEvaluateBidsResult>;
  /**
   * Counter-bid a subtask with a new cost ceiling. The parent decides how to
   * react to the result (refresh, toast, etc.).
   */
  onCounterBid: (params: {
    chainId: string;
    subtaskId: string;
    newCostCeilingUsd: number;
    newDeadlineAt?: string;
  }) => Promise<ChainCounterBidResult>;
  t: TFunction;
}

/**
 * Default policy the inbox suggests. Always `cheapest` for the first round —
 * the owner can override by clicking "Award" on a different row.
 */
export function suggestCheapestBid(bids: ChainBid[]): ChainBid | null {
  if (bids.length === 0) return null;
  return [...bids].sort((a, b) => a.proposedCostUsd - b.proposedCostUsd)[0];
}

export function ChainBidInbox({ chainId, subtasks, onAward, onCounterBid, t }: ChainBidInboxProps) {
  const totalBids = useMemo(() => subtasks.reduce((acc, s) => acc + s.bids.length, 0), [subtasks]);

  if (subtasks.length === 0) {
    return (
      <div className="chain-bid-inbox chain-bid-inbox--empty" data-testid="chain-bid-inbox-empty">
        {t("chains.bidInbox.empty")}
      </div>
    );
  }

  return (
    <div className="chain-bid-inbox" data-testid="chain-bid-inbox">
      <div className="chain-bid-inbox-header">
        <h3 className="chain-bid-inbox-title">{t("chains.bidInbox.title")}</h3>
        <span className="chain-bid-inbox-count">
          {t("chains.bidInbox.count", { total: totalBids, subtasks: subtasks.length })}
        </span>
      </div>
      <ul className="chain-bid-inbox-list" role="list">
        {subtasks.map((s) => (
          <li key={s.subtaskId} className="chain-bid-inbox-subtask" data-subtask-id={s.subtaskId}>
            <ChainBidInboxRow
              chainId={chainId}
              subtask={s}
              onAward={onAward}
              onCounterBid={onCounterBid}
              t={t}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChainBidInboxRowProps {
  chainId: string;
  subtask: ChainBidInboxSubtask;
  onAward: ChainBidInboxProps["onAward"];
  onCounterBid: ChainBidInboxProps["onCounterBid"];
  t: TFunction;
}

function ChainBidInboxRow({ chainId, subtask, onAward, onCounterBid, t }: ChainBidInboxRowProps) {
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterCeiling, setCounterCeiling] = useState(String(subtask.costCeilingUsd));
  const [busy, setBusy] = useState<null | "award" | "counter">(null);
  const [error, setError] = useState<string | null>(null);

  const suggested = useMemo(() => suggestCheapestBid(subtask.bids), [subtask.bids]);

  const handleAward = useCallback(
    async (workerPeerId: string) => {
      setBusy("award");
      setError(null);
      try {
        await onAward({ chainId, subtaskId: subtask.subtaskId, pickWorkerPeerId: workerPeerId });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [chainId, onAward, subtask.subtaskId],
  );

  const handleCounter = useCallback(async () => {
    const next = Number(counterCeiling);
    if (!Number.isFinite(next) || next <= 0) {
      setError(t("chains.bidInbox.counterInvalid"));
      return;
    }
    setBusy("counter");
    setError(null);
    try {
      await onCounterBid({ chainId, subtaskId: subtask.subtaskId, newCostCeilingUsd: next });
      setCounterOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [chainId, counterCeiling, onCounterBid, subtask.subtaskId, t]);

  return (
    <div className="chain-bid-inbox-row">
      <div className="chain-bid-inbox-subtask-head">
        <span className="chain-bid-inbox-subtask-id">
          <code>{subtask.subtaskId}</code>
          {subtask.label ? <span className="chain-bid-inbox-subtask-label">{subtask.label}</span> : null}
        </span>
        <span className="chain-bid-inbox-subtask-meta">
          {t("chains.bidInbox.ceiling", { ceiling: subtask.costCeilingUsd.toFixed(2) })}
        </span>
      </div>
      {subtask.bids.length === 0 ? (
        <div className="chain-bid-inbox-no-bids">{t("chains.bidInbox.noBids")}</div>
      ) : (
        <table className="chain-bid-inbox-table" data-testid={`chain-bid-inbox-table-${subtask.subtaskId}`}>
          <thead>
            <tr>
              <th>{t("chains.bidInbox.col.worker")}</th>
              <th>{t("chains.bidInbox.col.cost")}</th>
              <th>{t("chains.bidInbox.col.eta")}</th>
              <th>{t("chains.bidInbox.col.expires")}</th>
              <th>{t("chains.bidInbox.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {subtask.bids.map((b) => {
              const isSuggested = suggested?.bidKey === b.bidKey;
              return (
                <tr
                  key={b.bidKey}
                  className="chain-bid-inbox-bid"
                  data-bid-key={b.bidKey}
                  data-worker={b.workerPeerId}
                  data-suggested={isSuggested ? "true" : "false"}
                >
                  <td>
                    <code>{b.workerPeerId}</code>
                  </td>
                  <td>${b.proposedCostUsd.toFixed(2)}</td>
                  <td>{b.proposedEtaAt.slice(11, 19)}Z</td>
                  <td>{b.bidExpiresAt.slice(11, 19)}Z</td>
                  <td>
                    <button
                      type="button"
                      className="chain-bid-inbox-award"
                      onClick={() => void handleAward(b.workerPeerId)}
                      disabled={busy !== null}
                      data-action="award"
                      data-worker={b.workerPeerId}
                      title={t("chains.bidInbox.awardTitle")}
                    >
                      {busy === "award" ? t("chains.bidInbox.awarding") : t("chains.bidInbox.award")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="chain-bid-inbox-counter">
        {counterOpen ? (
          <div className="chain-bid-inbox-counter-form" data-testid="chain-bid-inbox-counter-form">
            <label className="chain-bid-inbox-counter-label">
              {t("chains.bidInbox.counterLabel")}
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={counterCeiling}
                onChange={(e) => setCounterCeiling(e.target.value)}
                disabled={busy !== null}
                data-testid="chain-bid-inbox-counter-input"
              />
            </label>
            <button
              type="button"
              className="chain-bid-inbox-counter-submit"
              onClick={() => void handleCounter()}
              disabled={busy !== null}
              data-action="counter-submit"
            >
              {busy === "counter" ? t("chains.bidInbox.countering") : t("chains.bidInbox.counterSubmit")}
            </button>
            <button
              type="button"
              className="chain-bid-inbox-counter-cancel"
              onClick={() => setCounterOpen(false)}
              disabled={busy !== null}
            >
              {t("chains.bidInbox.counterCancel")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="chain-bid-inbox-counter-open"
            onClick={() => setCounterOpen(true)}
            disabled={busy !== null || subtask.bids.length === 0}
            data-action="counter-open"
          >
            {t("chains.bidInbox.counterOpen")}
          </button>
        )}
        {error ? (
          <div className="chain-bid-inbox-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}