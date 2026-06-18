/**
 * Phase 40 — ChainsView.
 *
 * Social UI for multi-agent chains. Two tabs:
 *   - "Active"  — chains in flight (chainListActive)
 *   - "Reports" — completed chains (chainListReports, with a "pinned" filter)
 *
 * Clicking a row opens the per-chain detail:
 *   - ChainTreeView (left)
 *   - ChainReportRenderer (right) if the report has been published
 *
 * The view polls `chainListActive` every 5s while a chain is in flight so
 * status changes (bidding → awarded → running → partial → merged) animate
 * without manual refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ChainCounterBidResult,
  ChainEvaluateBidsResult,
  ChainGetReportResult,
  ChainGetStateResult,
  ChainListActiveResult,
  ChainListReportsResult,
  ChainRebalanceResult,
  ChainReport,
} from "@envoymesh/api";

import { useNodeService } from "../../hooks/useNodeService.js";
import { useT, type TFunction } from "../../context/I18nContext.js";

import { ChainReportRenderer } from "../ChainReportRenderer.js";
import { ChainTreeView, type ChainSubtaskNode, type ChainTreeWorkerNode } from "../ChainTreeView.js";
import { ChainBidInbox, type ChainBidInboxSubtask } from "../ChainBidInbox.js";
import { ChainRebalanceBar } from "../ChainRebalanceBar.js";
import { RefreshCwIcon, CloseIcon } from "../../icons.js";

interface ActiveChainRow {
  chainId: string;
  chainMandateId: string;
  subtaskCount: number;
  bidCount: number;
  awardedCount: number;
  partialCount: number;
  cancelledCount: number;
  chainCancelled: boolean;
  published: boolean;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
}

interface ReportSummary {
  chainId: string;
  chainMandateId: string;
  orchestratorOwnerId: string;
  orchestratorPeerId: string;
  pinned: boolean;
  createdAt: string;
  chainSummary: { subtaskCount: number; workerCount: number; synthesisCostUsd: number };
}

type Tab = "active" | "reports";

function statusTone(s: ActiveChainRow): "info" | "success" | "warn" | "error" {
  if (s.chainCancelled) return "error";
  if (s.published) return "success";
  if (s.partialCount === s.subtaskCount && s.subtaskCount > 0) return "success";
  if (s.awardedCount === s.subtaskCount && s.subtaskCount > 0) return "info";
  if (s.bidCount > 0) return "info";
  return "warn";
}

function statusLabel(s: ActiveChainRow, t: TFunction): string {
  if (s.chainCancelled) return t("chains.status.cancelled");
  if (s.published) return t("chains.status.published");
  if (s.subtaskCount === 0) return t("chains.status.planning");
  if (s.awardedCount < s.subtaskCount) return t("chains.status.bidding");
  if (s.partialCount < s.subtaskCount) return t("chains.status.running");
  if (s.partialCount === s.subtaskCount) return t("chains.status.synthesizing");
  return t("chains.status.unknown");
}

function asActiveChainRow(r: ChainGetStateResult): ActiveChainRow {
  return {
    chainId: r.chainId,
    chainMandateId: r.chainMandateId,
    subtaskCount: r.subtaskCount,
    bidCount: r.bidCount,
    awardedCount: r.awardedCount,
    partialCount: r.partialCount,
    cancelledCount: r.cancelledCount,
    chainCancelled: r.chainCancelled,
    published: r.published,
    budgetSpentUsd: r.budgetSpentUsd,
    budgetMaxUsd: r.budgetMaxUsd,
  };
}

function asReportSummary(r: ChainListReportsResult["reports"][number]): ReportSummary {
  return {
    chainId: r.chainId,
    chainMandateId: r.chainMandateId,
    orchestratorOwnerId: r.orchestratorOwnerId,
    orchestratorPeerId: r.orchestratorPeerId,
    pinned: r.pinned,
    createdAt: r.createdAt,
    chainSummary: r.chainSummary,
  };
}

export interface ChainsViewProps {
  onBack?: () => void;
}

export function ChainsView({ onBack }: ChainsViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [tab, setTab] = useState<Tab>("active");
  const [active, setActive] = useState<ActiveChainRow[] | null>(null);
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ChainReport | null>(null);
  const [highlightedSubtaskId, setHighlightedSubtaskId] = useState<string | null>(null);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadActive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await nodeService.chainListActive({})) as ChainListActiveResult;
      setActive((res.chains ?? []).map(asActiveChainRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeService]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await nodeService.chainListReports({
        pinnedOnly,
      })) as ChainListReportsResult;
      setReports((res.reports ?? []).map(asReportSummary));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [nodeService, pinnedOnly]);

  const loadReport = useCallback(
    async (chainId: string) => {
      try {
        const res = (await nodeService.chainGetReport({ chainId })) as ChainGetReportResult;
        setSelectedReport((res.report as ChainReport | null) ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSelectedReport(null);
      }
    },
    [nodeService],
  );

  // Initial load + tab change
  useEffect(() => {
    if (tab === "active") {
      void loadActive();
    } else {
      void loadReports();
    }
  }, [tab, loadActive, loadReports]);

  // Poll active chains every 5s while in the active tab
  useEffect(() => {
    if (tab !== "active") return undefined;
    pollRef.current = setInterval(() => {
      void loadActive();
    }, 5000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tab, loadActive]);

  // When a row is selected, try to load the report (if any)
  useEffect(() => {
    if (!selectedChainId) {
      setSelectedReport(null);
      return;
    }
    void loadReport(selectedChainId);
  }, [selectedChainId, loadReport]);

  const onSelectRow = useCallback((chainId: string) => {
    setSelectedChainId(chainId);
    setHighlightedSubtaskId(null);
  }, []);

  const onCitationClick = useCallback((subtaskId: string) => {
    setHighlightedSubtaskId(subtaskId);
  }, []);

  const onCancel = useCallback(
    async (chainId: string, reason: string) => {
      try {
        await nodeService.chainCancel({ chainId, reason, cancelledBy: "owner" });
        await loadActive();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [nodeService, loadActive],
  );

  const onAward = useCallback(
    async (params: { chainId: string; subtaskId: string; pickWorkerPeerId: string }) => {
      try {
        const result = await nodeService.chainEvaluateBids(params);
        await loadActive();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [nodeService, loadActive],
  );

  const onCounterBid = useCallback(
    async (params: {
      chainId: string;
      subtaskId: string;
      newCostCeilingUsd: number;
      newDeadlineAt?: string;
    }) => {
      try {
        const result = await nodeService.chainCounterBid(params);
        await loadActive();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [nodeService, loadActive],
  );

  const onRebalance = useCallback(
    async (params: { chainId: string; additionalBudgetUsd: number }) => {
      try {
        const result = await nodeService.chainRebalance(params);
        await loadActive();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    [nodeService, loadActive],
  );

  const onPin = useCallback(
    async (chainId: string, pinned: boolean) => {
      try {
        await nodeService.chainPinReport({ chainId, pinned });
        await loadReports();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [nodeService, loadReports],
  );

  const tabs = useMemo(
    () =>
      [
        { id: "active" as const, label: t("chains.tabs.active") },
        { id: "reports" as const, label: t("chains.tabs.reports") },
      ],
    [t],
  );

  return (
    <div className="chains-view" data-testid="chains-view">
      <header className="chains-view-header">
        {onBack ? (
          <button type="button" className="chains-view-back" onClick={onBack} aria-label={t("nav.back")}>
            <CloseIcon size={18} />
          </button>
        ) : null}
        <h2 className="chains-view-title">{t("chains.title")}</h2>
        <div className="chains-view-tabs" role="tablist">
          {tabs.map((tt) => (
            <button
              key={tt.id}
              type="button"
              role="tab"
              aria-selected={tab === tt.id}
              className={`chains-view-tab${tab === tt.id ? " active" : ""}`}
              onClick={() => setTab(tt.id)}
            >
              {tt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chains-view-refresh"
          onClick={tab === "active" ? () => void loadActive() : () => void loadReports()}
          disabled={loading}
          title={t("chains.refresh")}
        >
          <RefreshCwIcon size={16} />
        </button>
      </header>

      {error ? (
        <div className="chains-view-error" role="alert">
          {error}
        </div>
      ) : null}

      {tab === "active" ? (
        <div className="chains-view-split">
          <ActiveList
            rows={active}
            loading={loading}
            selectedChainId={selectedChainId}
            onSelect={onSelectRow}
            onCancel={onCancel}
            t={t}
          />
          <ChainDetail
            chainId={selectedChainId}
            report={selectedReport}
            highlightedSubtaskId={highlightedSubtaskId}
            onCitationClick={onCitationClick}
            onAward={onAward}
            onCounterBid={onCounterBid}
            onRebalance={onRebalance}
            t={t}
          />
        </div>
      ) : (
        <div className="chains-view-split">
          <ReportList
            rows={reports}
            loading={loading}
            pinnedOnly={pinnedOnly}
            onPinnedOnlyChange={setPinnedOnly}
            selectedChainId={selectedChainId}
            onSelect={onSelectRow}
            onPin={onPin}
            t={t}
          />
          <ChainDetail
            chainId={selectedChainId}
            report={selectedReport}
            highlightedSubtaskId={highlightedSubtaskId}
            onCitationClick={onCitationClick}
            onAward={onAward}
            onCounterBid={onCounterBid}
            onRebalance={onRebalance}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

interface ActiveListProps {
  rows: ActiveChainRow[] | null;
  loading: boolean;
  selectedChainId: string | null;
  onSelect: (chainId: string) => void;
  onCancel: (chainId: string, reason: string) => void;
  t: TFunction;
}

function ActiveList({ rows, loading, selectedChainId, onSelect, onCancel, t }: ActiveListProps) {
  if (loading && rows === null) {
    return <div className="chains-view-list chains-view-list--loading">{t("chains.loading")}</div>;
  }
  if (!rows || rows.length === 0) {
    return <div className="chains-view-list chains-view-list--empty">{t("chains.active.empty")}</div>;
  }
  return (
    <ul className="chains-view-list" role="list">
      {rows.map((r) => {
        const tone = statusTone(r);
        const label = statusLabel(r, t);
        return (
          <li
            key={r.chainId}
            className={`chains-view-row${selectedChainId === r.chainId ? " selected" : ""}`}
            data-status-tone={tone}
            data-published={r.published ? "true" : "false"}
            data-cancelled={r.chainCancelled ? "true" : "false"}
          >
            <button
              type="button"
              className="chains-view-row-main"
              onClick={() => onSelect(r.chainId)}
            >
              <span className="chains-view-row-id">
                <code>{r.chainId}</code>
              </span>
              <span className="chains-view-row-status" data-tone={tone}>{label}</span>
              <span className="chains-view-row-progress">
                {t("chains.active.progress", {
                  partial: r.partialCount,
                  awarded: r.awardedCount,
                  total: r.subtaskCount,
                })}
              </span>
              <span className="chains-view-row-cost">
                ${r.budgetSpentUsd.toFixed(2)} / ${r.budgetMaxUsd.toFixed(2)}
              </span>
            </button>
            {!r.chainCancelled && !r.published ? (
              <button
                type="button"
                className="chains-view-row-cancel"
                onClick={() => {
                  if (confirm(t("chains.active.cancelConfirm", { chainId: r.chainId }))) {
                    void onCancel(r.chainId, "owner-cancel");
                  }
                }}
                title={t("chains.active.cancelTitle")}
              >
                {t("chains.active.cancel")}
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface ReportListProps {
  rows: ReportSummary[] | null;
  loading: boolean;
  pinnedOnly: boolean;
  onPinnedOnlyChange: (v: boolean) => void;
  selectedChainId: string | null;
  onSelect: (chainId: string) => void;
  onPin: (chainId: string, pinned: boolean) => void;
  t: TFunction;
}

function ReportList({ rows, loading, pinnedOnly, onPinnedOnlyChange, selectedChainId, onSelect, onPin, t }: ReportListProps) {
  return (
    <div className="chains-view-reports">
      <div className="chains-view-reports-filter">
        <label>
          <input
            type="checkbox"
            checked={pinnedOnly}
            onChange={(e) => onPinnedOnlyChange(e.target.checked)}
          />
          {t("chains.reports.pinnedOnly")}
        </label>
      </div>
      {loading && rows === null ? (
        <div className="chains-view-list chains-view-list--loading">{t("chains.loading")}</div>
      ) : !rows || rows.length === 0 ? (
        <div className="chains-view-list chains-view-list--empty">{t("chains.reports.empty")}</div>
      ) : (
        <ul className="chains-view-list" role="list">
          {rows.map((r) => (
            <li
              key={r.chainId}
              className={`chains-view-row chains-view-row--report${selectedChainId === r.chainId ? " selected" : ""}`}
              data-pinned={r.pinned ? "true" : "false"}
            >
              <button
                type="button"
                className="chains-view-row-main"
                onClick={() => onSelect(r.chainId)}
              >
                <span className="chains-view-row-id">
                  <code>{r.chainId}</code>
                  {r.pinned ? <span className="chains-view-row-pin">★</span> : null}
                </span>
                <span className="chains-view-row-created">{r.createdAt.slice(0, 16).replace("T", " ")}</span>
                <span className="chains-view-row-summary">
                  {t("chains.reports.summary", {
                    workers: r.chainSummary.workerCount,
                    subtasks: r.chainSummary.subtaskCount,
                    synthesis: r.chainSummary.synthesisCostUsd.toFixed(2),
                  })}
                </span>
              </button>
              <button
                type="button"
                className="chains-view-row-pin-toggle"
                onClick={() => void onPin(r.chainId, !r.pinned)}
                title={r.pinned ? t("chains.reports.unpin") : t("chains.reports.pin")}
              >
                {r.pinned ? t("chains.reports.unpin") : t("chains.reports.pin")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChainDetailProps {
  chainId: string | null;
  report: ChainReport | null;
  highlightedSubtaskId: string | null;
  onCitationClick: (subtaskId: string) => void;
  onAward: (params: { chainId: string; subtaskId: string; pickWorkerPeerId: string }) => Promise<ChainEvaluateBidsResult>;
  onCounterBid: (params: {
    chainId: string;
    subtaskId: string;
    newCostCeilingUsd: number;
    newDeadlineAt?: string;
  }) => Promise<ChainCounterBidResult>;
  onRebalance: (params: { chainId: string; additionalBudgetUsd: number }) => Promise<ChainRebalanceResult>;
  t: TFunction;
}

function ChainDetail({
  chainId,
  report,
  highlightedSubtaskId,
  onCitationClick,
  onAward,
  onCounterBid,
  onRebalance,
  t,
}: ChainDetailProps) {
  const nodeService = useNodeService();
  const [liveState, setLiveState] = useState<ChainGetStateResult | null>(null);

  // Reset live state when the selection changes.
  useEffect(() => {
    setLiveState(null);
  }, [chainId]);

  // Poll the live state once per second while we have a selection, so the
  // inbox reflects new bids without manual refresh. The parent already
  // polls `chainListActive` every 5s; this higher-frequency poll only runs
  // when a chain is selected.
  useEffect(() => {
    if (!chainId) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = (await nodeService.chainGetState({ chainId })) as ChainGetStateResult;
        if (!cancelled) setLiveState(res);
      } catch {
        // Swallow — the parent already surfaces errors.
      }
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [chainId, nodeService]);

  if (!chainId) {
    return <div className="chains-view-detail chains-view-detail--empty">{t("chains.detail.empty")}</div>;
  }

  // While the chain is in flight (no published report yet) we show the bid
  // inbox. After publication, we show the report alongside any remaining
  // inbox entries.
  const inboxSubtasks: ChainBidInboxSubtask[] = [];
  if (liveState?.bidsBySubtask) {
    for (const group of liveState.bidsBySubtask) {
      // Default cost ceiling per subtask: budget per subtask, fallback to
      // chain max if per-subtask isn't tracked yet (40B budget ledger).
      inboxSubtasks.push({
        subtaskId: group.subtaskId,
        costCeilingUsd:
          liveState.budgetMaxUsd > 0
            ? Math.max(1, Math.floor(liveState.budgetMaxUsd / Math.max(1, liveState.subtaskCount)))
            : 5,
        bids: group.bids,
      });
    }
  }

  if (!report) {
    return (
      <div className="chains-view-detail chains-view-detail--pending">
        <div className="chains-view-detail-status">{t("chains.detail.pending")}</div>
        <ChainRebalanceBar
          chainId={chainId}
          liveState={liveState}
          onRebalance={onRebalance}
          t={t}
        />
        <ChainBidInbox
          chainId={chainId}
          subtasks={inboxSubtasks}
          onAward={onAward}
          onCounterBid={onCounterBid}
          t={t}
        />
      </div>
    );
  }

  // Build a synthetic tree from the report (no live subtasks for past chains).
  // Use the first citation's subtaskId per section as a stand-in for the
  // section's owner subtask — sections group by subtask in the wire schema.
  const subtasks: ChainSubtaskNode[] = (report.sections ?? []).map((s, i) => {
    const id = s.citations?.[0]?.subtaskId ?? `${report.chainId}_section_${i}`;
    return {
      subtaskId: id,
      depth: 1,
      requiredCapability: "task.execute",
      objective: s.heading ?? t("chains.tree.stateMerged"),
      state: "merged" as const,
    };
  });
  const workersBySubtask: Record<string, ChainTreeWorkerNode[]> = {};
  for (const section of report.sections ?? []) {
    const sectionId = section.citations?.[0]?.subtaskId;
    if (!sectionId) continue;
    const workerIds = new Set<string>();
    for (const c of section.citations ?? []) {
      if (c.subtaskId) workerIds.add(c.subtaskId);
    }
    if (workerIds.size > 0) {
      workersBySubtask[sectionId] = [...workerIds].map((peerId) => ({
        workerPeerId: peerId,
        state: "merged" as const,
      }));
    }
  }
  return (
    <div className="chains-view-detail">
      <ChainTreeView
        chainId={report.chainId}
        chainMandateId={report.chainMandateId}
        subtasks={subtasks}
        workersBySubtask={workersBySubtask}
        highlightedSubtaskId={highlightedSubtaskId}
      />
      <ChainReportRenderer report={report} onCitationClick={onCitationClick} />
      {inboxSubtasks.length > 0 ? (
        <>
          <ChainRebalanceBar
            chainId={chainId}
            liveState={liveState}
            onRebalance={onRebalance}
            t={t}
          />
          <ChainBidInbox
            chainId={chainId}
            subtasks={inboxSubtasks}
            onAward={onAward}
            onCounterBid={onCounterBid}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}
