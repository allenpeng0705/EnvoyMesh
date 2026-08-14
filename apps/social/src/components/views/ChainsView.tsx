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

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import type {
  BondRecord,
  CachedAgentCardSummary,
  ChainGetStateResult,
  ChainListReportsResult,
  ChainObservedStatus,
  ChainWorkerReachability,
} from "@envoymesh/api";
import { agentNetworkPrimaryRole } from "@envoymesh/protocol";
import { useT } from "../../context/I18nContext.js";
import { useToast } from "../../hooks/useToast.js";
import { useNodeService, useAgentCards, useTransportWsOpen } from "../../hooks/useNodeService.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { computeChainBondHealth, isTeamJobListed, mergeReachability } from "../../lib/chain-bond-health.js";
import type { ChainBondHealth } from "../../lib/chain-bond-health.js";
import {
  buildChainGoalWithAttachments,
  CHAIN_ATTACHMENT_LABEL_MAX_CHARS,
  CHAIN_COMPOSER_MAX_ATTACHMENTS,
  CHAIN_COMPOSER_MAX_FILE_BYTES,
  sanitizeAttachmentLabel,
  sanitizeTeamJobFileName,
} from "../../lib/chain-goal-attachments.js";
import { ConfirmDialog } from "../ConfirmDialog.js";
import { ChainReportView } from "../ChainReportView.js";
import { ChainStartDialog } from "../ChainStartDialog.js";
import type { WorkerCandidate } from "../ChainStartDialog.js";
import { FleetReadinessPanel } from "../FleetReadinessPanel.js";
import {
  buildFleetReadinessChecklist,
  summarizeFleetReadinessInput,
} from "../../lib/fleet-readiness.js";
import { classifyObservedJobBadge } from "../../lib/observed-job-badge.js";
import { ChainDetailPanel } from "../ChainDetailPanel.js";
import { AgentNetworkSettingsModal } from "../AgentNetworkSettingsModal.js";
import { AgentNetworkSkillsPreview } from "../AgentNetworkSkillsPreview.js";
import { WorkerMembershipSection } from "./settings/agent-network-sections.js";

type ComposerAttachment = {
  id: string;
  fileName: string;
  relativePath?: string;
  /** Short alias written into the job goal as [label]. */
  label?: string;
  uploading?: boolean;
  error?: string;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChainSummary {
  chainId: string;
  chainMandateId: string;
  goal?: string;
  status:
    | "bidding"
    | "assigning"
    | "waitingWorkers"
    | "running"
    | "synthesizing"
    | "awaitingOwner"
    | "completed"
    | "cancelled";
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
  awardMode?: ChainGetStateResult["awardMode"];
}): ChainSummary["status"] {
  if (r.chainCancelled || r.cancelledCount === r.subtaskCount) return "cancelled";
  if (r.published) return "completed";
  if (r.iteration?.waitingForOwner) return "awaitingOwner";
  if (r.partialCount === r.subtaskCount && r.subtaskCount > 0) return "synthesizing";
  const bidCount = (r.bidsBySubtask ?? []).reduce((n, row) => n + row.bids.length, 0);
  if (r.awardedCount === 0 && bidCount === 0 && r.subtaskCount > 0) return "waitingWorkers";
  // Direct assign: worker ACK is still task.chain.bid on the wire, but the UI
  // must not say "Bidding" — that label is reserved for competitive mode.
  const preAward =
    r.awardMode === "competitive" ? ("bidding" as const) : ("assigning" as const);
  if (r.awardedCount < r.subtaskCount) return preAward;
  if (r.awardedCount > 0) return "running";
  return preAward;
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

function formatReportListTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ChainsViewProps {
  onBack?: () => void;
  onOpenDiscover?: () => void;
  onOpenSettingsAi?: () => void;
}

export function ChainsView({ onBack, onOpenDiscover, onOpenSettingsAi }: ChainsViewProps = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const wsOpen = useTransportWsOpen();
  const { showToast } = useToast();
  const { bonds, nodeConfig } = useNodeState();
  const agentCards = useAgentCards();
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [observed, setObserved] = useState<ChainObservedStatus[]>([]);
  /** Persisted reports from chainListReports — not only in-memory completed active rows. */
  const [reports, setReports] = useState<ChainListReportsResult["reports"]>([]);
  const [viewingReport, setViewingReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: "cancel" | "deleteReport";
    chainId: string;
    onConfirm: () => void;
  } | null>(null);

  // Live reachability per bonded owner — fetched via a batch RPC so the team-job
  // dialog can show online/offline and make offline contacts non-selectable.
  // A 20s poll keeps the dots fresh while the view is mounted.
  const [reachabilityByOwner, setReachabilityByOwner] = useState<Map<string, ChainWorkerReachability>>(new Map());

  // Local Join'd agent — Team job creator is also a worker (online when the
  // node-owner AN engine — OpenClaw or Ext Agent — is ready).
  const [localWorkerCard, setLocalWorkerCard] = useState<CachedAgentCardSummary | undefined>();
  const [anEngineReady, setAnEngineReady] = useState<boolean | null>(null);
  const anWorkerEngine = nodeConfig?.agentNetworkWorkerEngine === "ext" ? "ext" : "openclaw";
  useEffect(() => {
    if (!wsOpen || nodeConfig?.capabilityProviderEnabled !== true) {
      setLocalWorkerCard(undefined);
      setAnEngineReady(null);
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
    const refreshEngineReady = () => {
      if (anWorkerEngine === "ext") {
        const bridgeOn = nodeConfig?.bridgeEnabled !== false;
        const hasUrl = Boolean(nodeConfig?.bridgeStatus?.agentUrl?.trim());
        if (!bridgeOn || !hasUrl) {
          if (!cancelled) setAnEngineReady(false);
          return;
        }
        void nodeService
          .probeExtAgent?.()
          .then((r) => {
            if (!cancelled) setAnEngineReady(Boolean(r?.reachable));
          })
          .catch(() => {
            // URL present — treat as ready if probe unavailable
            if (!cancelled) setAnEngineReady(true);
          });
        return;
      }
      void nodeService
        .getOpenClawStatus()
        .then((s) => {
          if (!cancelled) setAnEngineReady(Boolean(s?.running));
        })
        .catch(() => {
          if (!cancelled) setAnEngineReady(false);
        });
    };
    refreshEngineReady();
    const timer = setInterval(refreshEngineReady, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [
    nodeService,
    wsOpen,
    nodeConfig?.capabilityProviderEnabled,
    nodeConfig?.agentNetworkProfile,
    nodeConfig?.agentNetworkWorkerEngine,
    nodeConfig?.bridgeEnabled,
    nodeConfig?.bridgeStatus?.agentUrl,
    anWorkerEngine,
  ]);

  // Bonded contacts with agent-card health — used in the empty state and
  // passed to ChainStartDialog so the user sees who can join a team job.
  // Three dimensions: card freshness, agent-network opt-in, online reachability.
  // Local "You" uses the same readiness/order rules as peers (may be offline
  // when the configured AN engine is down).
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
        onlineStatus: anEngineReady === false ? "offline" : "online",
        optIn: true,
        engineReady: anEngineReady !== false,
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
  }, [bonds, agentCards, reachabilityByOwner, localWorkerCard, anEngineReady]);

  // Opted-in contacts with a cached agent card — shown even when offline so
  // the list is not empty while reachability is warming. Starting a job still
  // requires isTeamJobReady (online) in ChainStartDialog.
  const teamListedCandidates = useMemo(
    () => workerCandidates.filter((w) => isTeamJobListed(w.card, w.health)),
    [workerCandidates],
  );

  const fleetReadiness = useMemo(
    () =>
      buildFleetReadinessChecklist(
        summarizeFleetReadinessInput({
          localJoin: nodeConfig?.capabilityProviderEnabled === true,
          engineReady:
            nodeConfig?.capabilityProviderEnabled === true ? anEngineReady : null,
          bondedPeerCount: bonds.filter((b) => b.level !== "blocked").length,
          candidates: workerCandidates,
        }),
      ),
    [anEngineReady, bonds, nodeConfig?.capabilityProviderEnabled, workerCandidates],
  );

  // Chain creation flow (Phase 43 follow-up): a "New chain" button opens a
  // goal composer; the preview+launch reuses ChainStartDialog.
  const [newChainGoal, setNewChainGoal] = useState<string | null>(null);
  const [newChainDisplayGoal, setNewChainDisplayGoal] = useState<string>("");
  const [newChainAttachments, setNewChainAttachments] = useState<
    Array<{ fileName: string; relativePath: string; label?: string }>
  >([]);
  const [composing, setComposing] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [composerAssignmentMode, setComposerAssignmentMode] = useState<"skill" | "role">("skill");
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [composerBatchId, setComposerBatchId] = useState(() => `tj_${Date.now().toString(36)}`);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const obs = await nodeService.chainListObserved?.();
      setObserved(obs?.chains ?? []);
    } catch (err) {
      console.error("[ChainsView] failed to load observed chains:", err);
    }
    try {
      const reps = await nodeService.chainListReports?.({ limit: 30 });
      setReports(reps?.reports ?? []);
    } catch (err) {
      console.error("[ChainsView] failed to load chain reports:", err);
    }
  }, [nodeService]);

  useEffect(() => {
    setLoading(true);
    void loadChains().finally(() => setLoading(false));
    // Active list / observed cards only update on WS push today; if a
    // chain:state or chain:observed event is missed, badges stay Assigning/Running
    // and the Reports section stays empty. Poll while Team jobs is open.
    const timer = setInterval(() => void loadChains(), 8_000);
    return () => clearInterval(timer);
  }, [loadChains]);

  // Batch-probe reachability for every bonded contact, then refresh on a 20s
  // cadence so the online/offline dots stay current while the view is open.
  const loadReachability = useCallback(async () => {
    const ownerIds = bonds.filter((b) => b.level !== "blocked").map((b) => b.peerOwnerId);
    if (ownerIds.length === 0) {
      setReachabilityByOwner((prev) => (prev.size === 0 ? prev : new Map()));
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
    const unsubState = nodeService.on("chain:state", (state) => {
      setChains((prev) => {
        const next = asChainSummary(state);
        const idx = prev.findIndex((c) => c.chainId === next.chainId);
        if (idx < 0) return [next, ...prev];
        return prev.map((c, i) => (i === idx ? next : c));
      });
      if (state.published) {
        void nodeService.chainListReports?.({ limit: 30 }).then((reps) => {
          setReports(reps?.reports ?? []);
        });
      }
    });
    const unsubObserved = nodeService.on("chain:observed", (snap) => {
      setObserved((prev) => {
        if (snap.phase === "completed" || snap.phase === "cancelled") {
          return prev.filter((c) => c.chainId !== snap.chainId);
        }
        const idx = prev.findIndex((c) => c.chainId === snap.chainId);
        if (idx < 0) return [snap, ...prev];
        return prev.map((c, i) => (i === idx ? snap : c));
      });
    });
    const unsubReport = nodeService.on("chain:report", () => {
      void nodeService.chainListReports?.({ limit: 30 }).then((reps) => {
        setReports(reps?.reports ?? []);
      });
    });
    return () => {
      unsubState();
      unsubObserved();
      unsubReport();
    };
  }, [nodeService]);

  const handleCancel = useCallback(
    (chainId: string) => {
      setConfirm({
        kind: "cancel",
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

  const handleDeleteReport = useCallback(
    (chainId: string) => {
      setConfirm({
        kind: "deleteReport",
        chainId,
        onConfirm: async () => {
          setConfirm(null);
          try {
            if (typeof nodeService.chainDeleteReport !== "function") {
              showToast(t("chains.reports.deleteFailedRestart"), "error");
              return;
            }
            const result = await nodeService.chainDeleteReport({ chainId });
            if (!result?.deleted) {
              showToast(t("chains.reports.deleteFailed"), "error");
              return;
            }
            setReports((prev) => prev.filter((r) => r.chainId !== chainId));
            setChains((prev) => prev.filter((c) => c.chainId !== chainId));
            setViewingReport((prev) => (prev === chainId ? null : prev));
            showToast(t("chains.reports.deleted"), "success");
          } catch (err) {
            console.error("[ChainsView] chainDeleteReport failed:", err);
            const msg = err instanceof Error ? err.message : String(err);
            // Old node builds reject the RPC until restarted against new code.
            if (/unknown method|is not a function|not a function/i.test(msg)) {
              showToast(t("chains.reports.deleteFailedRestart"), "error");
              return;
            }
            showToast(t("chains.reports.deleteFailed"), "error");
          }
        },
      });
    },
    [nodeService, showToast, t],
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
    {
      label: t("chains.start.template.engineerBrief"),
      goal: t("chains.start.template.engineerBriefGoal"),
    },
  ];

  const openComposer = useCallback(
    (initialGoal?: string) => {
      setGoalDraft(initialGoal ?? "");
      setComposerAttachments([]);
      setComposerBatchId(`tj_${Date.now().toString(36)}`);
      setComposerAssignmentMode("skill");
      setComposing(true);
      void nodeService
        .chainGetDefaults?.({})
        .then((r) => {
          setComposerAssignmentMode(r.defaults?.assignmentMode === "role" ? "role" : "skill");
        })
        .catch(() => undefined);
    },
    [nodeService],
  );

  const closeComposer = useCallback(() => {
    setComposing(false);
    setComposerAttachments([]);
  }, []);

  const uploadComposerFile = useCallback(
    async (id: string, file: File) => {
      setComposerAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploading: true, error: undefined } : a)),
      );
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        const contentBase64 = btoa(binary);
        const safeName = sanitizeTeamJobFileName(file.name);
        const relativePath = `imports/team-jobs/${composerBatchId}/${safeName}`;
        const result = await nodeService.importToLibrary({
          relativePath,
          contentBase64,
          mimeType: file.type || undefined,
        });
        const path = result.relativePath || relativePath;
        setComposerAttachments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, uploading: false, relativePath: path, error: undefined }
              : a,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setComposerAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: false, error: msg } : a)),
        );
        showToast(msg, "error");
      }
    },
    [composerBatchId, nodeService, showToast],
  );

  const onPickComposerFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const incoming = Array.from(fileList);
      const room = CHAIN_COMPOSER_MAX_ATTACHMENTS - composerAttachments.length;
      if (room <= 0) {
        showToast(t("chains.start.attachmentsMax", { max: CHAIN_COMPOSER_MAX_ATTACHMENTS }), "error");
        return;
      }
      const toUpload: Array<{ id: string; file: File }> = [];
      const accepted: ComposerAttachment[] = [];
      for (const file of incoming) {
        if (accepted.length >= room) {
          showToast(t("chains.start.attachmentsMax", { max: CHAIN_COMPOSER_MAX_ATTACHMENTS }), "error");
          break;
        }
        if (file.size > CHAIN_COMPOSER_MAX_FILE_BYTES) {
          showToast(
            t("chains.start.attachmentTooLarge", {
              name: file.name,
              maxMb: Math.round(CHAIN_COMPOSER_MAX_FILE_BYTES / (1024 * 1024)),
            }),
            "error",
          );
          continue;
        }
        const id = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        accepted.push({ id, fileName: file.name, uploading: true });
        toUpload.push({ id, file });
      }
      if (accepted.length === 0) return;
      setComposerAttachments((prev) => [...prev, ...accepted]);
      for (const item of toUpload) {
        void uploadComposerFile(item.id, item.file);
      }
    },
    [composerAttachments.length, showToast, t, uploadComposerFile],
  );

  const localPrimaryRole = agentNetworkPrimaryRole(
    localWorkerCard?.agentNetworkProfile?.roles ?? nodeConfig?.agentNetworkProfile?.roles,
  );
  const showEmptyRoleGuide =
    composing && composerAssignmentMode === "role" && !localPrimaryRole;

  const openWorkerProfileForRole = useCallback(() => {
    setShowMembership(true);
    window.setTimeout(() => {
      const el = document.getElementById("anp-primary-role") ?? document.getElementById("anp-custom-role");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement) el.focus();
    }, 50);
  }, []);

  const attachmentsUploading = composerAttachments.some((a) => a.uploading);
  const readyAttachments = useMemo(
    () =>
      composerAttachments
        .filter((a) => a.relativePath && !a.uploading && !a.error)
        .map((a) => ({
          fileName: a.fileName,
          relativePath: a.relativePath!,
          label: sanitizeAttachmentLabel(a.label),
        })),
    [composerAttachments],
  );

  const launchChain = useCallback(() => {
    const goal = goalDraft.trim();
    if (!goal || attachmentsUploading) return;
    const effective = buildChainGoalWithAttachments(goal, readyAttachments);
    setComposing(false);
    setComposerAttachments([]);
    setNewChainDisplayGoal(goal);
    setNewChainAttachments(readyAttachments);
    setNewChainGoal(effective);
  }, [attachmentsUploading, goalDraft, readyAttachments]);

  const handleStarted = useCallback(() => {
    setNewChainGoal(null);
    setNewChainDisplayGoal("");
    setNewChainAttachments([]);
    void loadChains();
  }, [loadChains]);

  const reportIds = useMemo(() => new Set(reports.map((r) => r.chainId)), [reports]);
  const completedChains = useMemo(
    () => chains.filter((c) => c.status === "completed"),
    [chains],
  );
  const cancelledChains = useMemo(
    () => chains.filter((c) => c.status === "cancelled"),
    [chains],
  );
  // Drop stale Assigning/Running rows once a persisted report exists (missed
  // chain:state can leave published=false in the active snapshot).
  const activeChains = useMemo(
    () =>
      chains.filter(
        (c) =>
          c.status !== "completed" &&
          c.status !== "cancelled" &&
          !reportIds.has(c.chainId),
      ),
    [chains, reportIds],
  );
  const activeObserved = useMemo(
    () =>
      observed.filter(
        (c) =>
          c.phase !== "completed" &&
          c.phase !== "cancelled" &&
          !reportIds.has(c.chainId),
      ),
    [observed, reportIds],
  );
  // Persisted report list only — so Delete removes the card and we do not
  // resurrect a Published stub from a stale published=true active row.
  const reportCards = useMemo(() => {
    const byId = new Map(completedChains.map((c) => [c.chainId, c]));
    return reports.map((r) => {
      const chain = byId.get(r.chainId);
      const goal = (r.goal?.trim() || chain?.goal?.trim() || "") || undefined;
      return {
        chainId: r.chainId,
        chain,
        createdAt: r.createdAt,
        goal,
      };
    });
  }, [reports, completedChains]);

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
          readinessPanel={
            <FleetReadinessPanel
              readiness={fleetReadiness}
              variant="compact"
              onManageWorkers={() => setShowSettings(true)}
              onOpenSettingsAi={onOpenSettingsAi}
              onOpenDiscover={onOpenDiscover}
              onRefreshCards={() => {
                void nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
              }}
              onRetryProbe={() => void loadReachability()}
            />
          }
        />
        {showSettings ? (
          <AgentNetworkSettingsModal onClose={() => setShowSettings(false)} />
        ) : null}
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
        <div className="chain-composer" data-testid="chain-composer">
          <fieldset className="chain-composer__mode" data-testid="chain-composer-assignment-mode">
            <legend className="chain-composer__label">{t("chains.start.assignmentChooserLabel")}</legend>
            <div className="chain-composer__mode-options">
              <label
                className={
                  composerAssignmentMode === "skill"
                    ? "chain-composer__mode-option chain-composer__mode-option--active"
                    : "chain-composer__mode-option"
                }
              >
                <input
                  type="radio"
                  name="chain-assignment-mode"
                  value="skill"
                  checked={composerAssignmentMode === "skill"}
                  onChange={() => setComposerAssignmentMode("skill")}
                />
                <span className="chain-composer__mode-title">{t("chains.start.assignmentChooserSkill")}</span>
                <span className="chain-composer__mode-hint">{t("chains.start.assignmentChooserSkillHint")}</span>
              </label>
              <label
                className={
                  composerAssignmentMode === "role"
                    ? "chain-composer__mode-option chain-composer__mode-option--active"
                    : "chain-composer__mode-option"
                }
              >
                <input
                  type="radio"
                  name="chain-assignment-mode"
                  value="role"
                  checked={composerAssignmentMode === "role"}
                  onChange={() => setComposerAssignmentMode("role")}
                />
                <span className="chain-composer__mode-title">{t("chains.start.assignmentChooserRole")}</span>
                <span className="chain-composer__mode-hint">{t("chains.start.assignmentChooserRoleHint")}</span>
              </label>
            </div>
          </fieldset>
          {showEmptyRoleGuide ? (
            <div className="chain-composer__empty-role" data-testid="chain-composer-empty-role">
              <p>{t("chains.start.emptyRoleBanner")}</p>
              <button
                type="button"
                className="secondary btn-sm"
                data-testid="chain-composer-empty-role-cta"
                onClick={openWorkerProfileForRole}
              >
                {t("chains.start.emptyRoleCta")}
              </button>
            </div>
          ) : null}
          <label htmlFor="chain-goal-input" className="chain-composer__label">
            {t("chains.start.composerLabel")}
          </label>
          <textarea
            id="chain-goal-input"
            className="chain-composer__input"
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            placeholder={t("chains.start.composerPlaceholder")}
            rows={5}
            autoFocus
          />
          <div className="chain-composer__attachments" data-testid="chain-composer-attachments">
            <div className="chain-composer__attachments-header">
              <span className="chain-composer__label">{t("chains.start.attachmentsLabel")}</span>
              <button
                type="button"
                className="secondary btn-sm"
                data-testid="chain-composer-add-files"
                disabled={composerAttachments.length >= CHAIN_COMPOSER_MAX_ATTACHMENTS}
                onClick={() => fileInputRef.current?.click()}
              >
                {t("chains.start.attachmentsAdd")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  onPickComposerFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="chain-composer__attachments-hint">{t("chains.start.attachmentsHint")}</p>
            {composerAttachments.length > 0 ? (
              <ul className="chain-composer__attachments-list">
                {composerAttachments.map((att) => (
                  <li key={att.id} className="chain-composer__attachment" data-testid="chain-composer-attachment">
                    <div className="chain-composer__attachment-row">
                      <span className="chain-composer__attachment-name" title={att.fileName}>
                        {att.fileName}
                      </span>
                      {att.uploading ? (
                        <span className="chain-composer__attachment-status">
                          {t("chains.start.attachmentUploading")}
                        </span>
                      ) : att.error ? (
                        <span className="chain-composer__attachment-status chain-composer__attachment-status--error">
                          {t("chains.start.attachmentFailed")}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="secondary btn-sm"
                        aria-label={t("chains.start.attachmentRemove")}
                        onClick={() =>
                          setComposerAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                      >
                        ×
                      </button>
                    </div>
                    <label className="chain-composer__attachment-label-row">
                      <span className="chain-composer__attachment-label-caption">
                        {t("chains.start.attachmentLabel")}
                      </span>
                      <input
                        type="text"
                        className="chain-composer__attachment-label"
                        value={att.label ?? ""}
                        maxLength={CHAIN_ATTACHMENT_LABEL_MAX_CHARS}
                        placeholder={t("chains.start.attachmentLabelPlaceholder")}
                        disabled={!!att.uploading}
                        onChange={(e) => {
                          const label = e.target.value;
                          setComposerAttachments((prev) =>
                            prev.map((a) => (a.id === att.id ? { ...a, label } : a)),
                          );
                        }}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
            <button type="button" className="secondary btn-sm" onClick={closeComposer}>
              {t("chains.start.cancel")}
            </button>
            <button
              type="button"
              className="primary btn-sm"
              onClick={launchChain}
              disabled={goalDraft.trim().length < 8 || attachmentsUploading}
            >
              {t("chains.start.preview")}
            </button>
          </div>
        </div>
      ) : null}

      {newChainGoal ? (
        <ChainStartDialog
          goal={newChainGoal}
          displayGoal={newChainDisplayGoal}
          attachments={newChainAttachments}
          assignmentMode={composerAssignmentMode}
          onClose={() => {
            setNewChainGoal(null);
            setNewChainDisplayGoal("");
            setNewChainAttachments([]);
          }}
          onStarted={handleStarted}
          onOpenDiscover={onOpenDiscover}
          onOpenManageWorkers={() => setShowSettings(true)}
          onOpenSettingsAi={onOpenSettingsAi}
          onRefreshWorkers={() => {
            void nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
            void nodeService
              .getLocalAgentNetworkWorkerCard()
              .then((card) => setLocalWorkerCard(card))
              .catch(() => undefined);
          }}
          onRetryReachability={() => void loadReachability()}
          localJoinEnabled={nodeConfig?.capabilityProviderEnabled === true}
          engineReady={anEngineReady}
          bondedPeerCount={bonds.filter((b) => b.level !== "blocked").length}
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
          {fleetReadiness.blocked ? (
            <FleetReadinessPanel
              readiness={fleetReadiness}
              variant="compact"
              onManageWorkers={() => setShowSettings(true)}
              onOpenSettingsAi={onOpenSettingsAi}
              onOpenDiscover={onOpenDiscover}
              onRefreshCards={() => {
                void nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
              }}
              onRetryProbe={() => void loadReachability()}
            />
          ) : null}
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
                {t(`chains.status.${chain.status}`)}
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

      {activeObserved.length > 0 ? (
        <section className="chains-observed" data-testid="chains-observed">
          <h4 className="chains-empty__contacts-title">{t("chains.observed.title")}</h4>
          <p className="chains-empty__contacts-desc">{t("chains.detail.observedHint")}</p>
          {activeObserved.map((job) => {
            const badge = classifyObservedJobBadge({
              phase: job.phase,
              steps: job.steps,
              localAgentPeerId: localWorkerCard?.sourceAgentPeerId,
            });
            const badgeKey =
              badge === "assignedToYou"
                ? "badgeAssigned"
                : badge === "waitingOnAssigner"
                  ? "badgeWaitingAssigner"
                  : badge === "blockedOnPrior"
                    ? "badgeBlocked"
                    : badge === "done"
                      ? "badgeDone"
                      : badge === "failed"
                        ? "badgeFailed"
                        : "badgeWatching";
            const badgeMod =
              badge === "assignedToYou"
                ? "assigned"
                : badge === "blockedOnPrior"
                  ? "blocked"
                  : badge === "waitingOnAssigner"
                    ? "waiting"
                    : "";
            return (
            <div key={job.chainId} className="chain-card chain-card--observed" data-testid="chain-observed-card">
              <div className="chain-card-header">
                <span className={`chain-status-badge status-${job.phase}`}>
                  {t(
                    `chains.status.${
                      job.phase === "bidding" && job.awardMode !== "competitive"
                        ? "assigning"
                        : job.phase
                    }`,
                  )}
                </span>
                <span
                  className={`chain-observed-badge${badgeMod ? ` chain-observed-badge--${badgeMod}` : ""}`}
                  data-testid="chain-observed-badge"
                >
                  {t(`chains.observed.${badgeKey}`)}
                </span>
                <span className="chain-observed-readonly">{t("chains.observed.readOnly")}</span>
                <code className="chain-id">{job.chainId.slice(0, 12)}…</code>
              </div>
              <p className="chains-empty__contacts-desc">{t("chains.observed.onlyAssignerCanManage")}</p>
              {job.goal ? <p className="chain-card-goal">{job.goal}</p> : null}
              <div className="chain-card-progress">
                <span>
                  {t("chains.active.progress", {
                    partial: job.partialCount,
                    awarded: job.awardedCount,
                    total: job.subtaskCount,
                  })}
                </span>
              </div>
              {job.steps.length > 0 ? (
                <ul className="chain-observed-steps" data-testid="chain-observed-steps">
                  {job.steps.map((step) => (
                    <li key={step.subtaskId} className="chain-observed-step">
                      <span className={`chain-observed-step__state state-${step.state}`}>
                        {step.state}
                      </span>
                      <span className="chain-observed-step__objective">
                        {step.objective?.trim() || step.subtaskId}
                      </span>
                      {step.waitingOn && step.waitingOn.length > 0 ? (
                        <span className="chain-observed-step__waiting">
                          {t("chains.detail.waitingOn")}{" "}
                          {step.waitingOn.map((w) => w.label ?? w.key).join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            );
          })}
        </section>
      ) : null}

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

      {reportCards.length > 0 && (
        <>
          <h3>{t("chains.reports.title")}</h3>
          {reportCards.map(({ chainId, chain, createdAt, goal }) => (
            <div
              key={chainId}
              className="chain-card chain-card-completed chain-report-card"
              data-testid="chain-report-card"
            >
              <div className="chain-card-header">
                <span className="chain-status-badge status-completed">
                  ✅ {t("chains.status.published")}
                </span>
              </div>
              <p className={`chain-card-goal${goal ? "" : " muted"}`}>
                {goal?.trim() || t("chains.report.untitled")}
              </p>
              <div className="chain-report-card__footer">
                <div className="chain-card-actions">
                  {chain?.showCostUi ? (
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => void handleExportCosts(chainId)}
                    >
                      {t("chains.start.exportCsv")}
                    </button>
                  ) : null}
                  <button
                    className="btn-sm"
                    onClick={() => handleViewReport(chainId)}
                  >
                    {viewingReport === chainId
                      ? t("chains.reports.hideReport")
                      : t("chains.reports.viewReport")}
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-danger"
                    onClick={() => handleDeleteReport(chainId)}
                  >
                    {t("chains.reports.delete")}
                  </button>
                </div>
                {createdAt ? (
                  <time className="chain-card-time" dateTime={createdAt}>
                    {formatReportListTime(createdAt)}
                  </time>
                ) : null}
              </div>

              {viewingReport === chainId && (
                <ChainReportView
                  chainId={chainId}
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
          title={
            confirm.kind === "deleteReport"
              ? t("chains.reports.deleteConfirm")
              : t("chains.active.cancelConfirm")
          }
          message={
            confirm.kind === "deleteReport"
              ? t("chains.reports.deleteConfirmMessage")
              : t("chains.active.cancelConfirmMessage")
          }
          variant="destructive"
          confirmLabel={
            confirm.kind === "deleteReport"
              ? t("chains.reports.deleteConfirmAction")
              : t("chains.active.cancelConfirmAction")
          }
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
