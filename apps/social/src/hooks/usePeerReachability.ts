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
  const sessionStartedRef = useRef(false);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;
  const hysteresisOpts = enabled
    ? { stablePathPolls: REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS }
    : undefined;

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
        ...hysteresisOpts,
      });
      hysteresisRef.current = result.state;
      if (result.shouldUpdate && result.info) {
        setInfo(result.info);
      }
    },
    [hysteresisOpts],
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
        applyReading({ connected: false, direct: false }, generation, { immediate: true });
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

  // Reset only when the selected contact changes.
  useEffect(() => {
    peerGenerationRef.current += 1;
    hysteresisRef.current = createReachabilityHysteresisState();
    lastRedialAtRef.current = 0;
    libp2pConnectedRef.current = false;
    libp2pDirectRef.current = false;
    sessionStartedRef.current = false;
    setInfo(null);
    setChecking(false);
  }, [peerOwnerId]);

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      sessionStartedRef.current = false;
      setChecking(false);
      return;
    }

    const generation = peerGenerationRef.current;

    if (!sessionStartedRef.current) {
      sessionStartedRef.current = true;
      void (async () => {
        await runRefresh(generation, { verifyOnly: true, silent: true, immediate: true });
        if (generation !== peerGenerationRef.current) {
          return;
        }
        if (libp2pConnectedRef.current) {
          return;
        }
        void runRefresh(generation, { warm: true, silent: false });
      })();
    }

    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        // Probe open paths only — do not tear down relay connections on every poll.
        void runRefresh(generation, { silent: true, keepAlive: true });
        return;
      }
      const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
      void runRefresh(generation, {
        silent: true,
        ...(dueForRedial ? { warm: true } : { verifyOnly: true }),
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
      upgradeRelayToDirect?: boolean;
      silent?: boolean;
    }) => runRefresh(peerGenerationRef.current, opts),
    [runRefresh],
  );

  return { info, checking, refresh };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
