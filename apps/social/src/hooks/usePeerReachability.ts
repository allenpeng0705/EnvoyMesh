import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_MIN_REDIAL_MS,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS,
  REACHABILITY_OPEN_CHAT_POLL_MS,
  REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
  REACHABILITY_POLL_MS,
} from "../lib/peer-reachability-hysteresis.js";

const OPEN_CHAT_HYSTERESIS_OPTS = {
  stablePathPolls: REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
} as const;

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
        ...OPEN_CHAT_HYSTERESIS_OPTS,
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
          next = await ns.warmContactConnection(peerOwnerId, { upgradeRelayToDirect: true });
        } else if (opts?.verifyConnection) {
          next = await ns.warmContactConnection(peerOwnerId, { verifyConnection: true });
        } else if (opts?.keepAlive) {
          next = await ns.warmContactConnection(peerOwnerId, { keepAlive: true });
        } else if (opts?.verifyOnly) {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        } else if (opts?.warm) {
          lastRedialAtRef.current = Date.now();
          next = await ns.warmContactConnection(peerOwnerId);
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
          void runRefreshRef.current(generation, {
            silent: true,
            ...(libp2pConnectedRef.current
              ? libp2pDirectRef.current
                ? { keepAlive: true }
                : { upgradeRelayToDirect: true }
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

    peerGenerationRef.current += 1;
    const generation = peerGenerationRef.current;
    hysteresisRef.current = createReachabilityHysteresisState();
    lastRedialAtRef.current = 0;
    libp2pConnectedRef.current = false;
    libp2pDirectRef.current = false;

    void (async () => {
      await runRefreshRef.current(generation, { verifyOnly: true, silent: true, immediate: true });
      if (generation !== peerGenerationRef.current) {
        return;
      }
      if (libp2pConnectedRef.current) {
        if (libp2pDirectRef.current) {
          void runRefreshRef.current(generation, { silent: true, keepAlive: true });
        } else {
          void runRefreshRef.current(generation, { silent: true, upgradeRelayToDirect: true });
        }
        return;
      }
      void runRefreshRef.current(generation, { warm: true, silent: false });
    })();

    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        if (libp2pDirectRef.current) {
          void runRefreshRef.current(generation, { silent: true, keepAlive: true });
        } else {
          void runRefreshRef.current(generation, { silent: true, upgradeRelayToDirect: true });
        }
        return;
      }
      if (!libp2pConnectedRef.current) {
        const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
        void runRefreshRef.current(generation, {
          silent: false,
          warm: true,
          redial: dueForRedial,
        });
        return;
      }
    }, pollMs);

    return () => clearInterval(id);
  }, [
    enabled,
    minRedialMs,
    peerOwnerId,
    nodeService.isConnected,
    nodeService.isReady,
    pollMs,
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
