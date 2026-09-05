/**
 * Phase 67B — Advanced overflow: Start team job with peers in this chat.
 * Never default chat chrome; blocked peers get clear readiness copy.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import { createPortal } from "react-dom";
import type {
  AgentNetworkDiagnosticsWorker,
  BondRecord,
  CachedAgentCardSummary,
  ChainWorkerReachability,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { useAgentCards, useNodeService, useTransportWsOpen } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";
import { MoreIcon } from "../icons.js";
import {
  computeChainBondHealth,
  mergeReachability,
  type ChainBondHealth,
} from "../lib/chain-bond-health.js";
import {
  evaluateChatTeamJobEligibility,
  toChatTeamJobPeerCandidate,
} from "../lib/chat-team-job-eligibility.js";
import { ChainStartDialog, type WorkerCandidate } from "./ChainStartDialog.js";
import { FleetReadinessPanel } from "./FleetReadinessPanel.js";
import {
  buildFleetReadinessChecklist,
  summarizeFleetReadinessInput,
} from "../lib/fleet-readiness.js";
import { collectFleetWorkerGaps } from "../lib/fleet-worker-gaps.js";

const MENU_PAD = 8;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = Math.max(MENU_PAD, window.innerWidth - width - MENU_PAD);
  const maxY = Math.max(MENU_PAD, window.innerHeight - height - MENU_PAD);
  return {
    x: Math.min(Math.max(MENU_PAD, x), maxX),
    y: Math.min(Math.max(MENU_PAD, y), maxY),
  };
}

export interface ChatTeamJobEntryProps {
  /** Bonded peer owner ids in this chat (exclude self). */
  scopedOwnerIds: string[];
  /** Prefill goal — typically last chat message text. */
  suggestedGoal?: string;
  onOpenChains?: () => void;
  onOpenSettingsAi?: () => void;
  onOpenDiscover?: () => void;
}

export function ChatTeamJobEntry({
  scopedOwnerIds,
  suggestedGoal,
  onOpenChains,
  onOpenSettingsAi,
  onOpenDiscover,
}: ChatTeamJobEntryProps) {
  const t = useT();
  const nodeService = useNodeService();
  const wsOpen = useTransportWsOpen();
  const { showToast } = useToast();
  const { bonds, nodeConfig } = useNodeState();
  const agentCards = useAgentCards();

  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalPromptOpen, setGoalPromptOpen] = useState(false);
  const [startGoal, setStartGoal] = useState<string | null>(null);
  const [preferredPeerIds, setPreferredPeerIds] = useState<string[]>([]);

  const [reachabilityByOwner, setReachabilityByOwner] = useState<
    Map<string, ChainWorkerReachability>
  >(new Map());
  const [diagnosticsWorkers, setDiagnosticsWorkers] = useState<
    AgentNetworkDiagnosticsWorker[]
  >([]);
  const [localWorkerCard, setLocalWorkerCard] = useState<
    CachedAgentCardSummary | undefined
  >();
  const [anEngineReady, setAnEngineReady] = useState<boolean | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const localJoin = nodeConfig?.capabilityProviderEnabled === true;
  const anWorkerEngine =
    nodeConfig?.agentNetworkWorkerEngine === "ext" ||
    nodeConfig?.agentNetworkWorkerEngine === "envoy-harness"
      ? nodeConfig.agentNetworkWorkerEngine
      : "openclaw";

  const scopedIdSet = useMemo(() => new Set(scopedOwnerIds), [scopedOwnerIds]);

  useEffect(() => {
    if (!wsOpen || !localJoin) {
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
            if (!cancelled) setAnEngineReady(true);
          });
        return;
      }
      if (anWorkerEngine === "envoy-harness") {
        void nodeService
          .getEnvoyHarnessStatus()
          .then((s) => {
            if (!cancelled) setAnEngineReady(s.state === "ready");
          })
          .catch(() => {
            if (!cancelled) setAnEngineReady(false);
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
    anWorkerEngine,
    localJoin,
    nodeConfig?.bridgeEnabled,
    nodeConfig?.bridgeStatus?.agentUrl,
    nodeService,
    wsOpen,
  ]);

  const loadFleet = useCallback(async () => {
    const ownerIds = [...scopedIdSet];
    if (ownerIds.length === 0) {
      setReachabilityByOwner(new Map());
    } else {
      try {
        const result = await nodeService.chainProbeReachability({ ownerIds });
        setReachabilityByOwner(
          new Map((result.rows ?? []).map((r) => [r.ownerId, r])),
        );
      } catch {
        /* best-effort */
      }
    }
    try {
      const snap = await nodeService.agentNetworkDiagnosticsSnapshot();
      setDiagnosticsWorkers(snap.workers ?? []);
    } catch {
      /* best-effort */
    }
  }, [nodeService, scopedIdSet]);

  useEffect(() => {
    if (!menuOpen && !blockedOpen && !goalPromptOpen && !startGoal) return;
    void loadFleet();
    const timer = setInterval(() => void loadFleet(), 20_000);
    return () => clearInterval(timer);
  }, [blockedOpen, goalPromptOpen, loadFleet, menuOpen, startGoal]);

  const scopedPeers = useMemo(() => {
    return bonds
      .filter((b) => b.level !== "blocked" && scopedIdSet.has(b.peerOwnerId))
      .map((bond) => {
        const card = agentCards.find((c) => c.ownerId === bond.peerOwnerId);
        const base = computeChainBondHealth(bond, card);
        const health = mergeReachability(
          base,
          reachabilityByOwner.get(bond.peerOwnerId),
        );
        return toChatTeamJobPeerCandidate({
          ownerId: bond.peerOwnerId,
          displayName:
            bond.displayName ?? card?.displayName ?? bond.peerOwnerId,
          card,
          health,
        });
      });
  }, [agentCards, bonds, reachabilityByOwner, scopedIdSet]);

  const eligibility = useMemo(
    () =>
      evaluateChatTeamJobEligibility({
        localJoin,
        engineReady: localJoin ? anEngineReady : null,
        scopedPeers,
        diagnosticsWorkers,
      }),
    [anEngineReady, diagnosticsWorkers, localJoin, scopedPeers],
  );

  const workerCandidates = useMemo((): WorkerCandidate[] => {
    const others: WorkerCandidate[] = scopedPeers.map((p) => {
      const bond =
        bonds.find((b) => b.peerOwnerId === p.ownerId) ??
        ({
          peerOwnerId: p.ownerId,
          displayName: p.displayName,
          level: "direct",
          createdAt: new Date(0).toISOString(),
        } as BondRecord);
      return { bond, card: p.card, health: p.health };
    });
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
      others.push({
        bond: selfBond,
        card: localWorkerCard,
        health: selfHealth,
        isSelf: true,
      });
    }
    return others;
  }, [anEngineReady, bonds, localWorkerCard, scopedPeers]);

  const readiness = useMemo(
    () =>
      buildFleetReadinessChecklist(
        summarizeFleetReadinessInput({
          localJoin,
          engineReady: localJoin ? anEngineReady : null,
          bondedPeerCount: scopedPeers.length,
          candidates: workerCandidates,
          diagnosticsWorkers,
        }),
      ),
    [anEngineReady, diagnosticsWorkers, localJoin, scopedPeers.length, workerCandidates],
  );

  const workerGaps = useMemo(
    () =>
      collectFleetWorkerGaps({
        candidates: workerCandidates.map((w) => ({
          isSelf: w.isSelf,
          ownerId: w.bond.peerOwnerId,
          displayName:
            w.bond.displayName ?? w.card?.displayName ?? w.bond.peerOwnerId,
          card: w.card,
          health: w.health,
        })),
        diagnosticsWorkers,
      }),
    [diagnosticsWorkers, workerCandidates],
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !pos) return;
    const el = menuRef.current;
    const next = clampMenuPosition(pos.x, pos.y, el.offsetWidth, el.offsetHeight);
    if (next.x !== pos.x || next.y !== pos.y) setPos(next);
  }, [menuOpen, pos]);

  const toggleMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    void loadFleet();
    const rect = triggerRef.current?.getBoundingClientRect();
    setPos({
      x: rect ? rect.right - 180 : e.clientX,
      y: rect ? rect.bottom + 4 : e.clientY,
    });
    setMenuOpen(true);
  };

  const stop = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const beginEligibleFlow = useCallback(() => {
    setPreferredPeerIds(eligibility.preferredPeerIds);
    setGoalDraft((suggestedGoal ?? "").trim());
    setGoalPromptOpen(true);
  }, [eligibility.preferredPeerIds, suggestedGoal]);

  const onPickRunAsTeamJob = () => {
    setMenuOpen(false);
    if (scopedOwnerIds.length === 0) {
      showToast(t("chains.chatEntry.noBondedPeers"), "error");
      return;
    }
    if (!eligibility.eligible) {
      setBlockedOpen(true);
      return;
    }
    beginEligibleFlow();
  };

  const confirmGoal = () => {
    const goal = goalDraft.trim();
    if (goal.length < 8) {
      showToast(t("chains.chatEntry.goalTooShort"), "error");
      return;
    }
    setGoalPromptOpen(false);
    setStartGoal(goal);
  };

  if (scopedOwnerIds.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="chat-header-more-btn"
        title={t("chains.chatEntry.advanced")}
        aria-label={t("chains.chatEntry.advanced")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="chat-team-job-overflow"
        onClick={toggleMenu}
        onMouseDown={stop}
      >
        <MoreIcon size={16} />
      </button>
      {menuOpen && pos
        ? createPortal(
            <div
              ref={menuRef}
              className="context-menu chat-team-job-menu"
              role="menu"
              style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 10000 }}
              data-testid="chat-team-job-menu"
            >
              <button
                type="button"
                role="menuitem"
                className="context-menu-item"
                data-testid="chat-team-job-run"
                onClick={onPickRunAsTeamJob}
              >
                {t("chains.start.runAsChain")}
              </button>
              <p className="chat-team-job-menu__hint muted">
                {t("chains.start.runAsChainHint")}
              </p>
            </div>,
            document.body,
          )
        : null}

      {blockedOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setBlockedOpen(false)}
        >
          <div
            className="modal-panel chat-team-job-blocked"
            role="dialog"
            aria-labelledby="chat-team-job-blocked-title"
            data-testid="chat-team-job-blocked"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="chat-team-job-blocked-title">{t("chains.chatEntry.notReadyTitle")}</h3>
            <p className="modal-desc">{t("chains.chatEntry.notReadyBody")}</p>
            <FleetReadinessPanel
              readiness={readiness}
              workerGaps={workerGaps}
              onManageWorkers={
                onOpenChains
                  ? () => {
                      setBlockedOpen(false);
                      onOpenChains();
                    }
                  : undefined
              }
              onOpenSettingsAi={
                onOpenSettingsAi
                  ? () => {
                      setBlockedOpen(false);
                      onOpenSettingsAi();
                    }
                  : undefined
              }
              onOpenDiscover={
                onOpenDiscover
                  ? () => {
                      setBlockedOpen(false);
                      onOpenDiscover();
                    }
                  : undefined
              }
              onRefreshCards={() => {
                void nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
                void loadFleet();
              }}
              onRetryProbe={() => void loadFleet()}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setBlockedOpen(false)}
              >
                {t("chains.start.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {goalPromptOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setGoalPromptOpen(false)}
        >
          <div
            className="modal-panel chat-team-job-goal"
            role="dialog"
            aria-labelledby="chat-team-job-goal-title"
            data-testid="chat-team-job-goal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="chat-team-job-goal-title">{t("chains.start.runAsChain")}</h3>
            <label className="chat-team-job-goal__label">
              <span>{t("chains.start.composerLabel")}</span>
              <textarea
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                rows={4}
                placeholder={t("chains.start.composerPlaceholder")}
                data-testid="chat-team-job-goal-input"
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setGoalPromptOpen(false)}
              >
                {t("chains.start.cancel")}
              </button>
              <button
                type="button"
                className="primary"
                data-testid="chat-team-job-goal-continue"
                onClick={confirmGoal}
              >
                {t("chains.start.preview")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {startGoal ? (
        <ChainStartDialog
          goal={startGoal}
          displayGoal={startGoal}
          initialPreferredPeerIds={preferredPeerIds}
          workerCandidates={workerCandidates}
          diagnosticsWorkers={diagnosticsWorkers}
          localJoinEnabled={localJoin}
          engineReady={anEngineReady}
          bondedPeerCount={scopedPeers.length}
          onClose={() => setStartGoal(null)}
          onStarted={() => {
            setStartGoal(null);
            showToast(t("chains.start.started"), "success");
            onOpenChains?.();
          }}
          onOpenDiscover={onOpenDiscover}
          onOpenManageWorkers={onOpenChains}
          onOpenSettingsAi={onOpenSettingsAi}
          onRefreshWorkers={() => {
            void nodeService.refreshAgentNetworkWorkers().catch(() => undefined);
            void loadFleet();
          }}
          onRetryReachability={() => void loadFleet()}
        />
      ) : null}
    </>
  );
}
