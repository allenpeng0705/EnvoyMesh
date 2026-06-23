import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

const POLL_MS = 12_000;
/** Brief grace before flipping UI offline after a successful connection check. */
const OFFLINE_GRACE_MS = 15_000;
/** Consecutive polls that must agree before showing offline or a path change. */
const STABLE_POLLS_REQUIRED = 2;

type ReachabilityLabel = "offline" | "direct" | "relay";

function reachabilityLabel(info: PeerConnectionInfo): ReachabilityLabel {
  if (!info.connected) return "offline";
  return info.direct ? "direct" : "relay";
}

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const lastConnectedAtRef = useRef(0);
  /** Tracks libp2p state (not UI grace) so background polls can redial when idle drops. */
  const libp2pConnectedRef = useRef(false);
  const displayedLabelRef = useRef<ReachabilityLabel | null>(null);
  const streakRef = useRef<{ label: ReachabilityLabel; count: number }>({
    label: "offline",
    count: 0,
  });

  const applyReading = useCallback((next: PeerConnectionInfo) => {
    const label = reachabilityLabel(next);
    libp2pConnectedRef.current = next.connected;

    if (next.connected) {
      lastConnectedAtRef.current = Date.now();
      const displayed = displayedLabelRef.current;
      const isPathChange =
        displayed !== null && displayed !== "offline" && displayed !== label;

      if (label === streakRef.current.label) {
        streakRef.current.count += 1;
      } else {
        streakRef.current = { label, count: 1 };
      }

      if (!isPathChange || streakRef.current.count >= STABLE_POLLS_REQUIRED) {
        displayedLabelRef.current = label;
        setInfo(next);
      }
      return;
    }

    if (label === streakRef.current.label) {
      streakRef.current.count += 1;
    } else {
      streakRef.current = { label, count: 1 };
    }

    if (streakRef.current.count < STABLE_POLLS_REQUIRED) {
      return;
    }

    setInfo((prev) => {
      if (!prev?.connected) {
        displayedLabelRef.current = "offline";
        return next;
      }
      const withinGrace = Date.now() - lastConnectedAtRef.current < OFFLINE_GRACE_MS;
      if (withinGrace) {
        return prev;
      }
      displayedLabelRef.current = "offline";
      return next;
    });
  }, []);

  const refresh = useCallback(
    async (opts?: { warm?: boolean; redial?: boolean; verifyOnly?: boolean; silent?: boolean }) => {
      if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
        if (!opts?.silent) {
          setInfo(null);
          displayedLabelRef.current = null;
        }
        libp2pConnectedRef.current = false;
        streakRef.current = { label: "offline", count: 0 };
        return;
      }
      const showChecking = !opts?.silent;
      if (showChecking) setChecking(true);
      try {
        let next: PeerConnectionInfo;
        if (opts?.redial) {
          next = await nodeService.warmContactConnection(peerOwnerId, {
            redial: true,
            upgradeRelayToDirect: true,
          });
        } else if (opts?.verifyOnly) {
          next = await nodeService.warmContactConnection(peerOwnerId, { verifyOnly: true });
        } else if (opts?.warm) {
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
      setInfo(null);
      setChecking(false);
      lastConnectedAtRef.current = 0;
      libp2pConnectedRef.current = false;
      displayedLabelRef.current = null;
      streakRef.current = { label: "offline", count: 0 };
      return;
    }
    void refresh({ warm: true });
    const id = setInterval(() => {
      void refresh({
        silent: true,
        verifyOnly: libp2pConnectedRef.current,
        warm: !libp2pConnectedRef.current,
      });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, peerOwnerId, nodeService.isConnected, nodeService.isReady, refresh]);

  return { info, checking, refresh };
}

export function peerReachabilityLabel(info: PeerConnectionInfo | null): string {
  if (!info) return "Checking…";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}
