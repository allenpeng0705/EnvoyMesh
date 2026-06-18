/**
 * Phase 40 — ChainTreeView.
 *
 * Renders the per-chain subtask tree:
 *   - parent (chain mandate) at the top
 *   - each subtask as a row with bid/award/partial/cancelled badges
 *   - workers as child nodes under their awarded subtask
 *   - citation deep-link: scrolls to the corresponding section
 *
 * Status chips use a small color vocabulary:
 *   - bidding    → neutral
 *   - awarded    → blue
 *   - running    → yellow
 *   - partial    → green
 *   - merged     → green
 *   - cancelled  → red
 *   - failed     → red
 */

import { useMemo } from "react";

import { useT } from "../context/I18nContext.js";
import type { TFunction } from "../context/I18nContext.js";

export type ChainSubtaskState =
  | "bidding"
  | "awarded"
  | "running"
  | "partial"
  | "merged"
  | "cancelled"
  | "failed";

export interface ChainSubtaskNode {
  subtaskId: string;
  parentSubtaskId?: string;
  depth: number;
  requiredCapability: string;
  objective: string;
  state: ChainSubtaskState;
  /** Bidders; populated during the bidding phase. */
  bids?: Array<{ workerPeerId: string; proposedCostUsd: number }>;
  /** Awarded worker; populated once an award is sent. */
  awardedWorkerPeerId?: string;
  /** Cost in USD; populated when reserved or committed. */
  costUsd?: number;
}

export interface ChainTreeWorkerNode {
  workerPeerId: string;
  ownerId?: string;
  costUsd?: number;
  state: "awarded" | "running" | "partial" | "cancelled" | "failed" | "merged";
}

export interface ChainTreeViewProps {
  chainId: string;
  chainMandateId: string;
  subtasks: ChainSubtaskNode[];
  /** Optional: workers per subtask, mapped by subtaskId. */
  workersBySubtask?: Record<string, ChainTreeWorkerNode[]>;
  /** Optional: a child task to highlight (citation deep-link). */
  highlightedSubtaskId?: string | null;
  onSelectSubtask?: (subtaskId: string) => void;
  className?: string;
}

const STATE_LABEL_KEY: Record<ChainSubtaskState, string> = {
  bidding: "chains.tree.stateBidding",
  awarded: "chains.tree.stateAwarded",
  running: "chains.tree.stateRunning",
  partial: "chains.tree.statePartial",
  merged: "chains.tree.stateMerged",
  cancelled: "chains.tree.stateCancelled",
  failed: "chains.tree.stateFailed",
};

function stateLabelKey(s: ChainSubtaskState): string {
  return STATE_LABEL_KEY[s] ?? "chains.tree.stateBidding";
}

function stateLabel(s: ChainSubtaskState, t: TFunction): string {
  return t(stateLabelKey(s), s);
}

export function ChainTreeView({
  chainId,
  chainMandateId,
  subtasks,
  workersBySubtask,
  highlightedSubtaskId,
  onSelectSubtask,
  className,
}: ChainTreeViewProps) {
  const t = useT();
  const ordered = useMemo(
    () => [...subtasks].sort((a, b) => a.depth - b.depth || a.subtaskId.localeCompare(b.subtaskId)),
    [subtasks],
  );

  return (
    <div className={className ?? "chain-tree"} data-chain-id={chainId} role="tree">
      <header className="chain-tree-header">
        <h3 className="chain-tree-title">{t("chains.tree.title")}</h3>
        <div className="chain-tree-meta">
          <span className="chain-tree-meta-item">
            <span className="chain-tree-meta-label">{t("chains.tree.chainId")}</span>
            <code>{chainId}</code>
          </span>
          <span className="chain-tree-meta-item">
            <span className="chain-tree-meta-label">{t("chains.tree.mandateId")}</span>
            <code>{chainMandateId}</code>
          </span>
        </div>
      </header>
      {ordered.length === 0 ? (
        <p className="chain-tree-empty">{t("chains.tree.empty")}</p>
      ) : (
        <ol className="chain-tree-list" role="group">
          {ordered.map((s) => {
            const workers = workersBySubtask?.[s.subtaskId] ?? [];
            const highlighted = s.subtaskId === highlightedSubtaskId;
            return (
              <li
                key={s.subtaskId}
                className="chain-tree-row"
                data-state={s.state}
                data-depth={s.depth}
                data-highlighted={highlighted ? "true" : "false"}
                role="treeitem"
                aria-expanded={workers.length > 0}
              >
                <button
                  type="button"
                  className="chain-tree-row-main"
                  onClick={() => onSelectSubtask?.(s.subtaskId)}
                  disabled={!onSelectSubtask}
                  title={s.subtaskId}
                >
                  <span className="chain-tree-row-id">
                    <code>{s.subtaskId}</code>
                  </span>
                  <span className="chain-tree-row-capability">{s.requiredCapability}</span>
                  <span className="chain-tree-row-objective">{s.objective}</span>
                  <span
                    className="chain-tree-row-state"
                    data-state={s.state}
                    title={t("chains.tree.stateTitle", { state: s.state })}
                  >
                    {stateLabel(s.state, t)}
                  </span>
                  {typeof s.costUsd === "number" ? (
                    <span className="chain-tree-row-cost">${s.costUsd.toFixed(2)}</span>
                  ) : null}
                </button>
                {s.bids && s.bids.length > 0 ? (
                  <div className="chain-tree-bids">
                    <span className="chain-tree-bids-label">
                      {t("chains.tree.bidsCount", { count: s.bids.length })}
                    </span>
                    <ul>
                      {s.bids.map((b, i) => (
                        <li key={b.workerPeerId + i}>
                          <code>{b.workerPeerId}</code>
                          <span>${b.proposedCostUsd.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {workers.length > 0 ? (
                  <ul className="chain-tree-workers" role="group">
                    {workers.map((w) => (
                      <li
                        key={w.workerPeerId}
                        className="chain-tree-worker"
                        data-state={w.state}
                      >
                        <code className="chain-tree-worker-id">{w.workerPeerId}</code>
                        {w.ownerId ? <span className="chain-tree-worker-owner">{w.ownerId}</span> : null}
                        {typeof w.costUsd === "number" ? (
                          <span className="chain-tree-worker-cost">${w.costUsd.toFixed(2)}</span>
                        ) : null}
                        <span className="chain-tree-worker-state" data-state={w.state}>
                          {t(`chains.tree.workerState${capitalize(w.state)}`, w.state)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0]!.toUpperCase() + s.slice(1);
}
