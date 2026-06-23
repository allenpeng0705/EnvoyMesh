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
  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const hysteresisRef = useRef(createReachabilityHysteresisState());
  const libp2pConnectedRef = useRef(false);
  const lastRedialAtRef = useRef(0);
  const lastReadingRef = useRef<PeerConnectionInfo | null>(null);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minRedialMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;

  const applyReading = useCallback(
    (next: PeerConnectionInfo) => {
      lastReadingRef.current = next;
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
    },
    [enabled],
  );

  const refresh = useCallback(
    async (opts?: {
      warm?: boolean;
      redial?: boolean;
      verifyOnly?: boolean;
      keepAlive?: boolean;
      silent?: boolean;
    }) => {
      if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
        if (!opts?.silent) {
          setChecking(false);
        }
        return;
      }
      const showChecking = !opts?.silent;
      if (showChecking) setChecking(true);
      try {
        let next: PeerConnectionInfo;
        if (opts?.redial) {
          lastRedialAtRef.current = Date.now();
          next = await nodeService.warmContactConnection(peerOwnerId, {
            redial: true,
            upgradeRelayToDirect: true,
          });
        } else if (opts?.keepAlive) {
          next = await nodeService.warmContactConnection(peerOwnerId, { keepAlive: true });
        } else if (opts?.verifyOnly) {
          next = await nodeService.getPeerConnectionInfo(peerOwnerId);
        } else if (opts?.warm) {
          lastRedialAtRef.current = Date.now();
          next = await nodeService.warmContactConnection(peerOwnerId);
        } else {
          next = await nodeService.getPeerConnectionInfo(peerOwnerId);
        }
        applyReading(next);
      } catch {
        libp2pConnectedRef.current = false;
        applyReading({ connected: false, direct: false });
      } finally {
        if (showChecking) setChecking(false);
      }
    },
    [applyReading, enabled, nodeService, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      return;
    }
    hysteresisRef.current = createReachabilityHysteresisState();
    lastReadingRef.current = null;
    void refresh({ warm: true });
    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        void refresh({ silent: true, keepAlive: true });
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
  }, [enabled, minRedialMs, peerOwnerId, nodeService.isConnected, nodeService.isReady, pollMs, refresh]);

  return { info, checking, refresh };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
