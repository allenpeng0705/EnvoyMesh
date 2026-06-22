import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

const POLL_MS = 12_000;
/** Brief grace before flipping UI offline after a successful connection check. */
const OFFLINE_GRACE_MS = 30_000;

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const lastConnectedAtRef = useRef(0);

  const refresh = useCallback(
    async (opts?: { warm?: boolean; redial?: boolean; silent?: boolean }) => {
      if (!enabled || !peerOwnerId || !nodeService.isConnected) {
        setInfo(null);
        return;
      }
      const showChecking = !opts?.silent;
      if (showChecking) setChecking(true);
      try {
        let next: PeerConnectionInfo;
        if (opts?.warm || opts?.redial) {
          next = await nodeService.warmContactConnection(peerOwnerId, {
            redial: opts?.redial === true,
          });
        } else {
          next = await nodeService.getPeerConnectionInfo(peerOwnerId);
        }

        if (next.connected) {
          lastConnectedAtRef.current = Date.now();
          setInfo(next);
          return;
        }

        setInfo((prev) => {
          if (!prev?.connected) {
            return next;
          }
          const withinGrace = Date.now() - lastConnectedAtRef.current < OFFLINE_GRACE_MS;
          return withinGrace ? prev : next;
        });
      } catch {
        setInfo((prev) => {
          if (!prev?.connected) {
            return { connected: false, direct: false };
          }
          const withinGrace = Date.now() - lastConnectedAtRef.current < OFFLINE_GRACE_MS;
          return withinGrace ? prev : { connected: false, direct: false };
        });
      } finally {
        if (showChecking) setChecking(false);
      }
    },
    [enabled, nodeService, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected) {
      setInfo(null);
      setChecking(false);
      lastConnectedAtRef.current = 0;
      return;
    }
    void refresh({ warm: true });
    const id = setInterval(() => {
      void refresh({ silent: true });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, peerOwnerId, nodeService.isConnected, refresh]);

  return { info, checking, refresh };
}

export function peerReachabilityLabel(info: PeerConnectionInfo | null): string {
  if (!info) return "Checking…";
  if (!info.connected) return "Offline";
  if (info.direct) return "Online · Direct";
  return "Online · Relay";
}
