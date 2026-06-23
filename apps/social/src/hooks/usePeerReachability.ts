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
  const mountedPeerRef = useRef<string | null>(null);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;

  const applyReading = useCallback((next: PeerConnectionInfo) => {
    libp2pConnectedRef.current = next.connected;
    const now = Date.now();
    const result = applyReachabilityHysteresis(hysteresisRef.current, next, now, {
      offlineGraceMs: REACHABILITY_OFFLINE_GRACE_MS,
      holdOnline: enabled,
    });
    hysteresisRef.current = result.state;
    if (result.shouldUpdate && result.info) {
      setInfo(result.info);
    }
  }, [enabled]);

  const refresh = useCallback(
    async (opts?: {
      warm?: boolean;
      redial?: boolean;
      verifyOnly?: boolean;
      keepAlive?: boolean;
      silent?: boolean;
    }) => {
      const ns = nodeServiceRef.current;
      if (!enabled || !peerOwnerId || !ns.isConnected || !ns.isReady) {
        if (!opts?.silent) {
          setChecking(false);
        }
        return;
      }
      if (refreshInFlightRef.current) {
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
        applyReading(next);
      } catch {
        libp2pConnectedRef.current = false;
        applyReading({ connected: false, direct: false });
      } finally {
        refreshInFlightRef.current = false;
        if (showChecking) setChecking(false);
      }
    },
    [applyReading, enabled, peerOwnerId],
  );

  /** Read current socket state, then dial only when disconnected (chat open). */
  const connectOnOpen = useCallback(async () => {
    const ns = nodeServiceRef.current;
    if (!enabled || !peerOwnerId || !ns.isConnected || !ns.isReady) {
      setChecking(false);
      return;
    }
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    setChecking(true);
    try {
      const existing = await ns.getPeerConnectionInfo(peerOwnerId);
      applyReading(existing);
      if (!existing.connected) {
        lastRedialAtRef.current = Date.now();
        const warmed = await ns.warmContactConnection(peerOwnerId);
        applyReading(warmed);
      }
    } catch {
      libp2pConnectedRef.current = false;
      applyReading({ connected: false, direct: false });
    } finally {
      refreshInFlightRef.current = false;
      setChecking(false);
    }
  }, [applyReading, enabled, peerOwnerId]);

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      return;
    }
    if (mountedPeerRef.current !== peerOwnerId) {
      mountedPeerRef.current = peerOwnerId;
      hysteresisRef.current = createReachabilityHysteresisState();
      setInfo(null);
    }
    void connectOnOpen();
    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        void refresh({ silent: true, verifyOnly: true });
        return;
      }
      const dueForRedial = now - lastRedialAtRef.current >= minRedialMs;
      void refresh({
        silent: true,
        verifyOnly: !dueForRedial,
        warm: dueForRedial,
      });
    }, pollMs);
    return () => clearInterval(id);
  }, [
    connectOnOpen,
    enabled,
    minRedialMs,
    peerOwnerId,
    nodeService.isConnected,
    nodeService.isReady,
    pollMs,
    refresh,
  ]);

  return { info, checking, refresh };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
