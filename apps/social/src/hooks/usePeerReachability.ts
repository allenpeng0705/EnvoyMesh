import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

const POLL_ONLINE_MS = 25_000;
const POLL_OFFLINE_MS = 12_000;
/** Keep showing online briefly after a transient libp2p disconnect (idle timeout, mesh repair). */
const OFFLINE_GRACE_MS = 60_000;
/** Require consecutive failed checks before flipping UI to offline. */
const FAILURES_BEFORE_OFFLINE = 3;
/** After UI shows offline, run a full redial every N gentle probe cycles. */
const OFFLINE_REDIAL_EVERY = 3;
/** While connected via relay, verify chat stream every N polls (skip for direct LAN). */
const RELAY_VERIFY_EVERY = 4;

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const infoRef = useRef<PeerConnectionInfo | null>(null);
  const lastConnectedAtRef = useRef(0);
  const consecutiveFailuresRef = useRef(0);
  const offlineProbeCountRef = useRef(0);
  const relayVerifyCountRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const generationRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    infoRef.current = info;
  }, [info]);

  const applyReachabilityResult = useCallback((next: PeerConnectionInfo) => {
    if (next.connected) {
      lastConnectedAtRef.current = Date.now();
      consecutiveFailuresRef.current = 0;
      offlineProbeCountRef.current = 0;
      infoRef.current = next;
      setInfo(next);
      return;
    }
    setInfo((prev) => {
      if (!prev?.connected) {
        infoRef.current = next;
        return next;
      }
      consecutiveFailuresRef.current += 1;
      const withinGrace = Date.now() - lastConnectedAtRef.current < OFFLINE_GRACE_MS;
      if (withinGrace && consecutiveFailuresRef.current < FAILURES_BEFORE_OFFLINE) {
        return prev;
      }
      infoRef.current = next;
      return next;
    });
  }, []);

  const refresh = useCallback(
    async (opts?: { warm?: boolean; redial?: boolean; silent?: boolean }) => {
      if (!enabled || !peerOwnerId || !nodeService.isConnected) {
        setInfo(null);
        infoRef.current = null;
        return;
      }
      if (refreshInFlightRef.current) {
        return;
      }
      refreshInFlightRef.current = true;
      const gen = ++generationRef.current;
      const showChecking = !opts?.silent;
      if (showChecking) setChecking(true);
      try {
        let next: PeerConnectionInfo;

        if (opts?.redial === true || opts?.warm === true) {
          next = await nodeService.warmContactConnection(peerOwnerId, { redial: opts?.redial === true });
        } else {
          next = await nodeService.getPeerConnectionInfo(peerOwnerId);
          if (next.connected && next.direct) {
            /* Trust existing LAN direct connection — no warm/verify churn. */
          } else if (next.connected && !next.direct) {
            relayVerifyCountRef.current += 1;
            if (relayVerifyCountRef.current % RELAY_VERIFY_EVERY === 0) {
              const verified = await nodeService.warmContactConnection(peerOwnerId, {
                verifyOnly: true,
              });
              if (verified.connected) {
                next = verified;
              } else {
                next = verified;
              }
            }
          } else {
            offlineProbeCountRef.current += 1;
            const shouldRedial = offlineProbeCountRef.current % OFFLINE_REDIAL_EVERY === 0;
            next = await nodeService.warmContactConnection(peerOwnerId, {
              redial: shouldRedial,
            });
          }
        }

        if (gen !== generationRef.current) {
          return;
        }
        applyReachabilityResult(next);
      } catch {
        if (gen !== generationRef.current) {
          return;
        }
        applyReachabilityResult({ connected: false, direct: false });
      } finally {
        refreshInFlightRef.current = false;
        if (showChecking) setChecking(false);
      }
    },
    [applyReachabilityResult, enabled, nodeService, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected) {
      setInfo(null);
      infoRef.current = null;
      setChecking(false);
      lastConnectedAtRef.current = 0;
      consecutiveFailuresRef.current = 0;
      offlineProbeCountRef.current = 0;
      relayVerifyCountRef.current = 0;
      generationRef.current += 1;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const delay = infoRef.current?.connected === true ? POLL_ONLINE_MS : POLL_OFFLINE_MS;
      pollTimerRef.current = setTimeout(() => {
        void refresh({ silent: true }).finally(() => {
          scheduleNext();
        });
      }, delay);
    };

    void refresh({ silent: true }).finally(() => {
      scheduleNext();
    });

    return () => {
      cancelled = true;
      generationRef.current += 1;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [enabled, peerOwnerId, nodeService.isConnected, refresh]);

  return { info, checking, refresh };
}

export function peerReachabilityLabel(info: PeerConnectionInfo | null): string {
  if (!info) return "Checking…";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}
