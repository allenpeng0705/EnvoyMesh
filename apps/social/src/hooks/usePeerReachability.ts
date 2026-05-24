import { useCallback, useEffect, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

const POLL_MS = 8_000;

/** Live libp2p reachability for a bonded contact (direct P2P or relay circuit). */
export function usePeerReachability(peerOwnerId: string | null, enabled = true) {
  const nodeService = useNodeService();
  const [info, setInfo] = useState<PeerConnectionInfo | null>(null);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(
    async (opts?: { warm?: boolean }) => {
      if (!enabled || !peerOwnerId || !nodeService.isConnected) {
        setInfo(null);
        return;
      }
      setChecking(true);
      try {
        const next = opts?.warm
          ? await nodeService.warmContactConnection(peerOwnerId)
          : await nodeService.getPeerConnectionInfo(peerOwnerId);
        setInfo(next);
      } catch {
        setInfo({ connected: false, direct: false });
      } finally {
        setChecking(false);
      }
    },
    [enabled, nodeService, peerOwnerId],
  );

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected) {
      setInfo(null);
      setChecking(false);
      return;
    }
    void refresh({ warm: true });
    const id = setInterval(() => {
      void refresh();
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
