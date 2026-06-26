import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

/** Passive reachability poll for sidebar dots. */
export const BONDS_REACHABILITY_POLL_MS = 30_000;
/** At most one UI-triggered warm per contact per interval (avoids dial storms). */
export const BONDS_REACHABILITY_WARM_COOLDOWN_MS = 120_000;

export function useBondsReachability(peerOwnerIds: readonly string[], enabled = true) {
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const [map, setMap] = useState<Map<string, PeerConnectionInfo>>(() => new Map());
  const lastWarmAtRef = useRef<Map<string, number>>(new Map());
  const idsKey = peerOwnerIds.join("\n");

  const refresh = useCallback(async () => {
    const ns = nodeServiceRef.current;
    if (!enabled || peerOwnerIds.length === 0 || !ns.isConnected || !ns.isReady) {
      return;
    }
    const now = Date.now();
    const entries = await Promise.all(
      peerOwnerIds.map(async (ownerId) => {
        try {
          let info = await ns.getPeerConnectionInfo(ownerId);
          if (!info.connected) {
            const lastWarm = lastWarmAtRef.current.get(ownerId) ?? 0;
            if (now - lastWarm >= BONDS_REACHABILITY_WARM_COOLDOWN_MS) {
              lastWarmAtRef.current.set(ownerId, now);
              info = await ns.warmContactConnection(ownerId);
            }
          }
          return [ownerId, info] as const;
        } catch {
          return [ownerId, { connected: false, direct: false }] as const;
        }
      }),
    );
    setMap(new Map(entries));
  }, [enabled, idsKey, peerOwnerIds]);

  useEffect(() => {
    if (!enabled || peerOwnerIds.length === 0 || !nodeService.isConnected || !nodeService.isReady) {
      return;
    }
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, BONDS_REACHABILITY_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, idsKey, nodeService.isConnected, nodeService.isReady, peerOwnerIds.length, refresh]);

  return { map, refresh };
}

export function bondReachabilityClass(info: PeerConnectionInfo | undefined): string {
  if (!info?.connected) return "offline";
  return info.direct ? "online-direct" : "online-relay";
}
