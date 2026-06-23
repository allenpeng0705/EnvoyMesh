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
  REACHABILITY_POLL_MS,
} from "../lib/peer-reachability-hysteresis.js";

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const hysteresisRef = useRef(createReachabilityHysteresisState());
  const libp2pConnectedRef = useRef(false);
  const lastRedialAtRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const peerGenerationRef = useRef(0);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;

  const applyReading = useCallback(
    (next: PeerConnectionInfo, generation: number) => {
      if (generation !== peerGenerationRef.current) {
        return;
      }
      libp2pConnectedRef.current = next.connected;
      const now = Date.now();
      const result = applyReachabilityHysteresis(hysteresisRef.current, next, now, {
        offlineGraceMs: REACHABILITY_OFFLINE_GRACE_MS,
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
        silent?: boolean;
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
        } else if (opts?.verifyConnection) {
          lastRedialAtRef.current = Date.now();
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
        applyReading(next, generation);
      } catch {
        libp2pConnectedRef.current = false;
        applyReading({ connected: false, direct: false }, generation);
      } finally {
        refreshInFlightRef.current = false;
        if (showChecking) setChecking(false);
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          void runRefresh(generation, {
            silent: true,
            ...(libp2pConnectedRef.current ? { keepAlive: true } : { warm: true }),
          });
        }
      }
    },
    [applyReading, enabled, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      return;
    }

    peerGenerationRef.current += 1;
    const generation = peerGenerationRef.current;
    hysteresisRef.current = createReachabilityHysteresisState();
    setInfo(null);
    lastRedialAtRef.current = 0;
    libp2pConnectedRef.current = false;

    void runRefresh(generation, { verifyConnection: true });

    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        void runRefresh(generation, { silent: true, keepAlive: true });
        return;
      }
      const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
      void runRefresh(generation, {
        silent: true,
        verifyOnly: !dueForRedial,
        warm: dueForRedial,
      });
    }, pollMs);

    return () => clearInterval(id);
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
      silent?: boolean;
    }) => runRefresh(peerGenerationRef.current, opts),
    [runRefresh],
  );

  return { info, checking, refresh };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
