import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_MIN_REDIAL_MS,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_OPEN_CHAT_KEEPALIVE_MS,
  REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS,
  REACHABILITY_OPEN_CHAT_POLL_MS,
  REACHABILITY_OPEN_CHAT_RELAY_UPGRADE_MS,
  REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
  REACHABILITY_POLL_MS,
} from "../lib/peer-reachability-hysteresis.js";
import {
  markBondWarmFinished,
  markBondWarmStarted,
} from "../lib/bond-warm-coordinator.js";

/** Delay before a background warm when opening chat with an offline contact (lets history RPC run first). */
const OPEN_CHAT_DEFERRED_WARM_MS = 1_000;

const OPEN_CHAT_HYSTERESIS_OPTS = {
  stablePathPolls: REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
} as const;

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const [info, setInfo] = useState<PeerConnectionInfo | null>({ connected: false, direct: false });
  const [checking, setChecking] = useState(false);
  const hysteresisRef = useRef(createReachabilityHysteresisState());
  const libp2pConnectedRef = useRef(false);
  const libp2pDirectRef = useRef(false);
  const lastRedialAtRef = useRef(0);
  const lastRelayUpgradeAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const peerGenerationRef = useRef(0);
  const openChatEnabledRef = useRef(enabled);
  openChatEnabledRef.current = enabled;
  const activePeerRef = useRef<string | null>(null);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;

  const applyReading = useCallback(
    (next: PeerConnectionInfo, generation: number, opts?: { immediate?: boolean }) => {
      if (generation !== peerGenerationRef.current) {
        return;
      }
      libp2pConnectedRef.current = next.connected;
      libp2pDirectRef.current = next.direct;
      const now = Date.now();
      const result = applyReachabilityHysteresis(hysteresisRef.current, next, now, {
        offlineGraceMs: REACHABILITY_OFFLINE_GRACE_MS,
        immediate: opts?.immediate,
        ...(openChatEnabledRef.current ? OPEN_CHAT_HYSTERESIS_OPTS : undefined),
      });
      hysteresisRef.current = result.state;
      if (result.shouldUpdate && result.info) {
        setInfo(result.info);
      }
    },
    [],
  );

  const runRefresh = useCallback(
    async (
      generation: number,
      opts?: {
        warm?: boolean;
        redial?: boolean;
        verifyOnly?: boolean;
        keepAlive?: boolean;
        verifyConnection?: boolean;
        upgradeRelayToDirect?: boolean;
        silent?: boolean;
        immediate?: boolean;
      },
    ) => {
      const ns = nodeServiceRef.current;
      if (!enabled || !peerOwnerId || !ns.isConnected || !ns.isReady) {
        if (!opts?.silent) {
          setChecking(false);
        }
        return;
      }
      if (refreshInFlightRef.current) {
        pendingRefreshRef.current = true;
        return;
      }
      refreshInFlightRef.current = true;
      const showChecking = !opts?.silent;
      if (showChecking) setChecking(true);
      try {
        let next: PeerConnectionInfo;
        if (opts?.redial) {
          lastRedialAtRef.current = Date.now();
          next = await ns.warmContactConnection(peerOwnerId, {
            redial: true,
            upgradeRelayToDirect: true,
          });
        } else if (opts?.upgradeRelayToDirect) {
          lastRedialAtRef.current = Date.now();
          lastRelayUpgradeAtRef.current = Date.now();
          next = await ns.warmContactConnection(peerOwnerId, { upgradeRelayToDirect: true });
        } else if (opts?.verifyConnection) {
          next = await ns.warmContactConnection(peerOwnerId, { verifyConnection: true });
        } else if (opts?.keepAlive) {
          next = await ns.warmContactConnection(peerOwnerId, { keepAlive: true });
        } else if (opts?.verifyOnly) {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        } else if (opts?.warm) {
          // Open-chat / offline poll: always dial. Shared cooldown is for sidebar
          // preload only — blocking here left chat Offline for 90s after a failed warm.
          lastRedialAtRef.current = Date.now();
          markBondWarmStarted(peerOwnerId);
          try {
            next = await ns.warmContactConnection(peerOwnerId, { force: true });
          } finally {
            markBondWarmFinished(peerOwnerId);
          }
        } else {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        }
        applyReading(next, generation, opts?.immediate ? { immediate: true } : undefined);
      } catch {
        libp2pConnectedRef.current = false;
        libp2pDirectRef.current = false;
        applyReading({ connected: false, direct: false }, generation);
      } finally {
        refreshInFlightRef.current = false;
        if (showChecking) setChecking(false);
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          void runRefresh(generation, {
            silent: true,
            verifyOnly: true,
          });
        }
      }
    },
    [applyReading, enabled, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      if (!peerOwnerId) {
        setInfo({ connected: false, direct: false });
        activePeerRef.current = null;
      }
      return;
    }

    peerGenerationRef.current += 1;
    const generation = peerGenerationRef.current;
    hysteresisRef.current = createReachabilityHysteresisState();
    lastRedialAtRef.current = 0;
    lastRelayUpgradeAtRef.current = 0;
    libp2pConnectedRef.current = false;
    libp2pDirectRef.current = false;
    refreshInFlightRef.current = false;
    pendingRefreshRef.current = false;

    const peerChanged = activePeerRef.current !== peerOwnerId;
    activePeerRef.current = peerOwnerId;
    if (peerChanged) {
      // Pessimistic Offline — avoids Checking… ↔ Offline flash while the silent snapshot runs.
      setInfo({ connected: false, direct: false });
      setChecking(false);
    }

    let deferredWarmTimer: ReturnType<typeof setTimeout> | undefined;

    void runRefresh(generation, { verifyOnly: true, silent: true, immediate: true }).then(() => {
      if (generation !== peerGenerationRef.current) {
        return;
      }
      if (!libp2pConnectedRef.current) {
        // Background dial after chat history loads. Keep Offline label — do not flip
        // back to Checking… while the warm runs (silent).
        deferredWarmTimer = setTimeout(() => {
          if (generation !== peerGenerationRef.current) return;
          void runRefresh(generation, { warm: true, silent: true });
        }, OPEN_CHAT_DEFERRED_WARM_MS);
      } else if (!libp2pDirectRef.current) {
        // Prefer direct LAN/TCP when available instead of staying on relay.
        deferredWarmTimer = setTimeout(() => {
          if (generation !== peerGenerationRef.current) return;
          void runRefresh(generation, { upgradeRelayToDirect: true, silent: true });
        }, OPEN_CHAT_DEFERRED_WARM_MS);
      }
    });

    let keepAliveId: ReturnType<typeof setInterval> | undefined;
    let offlinePollId: ReturnType<typeof setInterval> | undefined;

    if (enabled) {
      keepAliveId = setInterval(() => {
        if (!libp2pConnectedRef.current) return;
        const now = Date.now();
        const dueRelayUpgrade =
          !libp2pDirectRef.current &&
          (lastRelayUpgradeAtRef.current === 0 ||
            now - lastRelayUpgradeAtRef.current >= REACHABILITY_OPEN_CHAT_RELAY_UPGRADE_MS);
        if (dueRelayUpgrade) {
          void runRefresh(generation, { silent: true, upgradeRelayToDirect: true });
        } else {
          void runRefresh(generation, { silent: true, keepAlive: true });
        }
      }, REACHABILITY_OPEN_CHAT_KEEPALIVE_MS);

      offlinePollId = setInterval(() => {
        if (libp2pConnectedRef.current) return;
        const now = Date.now();
        const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
        void runRefresh(generation, {
          silent: true,
          verifyOnly: !dueForRedial,
          warm: dueForRedial,
        });
      }, pollMs);
    } else {
      offlinePollId = setInterval(() => {
        const now = Date.now();
        if (libp2pConnectedRef.current) {
          void runRefresh(generation, { silent: true, verifyOnly: true });
          return;
        }
        const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
        void runRefresh(generation, {
          silent: true,
          verifyOnly: !dueForRedial,
          warm: dueForRedial,
        });
      }, pollMs);
    }

    return () => {
      if (deferredWarmTimer) clearTimeout(deferredWarmTimer);
      if (keepAliveId) clearInterval(keepAliveId);
      if (offlinePollId) clearInterval(offlinePollId);
    };
  }, [
    enabled,
    minRedialMs,
    peerOwnerId,
    nodeService.isConnected,
    nodeService.isReady,
    pollMs,
    runRefresh,
  ]);

  const refresh = useCallback(
    (opts?: {
      warm?: boolean;
      redial?: boolean;
      verifyOnly?: boolean;
      keepAlive?: boolean;
      upgradeRelayToDirect?: boolean;
      silent?: boolean;
    }) => runRefresh(peerGenerationRef.current, opts),
    [runRefresh],
  );

  return { info, checking, refresh };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
