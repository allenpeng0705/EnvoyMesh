import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_MIN_REDIAL_MS,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS,
  REACHABILITY_OPEN_CHAT_OFFLINE_POLL_MS,
  REACHABILITY_OPEN_CHAT_POLL_MS,
  REACHABILITY_OPEN_CHAT_STABLE_OFFLINE_POLLS,
  REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
  REACHABILITY_POLL_MS,
} from "../lib/peer-reachability-hysteresis.js";

const OPEN_CHAT_HYSTERESIS_OPTS = {
  stablePathPolls: REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
  stableOfflinePolls: REACHABILITY_OPEN_CHAT_STABLE_OFFLINE_POLLS,
} as const;

function isUiOnline(state: ReturnType<typeof createReachabilityHysteresisState>): boolean {
  return state.displayedLabel !== null && state.displayedLabel !== "offline";
}

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const hysteresisRef = useRef(createReachabilityHysteresisState());
  const libp2pConnectedRef = useRef(false);
  const libp2pDirectRef = useRef(false);
  const lastRedialAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const peerGenerationRef = useRef(0);
  const lastPeerOwnerIdRef = useRef<string | null>(null);

  const pollOnlineMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const pollOfflineMs = enabled ? REACHABILITY_OPEN_CHAT_OFFLINE_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;

  const applyReading = useCallback(
    (
      next: PeerConnectionInfo,
      generation: number,
      opts?: { immediate?: boolean; settled?: boolean; holdOnline?: boolean },
    ) => {
      if (generation !== peerGenerationRef.current) {
        return;
      }
      libp2pConnectedRef.current = next.connected;
      libp2pDirectRef.current = next.direct;
      const now = Date.now();
      const result = applyReachabilityHysteresis(hysteresisRef.current, next, now, {
        offlineGraceMs: REACHABILITY_OFFLINE_GRACE_MS,
        immediate: opts?.immediate,
        settled: opts?.settled,
        holdOnline: opts?.holdOnline,
        ...(enabled ? OPEN_CHAT_HYSTERESIS_OPTS : undefined),
      });
      hysteresisRef.current = result.state;
      if (result.shouldUpdate && result.info) {
        setInfo(result.info);
      }
    },
    [enabled],
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
        settled?: boolean;
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
      const showConnecting = !opts?.silent;
      if (showConnecting) setChecking(true);
      const holdOnline = opts?.silent === true && isUiOnline(hysteresisRef.current);
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
          next = await ns.warmContactConnection(peerOwnerId, { upgradeRelayToDirect: true });
        } else if (opts?.verifyConnection) {
          next = await ns.warmContactConnection(peerOwnerId, { verifyConnection: true });
        } else if (opts?.keepAlive) {
          next = await ns.warmContactConnection(peerOwnerId, { keepAlive: true });
        } else if (opts?.verifyOnly) {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        } else if (opts?.warm) {
          lastRedialAtRef.current = Date.now();
          next = await ns.warmContactConnection(peerOwnerId, { source: "open_chat", fastDial: true });
        } else {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        }
        applyReading(next, generation, {
          immediate: opts?.immediate,
          settled: opts?.settled,
          holdOnline,
        });
      } catch {
        libp2pConnectedRef.current = false;
        libp2pDirectRef.current = false;
        applyReading(
          { connected: false, direct: false },
          generation,
          holdOnline ? { holdOnline: true } : { settled: opts?.silent !== true },
        );
      } finally {
        refreshInFlightRef.current = false;
        if (showConnecting) setChecking(false);
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          void runRefreshRef.current(generation, {
            silent: true,
            ...(libp2pConnectedRef.current || isUiOnline(hysteresisRef.current)
              ? { verifyOnly: true }
              : { warm: true }),
          });
        }
      }
    },
    [applyReading, enabled, peerOwnerId],
  );

  const runRefreshRef = useRef(runRefresh);
  runRefreshRef.current = runRefresh;

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      return;
    }

    const peerChanged = lastPeerOwnerIdRef.current !== peerOwnerId;
    lastPeerOwnerIdRef.current = peerOwnerId;

    if (peerChanged) {
      peerGenerationRef.current += 1;
      hysteresisRef.current = createReachabilityHysteresisState();
      lastRedialAtRef.current = 0;
      libp2pConnectedRef.current = false;
      libp2pDirectRef.current = false;
      setInfo(null);
      setChecking(true);
    }

    const generation = peerGenerationRef.current;
    const ns = nodeServiceRef.current;

    void (async () => {
      try {
        setChecking(true);
        const cached = await ns.getPeerConnectionInfo(peerOwnerId);
        if (generation !== peerGenerationRef.current) {
          return;
        }

        if (cached.connected) {
          applyReading(cached, generation, { immediate: true });
          setChecking(false);
          void ns
            .warmContactConnection(peerOwnerId, { source: "open_chat", fastDial: true, keepAlive: true })
            .then((confirmed) => {
              if (generation !== peerGenerationRef.current) {
                return;
              }
              applyReading(confirmed, generation, {
                immediate: confirmed.connected,
                holdOnline: !confirmed.connected,
              });
            })
            .catch(() => undefined);
          return;
        }

        lastRedialAtRef.current = Date.now();
        const warmed = await ns.warmContactConnection(peerOwnerId, { source: "open_chat", fastDial: true });
        if (generation !== peerGenerationRef.current) {
          return;
        }
        applyReading(warmed, generation, { settled: true });
      } catch {
        if (generation !== peerGenerationRef.current) {
          return;
        }
        libp2pConnectedRef.current = false;
        libp2pDirectRef.current = false;
        applyReading({ connected: false, direct: false }, generation, { settled: true });
      } finally {
        if (generation === peerGenerationRef.current) {
          setChecking(false);
        }
      }
    })();

    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const schedulePoll = () => {
      const uiOnline = isUiOnline(hysteresisRef.current);
      const delay = uiOnline ? pollOnlineMs : pollOfflineMs;
      pollTimer = setTimeout(() => {
        const now = Date.now();
        const showingOnline = isUiOnline(hysteresisRef.current);
        if (libp2pConnectedRef.current || showingOnline) {
          if (!libp2pConnectedRef.current && showingOnline) {
            const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
            if (dueForRedial) {
              void runRefreshRef.current(generation, { silent: true, warm: true });
            } else {
              void runRefreshRef.current(generation, { silent: true, verifyOnly: true });
            }
          } else {
            void runRefreshRef.current(generation, { silent: true, verifyOnly: true });
          }
        } else {
          const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
          void runRefreshRef.current(generation, {
            silent: true,
            verifyOnly: !dueForRedial,
            warm: dueForRedial,
          });
        }
        schedulePoll();
      }, delay);
    };
    schedulePoll();

    return () => {
      if (pollTimer !== undefined) {
        clearTimeout(pollTimer);
      }
    };
  }, [
    enabled,
    minRedialMs,
    peerOwnerId,
    nodeService.isConnected,
    nodeService.isReady,
    pollOnlineMs,
    pollOfflineMs,
    applyReading,
  ]);

  const refresh = useCallback(
    (opts?: {
      warm?: boolean;
      redial?: boolean;
      verifyOnly?: boolean;
      keepAlive?: boolean;
      upgradeRelayToDirect?: boolean;
      silent?: boolean;
    }) => runRefreshRef.current(peerGenerationRef.current, opts),
    [],
  );

  return { info, checking, refresh };
}

export { peerReachabilityLabel, formatPeerReachabilityLabel } from "../lib/peer-reachability-label.js";
