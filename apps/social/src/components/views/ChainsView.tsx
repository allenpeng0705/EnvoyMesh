/**
 * Phase 41D — ChainsView dashboard panel.
 *
 * Displays active chains with subtask progress and budget burn-down.
 * Polls chainListActive on mount and uses ConfirmDialog for cancel confirmation.
 *
 * Phase 43 follow-up: this view is now the primary chain entry point — a
 * "New chain" button + goal composer lives here (not only in AI chat), so a
 * user can start a multi-agent chain without first finding the hidden
 * "Run as chain" affordance under a chat message.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import type { BondRecord, CachedAgentCardSummary, ChainGetStateResult, ChainWorkerReachability } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useToast } from "../../hooks/useToast.js";
import { useNodeService, useAgentCards, useTransportWsOpen } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { computeChainBondHealth, isTeamJobListed, mergeReachability } from "../../lib/chain-bond-health.js";
import type { ChainBondHealth } from "../../lib/chain-bond-health.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChainReportView } from "../ChainReportView.js";
import { ChainStartDialog } from "../ChainStartDialog.js";
import type { WorkerCandidate } from "../ChainStartDialog.js";
import { ChainDetailPanel } from "../ChainDetailPanel.js";
import { AgentNetworkSettingsModal } from "../AgentNetworkSettingsModal.js";
import { AgentNetworkSkillsPreview } from "../AgentNetworkSkillsPreview.js";
import { WorkerMembershipSection } from "./settings/agent-network-sections.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainSummary {
  chainId: string;
  chainMandateId: string;
  goal?: string;
  status: "bidding" | "waitingWorkers" | "running" | "synthesizing" | "awaitingOwner" | "completed" | "cancelled";
  subtaskCount: number;
  awardedCount: number;
  completedCount: number;
  budgetSpentUsd: number;
  budgetMaxUsd: number;
  budgetWarningLevel?: ChainGetStateResult["budgetWarningLevel"];
  estimatedCostRange?: ChainGetStateResult["estimatedCostRange"];
  awardMode?: "direct" | "competitive";
  showCostUi?: boolean;
  published: boolean;
  chainCancelled: boolean;
  iteration?: ChainGetStateResult["iteration"];
}

/** Derive a human-readable status from ChainGetStateResult fields. */
function deriveStatus(r: {
  chainCancelled: boolean;
  published: boolean;
  awardedCount: number;
  subtaskCount: number;
  partialCount: number;
  cancelledCount: number;
  bidsBySubtask?: ChainGetStateResult["bidsBySubtask"];
  iteration?: ChainGetStateResult["iteration"];
}): ChainSummary["status"] {
  if (r.chainCancelled || r.cancelledCount === r.subtaskCount) return "cancelled";
  if (r.published) return "completed";
  if (r.iteration?.waitingForOwner) return "awaitingOwner";
  if (r.partialCount === r.subtaskCount && r.subtaskCount > 0) return "synthesizing";
  const bidCount = (r.bidsBySubtask ?? []).reduce((n, row) => n + row.bids.length, 0);
  if (r.awardedCount === 0 && bidCount === 0 && r.subtaskCount > 0) return "waitingWorkers";
  if (r.awardedCount < r.subtaskCount) return "bidding";
  if (r.awardedCount > 0) return "running";
  return "bidding";
}

/** Map a ChainGetStateResult to our local ChainSummary. */
function asChainSummary(r: ChainGetStateResult): ChainSummary {
  return {
    chainId: r.chainId,
    chainMandateId: r.chainMandateId,
    goal: r.goal,
    status: deriveStatus(r),
    subtaskCount: r.subtaskCount,
    awardedCount: r.awardedCount,
    completedCount: r.partialCount,
    budgetSpentUsd: r.budgetSpentUsd,
    budgetMaxUsd: r.budgetMaxUsd,
    budgetWarningLevel: r.budgetWarningLevel,
    estimatedCostRange: r.estimatedCostRange,
    awardMode: r.awardMode,
    showCostUi: r.showCostUi,
    published: r.published,
    chainCancelled: r.chainCancelled,
    iteration: r.iteration,
  };
}

function formatIterationProgress(
  it: NonNullable<ChainGetStateResult["iteration"]>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return t("chains.iteration.progress", {
    round: it.round,
    max: it.maxRounds,
    extended: it.extendsInRound,
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChainsViewProps {
  onBack?: () => void;
  onOpenDiscover?: () => void;
}

export function ChainsView({ onBack, onOpenDiscover }: ChainsViewProps = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const wsOpen = useTransportWsOpen();
  const { showToast } = useToast();
  const { bonds, nodeConfig } = useNodeState();
  const agentCards = useAgentCards();
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    chainId: string;
    onConfirm: () => void;
  } | null>(null);

  // Live reachability per bonded owner — fetched via a batch RPC so the team-job
  // dialog can show online/offline and make offline contacts non-selectable.
  // A 20s poll keeps the dots fresh while the view is mounted.
  const [reachabilityByOwner, setReachabilityByOwner] = useState<Map<string, ChainWorkerReachability>>(new Map());

  // Local Join'd agent — Team job creator is also a worker (always online when
  // Built-in OpenClaw / AN engine is ready).
  const [localWorkerCard, setLocalWorkerCard] = useState<CachedAgentCardSummary | undefined>();
  const [openClawRunning, setOpenClawRunning] = useState<boolean | null>(null);
  useEffect(() => {
    if (!wsOpen || nodeConfig?.capabilityProviderEnabled !== true) {
      setLocalWorkerCard(undefined);
      setOpenClawRunning(null);
      return;
    }
    let cancelled = false;
    void nodeService
      .getLocalAgentNetworkWorkerCard()
      .then((card) => {
        if (!cancelled) setLocalWorkerCard(card);
      })
      .catch(() => {
        if (!cancelled) setLocalWorkerCard(undefined);
      });
    void nodeService
      .getOpenClawStatus()
      .then((s) => {
        if (!cancelled) setOpenClawRunning(Boolean(s?.running));
      })
      .catch(() => {
        if (!cancelled) setOpenClawRunning(false);
      });
    const timer = setInterval(() => {
      void nodeService.getOpenClawStatus().then((s) => {
        if (!cancelled) setOpenClawRunning(Boolean(s?.running));
      }).catch(() => {
        if (!cancelled) setOpenClawRunning(false);
      });
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    nodeService,
    wsOpen,
    nodeConfig?.capabilityProviderEnabled,
    nodeConfig?.agentNetworkProfile,
  ]);

  // Bonded contacts with agent-card health — used in the empty state and
  // passed to ChainStartDialog so the user sees who can join a team job.
  // Three dimensions: card freshness, agent-network opt-in, online reachability.
  // Local "You" uses the same readiness/order rules as peers (may be offline
  // when Built-in OpenClaw is down).
  const workerCandidates = useMemo((): WorkerCandidate[] => {
    const others = bonds
      .filter((b) => b.level !== "blocked")
      .filter((b) => b.peerOwnerId !== localWorkerCard?.ownerId)
      .map((bond) => {
        const card = agentCards.find((c) => c.ownerId === bond.peerOwnerId);
        const base = computeChainBondHealth(bond, card);
        const health = mergeReachability(base, reachabilityByOwner.get(bond.peerOwnerId));
        return { bond, card, health };
      });

    const rows: WorkerCandidate[] = [...others];
    if (localWorkerCard?.sourceAgentPeerId) {
      const selfBond: BondRecord = {
        peerOwnerId: localWorkerCard.ownerId,
        displayName: localWorkerCard.displayName,
        level: "direct",
        createdAt: new Date(0).toISOString(),
      };
      const selfHealth: ChainBondHealth = {
        status: "ready",
        cardStatus: "ready",
        onlineStatus: openClawRunning === false ? "offline" : "online",
        optIn: true,
        engineReady: openClawRunning !== false,
        capabilityCount: localWorkerCard.membership.length,
        lastSyncedAt: localWorkerCard.cachedAt,
        label: "Ready",
      };
      rows.push({
        bond: selfBond,
        card: localWorkerCard,
        health: selfHealth,
        isSelf: true,
      });
    }

    return rows.sort((a, b) => {
      const score = (h: typeof a.health) =>
        (h.onlineStatus === "online" ? 0 : h.onlineStatus === "unknown" ? 1 : 2) * 4 +
        ({ ready: 0, stale: 1, missing: 2, blocked: 3 }[h.status] ?? 9);
      return score(a.health) - score(b.health);
    });
  }, [bonds, agentCards, reachabilityByOwner, localWorkerCard, openClawRunning]);

  // Opted-in contacts with a cached agent card — shown even when offline so
  // the list is not empty while reachability is warming. Starting a job still
  // requires isTeamJobReady (online) in ChainStartDialog.
  const teamListedCandidates = useMemo(
    () => workerCandidates.filter((w) => isTeamJobListed(w.card, w.health)),
    [workerCandidates],
  );

  // Chain creation flow (Phase 43 follow-up): a "New chain" button opens a
  // goal composer; the preview+launch reuses ChainStartDialog.
  const [newChainGoal, setNewChainGoal] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");

  // Agent Network settings modal (fleet onboarding + advanced) — opened from
  // the "Manage workers" button in the header.
  const [showSettings, setShowSettings] = useState(false);

  // Collapsible "Join Agent Network" inline section (Tier 1).
  const [showMembership, setShowMembership] = useState(false);

  // Chain detail view: clicking an active chain opens the management panel
  // (bid inbox + subtask tree + rebalance bar) that was previously orphaned.
  const [detailChainId, setDetailChainId] = useState<string | null>(null);

  const loadChains = useCallback(async () => {
    try {
      const result = await nodeService.chainListActive();
      setChains((result.chains ?? []).map(asChainSummary));
    } catch (err) {
      console.error("[ChainsView] failed to load active chains:", err);
    }
  }, [nodeService]);

  useEffect(() => {
    setLoading(true);
    void loadChains().finally(() => setLoading(false));
  }, [loadChains]);

  // Batch-probe reachability for every bonded contact, then refresh on a 20s
  // cadence so the online/offline dots stay current while the view is open.
  const loadReachability = useCallback(async () => {
    const ownerIds = bonds.filter((b) => b.level !== "blocked").map((b) => b.peerOwnerId);
    if (ownerIds.length === 0) {
      setReachabilityByOwner(new Map());
      return;
    }
    try {
      const result = await nodeService.chainProbeReachability({ ownerIds });
      setReachabilityByOwner(new Map((result.rows ?? []).map((r) => [r.ownerId, r])));
    } catch (err) {
      console.error("[ChainsView] failed to probe worker reachability:", err);
    }
  }, [nodeService, bonds]);

  useEffect(() => {
    void loadReachability();
    const timer = setInterval(() => void loadReachability(), 20_000);
    return () => clearInterval(timer);
  }, [loadReachability]);

  // Pull + push agent cards when Team jobs opens (and when WS connects) so
  // Join'd peers appear without a manual Settings → Refresh workers click.
  useEffect(() => {
    if (!wsOpen || !nodeService.isConnected) return;
    void nodeService.refreshAgentNetworkWorkers().catch((err) => {
      console.error("[ChainsView] refreshAgentNetworkWorkers failed:", err);
    });
  }, [nodeService, wsOpen, nodeService.isConnected]);

  useEffect(() => {
    const unsub = nodeService.on("chain:state", (state) => {
      setChains((prev) => {
        const next = asChainSummary(state);
        const idx = prev.findIndex((c) => c.chainId === next.chainId);
        if (idx < 0) return [next, ...prev];
        return prev.map((c, i) => (i === idx ? next : c));
      });
    });
    return unsub;
  }, [nodeService]);

  const handleCancel = useCallback(
    (chainId: string) => {
      setConfirm({
        chainId,
        onConfirm: async () => {
          setConfirm(null);
          try {
            await nodeService.chainCancel({
              chainId,
              reason: "Cancelled by owner",
              cancelledBy: "owner",
            });
            void loadChains();
            showToast(t("chains.active.cancelled"), "success");
          } catch (err) {
            console.error("[ChainsView] chainCancel failed:", err);
            showToast(t("chains.active.cancelFailed"), "error");
          }
        },
      });
    },
    [nodeService, loadChains, showToast, t],
  );

  const handleViewReport = useCallback((chainId: string) => {
    setViewingReport((prev) => (prev === chainId ? null : chainId));
  }, []);

  const handleExportCosts = useCallback(
    async (chainId: string) => {
      try {
        const result = await nodeService.chainExportCosts({ chainId });
        const blob = new Blob([result.csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${chainId}-costs.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("[ChainsView] chainExportCosts failed:", err);
        showToast(t("chains.start.failed"), "error");
      }
    },
    [nodeService, showToast, t],
  );

  // Quick-start goal templates — mirror the Phase 43B RPC defaults so a new
  // user has one-tap on-ramps without having to author a goal from scratch.
  const goalTemplates: { label: string; goal: string }[] = [
    { label: t("chains.start.template.research"), goal: t("chains.start.template.researchGoal") },
    { label: t("chains.start.template.summarize"), goal: t("chains.start.template.summarizeGoal") },
    { label: t("chains.start.template.askNetwork"), goal: t("chains.start.template.askNetworkGoal") },
  ];

  const openComposer = useCallback((initialGoal?: string) => {
    setGoalDraft(initialGoal ?? "");
    setComposing(true);
  }, []);

  const launchChain = useCallback(() => {
    const goal = goalDraft.trim();
    if (!goal) return;
    setComposing(false);
    setNewChainGoal(goal);
  }, [goalDraft]);

  const handleStarted = useCallback(() => {
    setNewChainGoal(null);
    void loadChains();
  }, [loadChains]);

  // ---- Render ----

  if (loading && chains.length === 0) {
    return (
      <div className="chains-view">
        <div className="chains-view__header">
          <h3>{t("chains.nav")}</h3>
        </div>
        <p className="chains-loading">{t("chains.loading")}</p>
      </div>
    );
  }

  const activeChains = chains.filter(
    (c) => c.status !== "completed" && c.status !== "cancelled",
  );
  const completedChains = chains.filter((c) => c.status === "completed");
  const cancelledChains = chains.filter((c) => c.status === "cancelled");

  // When a chain detail is open, render the management panel instead of the list.
  if (detailChainId) {
    const chain = chains.find((c) => c.chainId === detailChainId);
    return (
      <div className="chains-view">
        <ChainDetailPanel
          chainId={detailChainId}
          goal={chain?.goal}
          onBack={() => setDetailChainId(null)}
          onChanged={() => void loadChains()}
        />
      </div>
    );
  }

  return (
    <div className="chains-view">
      <div className="chains-view__header">
        <h3>{t("chains.nav")}</h3>
        <div className="chains-view__header-actions">
          <button
            type="button"
            className="secondary btn-sm chains-view__manage-btn"
            onClick={() => setShowSettings(true)}
          >
            {t("chains.manageWorkers.button")}
          </button>
          <button
            type="button"
            className="primary btn-sm chains-view__new-btn"
            onClick={() => openComposer()}
          >
            {t("chains.start.newChain")}
          </button>
        </div>
      </div>

      {/* Tier 1 — inline collapsible sections (daily-use controls) */}
      <div className="chains-view__inline-settings">
        <button
          type="button"
          className="chains-view__inline-toggle"
          aria-expanded={showMembership}
          onClick={() => setShowMembership((v) => !v)}
        >
          <span className="chains-view__inline-chevron">
            {showMembership ? "▾" : "▸"}
          </span>
          {t("chains.workerProfile.title")}
        </button>
        {showMembership ? (
          <div className="chains-view__inline-body">
            <WorkerMembershipSection />
          </div>
        ) : null}
      </div>

      {composing ? (
        <div className="chain-composer">
          <label htmlFor="chain-goal-input" className="chain-composer__label">
            {t("chains.start.composerLabel")}
          </label>
          <textarea
            id="chain-goal-input"
            className="chain-composer__input"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            placeholder={t("chains.start.composerPlaceholder")}
            rows={3}
            autoFocus
          />
          <div className="chain-composer__templates">
            {goalTemplates.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                className="topic-chip chain-composer__template"
                onClick={() => setGoalDraft(tpl.goal)}
              >
                {tpl.label}
              </button>
            ))}
          </div>
          <div className="chain-composer__actions">
            <button type="button" className="secondary btn-sm" onClick={() => setComposing(false)}>
              {t("chains.start.cancel")}
            </button>
            <button
              type="button"
              className="primary btn-sm"
              onClick={launchChain}
              disabled={goalDraft.trim().length < 8}
            >
              {t("chains.start.preview")}
            </button>
          </div>
        </div>
      ) : null}

      {newChainGoal ? (
        <ChainStartDialog
          goal={newChainGoal}
          onClose={() => setNewChainGoal(null)}
          onStarted={handleStarted}
          onOpenDiscover={onOpenDiscover}
          workerCandidates={workerCandidates}
        />
      ) : null}

      {showSettings ? (
        <AgentNetworkSettingsModal onClose={() => setShowSettings(false)} />
      ) : null}

      {activeChains.length === 0 && !composing ? (
        <div className="chains-empty">
          <p>{t("chains.active.empty")}</p>
          <p className="chains-empty__hint">{t("chains.active.prerequisite")}</p>
          {teamListedCandidates.length > 0 || workerCandidates.length > 0 ? (
            <div className="chains-empty__contacts">
              <h4 className="chains-empty__contacts-title">{t("chains.start.contactsTitle")}</h4>
              <p className="chains-empty__contacts-desc">
                {teamListedCandidates.length > 0
                  ? t("chains.start.contactsDesc")
                  : t("chains.start.contactsNotReady")}
              </p>
              <ul className="chain-workers__list">
                {(teamListedCandidates.length > 0 ? teamListedCandidates : workerCandidates)
                  .slice(0, 6)
                  .map(({ bond, card, health, isSelf }) => {
                  const displayName = isSelf
                    ? t("chains.start.youLabel")
                    : (bond.displayName ?? bond.libp2pPeerId?.slice(0, 10) ?? bond.peerOwnerId.slice(0, 10));
                  return (
                  <li key={isSelf ? "self" : bond.peerOwnerId} className={`chain-worker-card${isSelf ? " chain-worker-card--self" : ""}`}>
                    <div className="chain-worker-card__avatar">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="chain-worker-card__info">
                      <span className="chain-worker-card__name">
                        {displayName}
                      </span>
                      <div className="chain-worker-card__meta">
                        <span
                          className={`chain-worker-card__online chain-worker-card__online--${health.onlineStatus}`}
                          title={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                          aria-label={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                        />
                        <span className={`chain-worker-card__tier chain-worker-card__tier--${isSelf ? "self" : bond.level}`}>
                          {isSelf ? t("chains.start.youTier") : bond.level}
                        </span>
                        <span className={`chain-bond-health chain-bond-health--${health.cardStatus}`}>
                          {health.cardStatus === "ready" ? "✓" : health.cardStatus === "stale" ? "⏳" : "?"}
                          {" "}
                          {t(`chains.start.contact${health.cardStatus.charAt(0).toUpperCase() + health.cardStatus.slice(1)}`)}
                        </span>
                        {!health.optIn ? (
                          <span className="chain-worker-card__caps muted">
                            {t("chains.start.notOptedInReason")}
                          </span>
                        ) : null}
                        {isSelf && health.engineReady === false ? (
                          <span className="chain-worker-card__caps muted">
                            {t("chains.start.engineOfflineReason")}
                          </span>
                        ) : null}
                      </div>
                      <AgentNetworkSkillsPreview card={card} compact />
                    </div>
                  </li>
                );})}
              </ul>
            </div>
          ) : (
            <p className="chains-empty__hint">{t("chains.start.contactsEmpty")}</p>
          )}
        </div>
      ) : (
        activeChains.map((chain) => (
          <div
            key={chain.chainId}
            className="chain-card chain-card--clickable"
            onClick={() => setDetailChainId(chain.chainId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDetailChainId(chain.chainId);
              }
            }}
          >
            <div className="chain-card-header">
              <span className={`chain-status-badge status-${chain.status}`}>
                {chain.status === "running"
                  ? "🔄"
                  : chain.status === "synthesizing"
                    ? "🧩"
                    : chain.status === "waitingWorkers"
                      ? "📡"
                      : chain.status === "awaitingOwner"
                        ? "👤"
                        : "⏳"}
                {" "}
                {chain.status === "bidding" && chain.awardMode !== "competitive"
                  ? t("chains.status.assigning")
                  : t(`chains.status.${chain.status}`)}
              </span>
              <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
            </div>

            {chain.goal ? <p className="chain-card-goal">{chain.goal}</p> : null}
            {chain.iteration && (chain.iteration.maxRounds > 1 || chain.iteration.extendsInRound > 0) ? (
              <p className="chain-card-iteration" data-testid="chain-iteration-progress">
                {formatIterationProgress(chain.iteration, t)}
              </p>
            ) : null}
            {chain.showCostUi && chain.estimatedCostRange ? (
              <p className="chain-card-estimate">
                {t("chains.start.costRange", {
                  min: chain.estimatedCostRange.minUsd.toFixed(2),
                  max: chain.estimatedCostRange.maxUsd.toFixed(2),
                })}
              </p>
            ) : null}
            {chain.showCostUi && chain.budgetWarningLevel === "warn" ? (
              <p className="chain-budget-warn">{t("chains.rebalance.warn", { percent: 80 })}</p>
            ) : chain.showCostUi && chain.budgetWarningLevel === "exceeded" ? (
              <p className="chain-budget-exceeded">{t("chains.rebalance.exceeded")}</p>
            ) : null}

            <div className="chain-card-progress">
              <span>
                {t("chains.active.progress", {
                  partial: chain.completedCount,
                  awarded: chain.awardedCount,
                  total: chain.subtaskCount,
                })}
              </span>
              {chain.showCostUi ? (
                <span>
                  {t("chains.rebalance.spent", {
                    spent: chain.budgetSpentUsd.toFixed(2),
                    max: chain.budgetMaxUsd.toFixed(2),
                  })}
                </span>
              ) : null}
            </div>

            <div className="chain-card-actions">
              <button
                type="button"
                className="btn-sm chain-card__manage-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailChainId(chain.chainId);
                }}
              >
                {t("chains.active.manage")}
              </button>
              {chain.showCostUi ? (
                <button
                  type="button"
                  className="btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExportCosts(chain.chainId);
                  }}
                >
                  {t("chains.start.exportCsv")}
                </button>
              ) : null}
              <button
                className="btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel(chain.chainId);
                }}
              >
                {t("chains.active.cancel")}
              </button>
            </div>
          </div>
        ))
      )}

      {/* Opted-in contacts with agent cards — include offline so the list
          is not empty while reachability is warming. Online badge still
          reflects chainProbeReachability. */}
      {activeChains.length > 0 && teamListedCandidates.length > 0 ? (
        <div className="chains-empty__contacts chains-contacts">
          <h4 className="chains-empty__contacts-title">{t("chains.start.contactsTitle")}</h4>
          <p className="chains-empty__contacts-desc">{t("chains.start.contactsDesc")}</p>
          <ul className="chain-workers__list">
            {teamListedCandidates.slice(0, 6).map(({ bond, card, health, isSelf }) => {
              const displayName = isSelf
                ? t("chains.start.youLabel")
                : (bond.displayName ?? bond.libp2pPeerId?.slice(0, 10) ?? bond.peerOwnerId.slice(0, 10));
              return (
              <li key={isSelf ? "self" : bond.peerOwnerId} className={`chain-worker-card${isSelf ? " chain-worker-card--self" : ""}`}>
                <div className="chain-worker-card__avatar">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="chain-worker-card__info">
                  <span className="chain-worker-card__name">
                    {displayName}
                  </span>
                  <div className="chain-worker-card__meta">
                    <span
                      className={`chain-worker-card__online chain-worker-card__online--${health.onlineStatus}`}
                      title={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                      aria-label={t(`chains.start.reach${health.onlineStatus.charAt(0).toUpperCase() + health.onlineStatus.slice(1)}`)}
                    />
                    <span className={`chain-worker-card__tier chain-worker-card__tier--${isSelf ? "self" : bond.level}`}>
                      {isSelf ? t("chains.start.youTier") : bond.level}
                    </span>
                    <span className={`chain-bond-health chain-bond-health--${health.cardStatus}`}>
                      {health.cardStatus === "ready" ? "✓" : health.cardStatus === "stale" ? "⏳" : "?"}
                      {" "}
                      {t(`chains.start.contact${health.cardStatus.charAt(0).toUpperCase() + health.cardStatus.slice(1)}`)}
                    </span>
                    {isSelf && health.engineReady === false ? (
                      <span className="chain-worker-card__caps muted">
                        {t("chains.start.engineOfflineReason")}
                      </span>
                    ) : null}
                  </div>
                  <AgentNetworkSkillsPreview card={card} compact />
                </div>
              </li>
            );})}
          </ul>
        </div>
      ) : null}

      {completedChains.length > 0 && (
        <>
          <h3>{t("chains.reports.title")}</h3>
          {completedChains.map((chain) => (
            <div
              key={chain.chainId}
              className="chain-card chain-card-completed"
            >
              <div className="chain-card-header">
                <span className="chain-status-badge status-completed">
                  ✅ {t("chains.status.published")}
                </span>
                <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
                <span className="chain-cost">
                  {t("chains.rebalance.spent", {
                    spent: chain.budgetSpentUsd.toFixed(2),
                    max: chain.budgetMaxUsd.toFixed(2),
                  })}
                </span>
              </div>
              {chain.goal ? <p className="chain-card-goal">{chain.goal}</p> : null}
              <div className="chain-card-actions">
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => void handleExportCosts(chain.chainId)}
                >
                  {t("chains.start.exportCsv")}
                </button>
                <button
                  className="btn-sm"
                  onClick={() => handleViewReport(chain.chainId)}
                >
                  {viewingReport === chain.chainId
                    ? t("chains.reports.hideReport")
                    : t("chains.reports.viewReport")}
                </button>
              </div>

              {viewingReport === chain.chainId && (
                <ChainReportView
                  chainId={chain.chainId}
                  onClose={() => setViewingReport(null)}
                />
              )}
            </div>
          ))}
        </>
      )}

      {cancelledChains.length > 0 && (
        <>
          <h3>{t("chains.status.cancelled")}</h3>
          {cancelledChains.map((chain) => (
            <div
              key={chain.chainId}
              className="chain-card chain-card-failed"
            >
              <span className="chain-status-badge status-cancelled">
                ❌ {t("chains.status.cancelled")}
              </span>
              <code className="chain-id">{chain.chainId.slice(0, 12)}…</code>
            </div>
          ))}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={t("chains.active.cancelConfirm")}
          message={t("chains.active.cancelConfirmMessage")}
          variant="destructive"
          confirmLabel={t("chains.active.cancel")}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
