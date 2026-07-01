import { useCallback, useEffect, useRef } from "react";
import { useNodeService } from "./useNodeService.js";
import {
  canStartBondWarm,
  markBondWarmFinished,
  markBondWarmStarted,
} from "../lib/bond-warm-coordinator.js";

/** Stagger background warms when the bonds list loads (avoid RPC burst). */
const PRELOAD_STAGGER_MS = 450;
/** Max bonds to pre-warm on list load. */
const PRELOAD_BONDS_ON_LOAD = 5;

/**
 * Best-effort libp2p pre-warm for bonded contacts (sidebar hover + list load).
 * Uses snapshot checks first; full warm only when disconnected and off shared cooldown.
 */
export function useBondConnectionPreload(peerOwnerIds: readonly string[]) {
  const nodeService = useNodeService();
  const nodeServiceRef = useRef(nodeService);
  nodeServiceRef.current = nodeService;

  const peerIdsKey = peerOwnerIds.join("\0");

  const preloadContact = useCallback((ownerId: string) => {
    const id = ownerId.trim();
    if (!id) return;

    const ns = nodeServiceRef.current;
    if (!ns.isConnected || !ns.isReady) return;
    if (!canStartBondWarm(id)) return;

    markBondWarmStarted(id);
    void (async () => {
      try {
        const snapshot = await ns.getPeerConnectionInfo(id);
        if (snapshot.connected) {
          return;
        }
        await ns.warmContactConnection(id);
      } catch {
        /* best-effort */
      } finally {
        markBondWarmFinished(id);
      }
    })();
  }, []);

  useEffect(() => {
    if (!nodeService.isConnected || !nodeService.isReady) return;
    const ids = peerIdsKey ? peerIdsKey.split("\0").slice(0, PRELOAD_BONDS_ON_LOAD) : [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    ids.forEach((id, index) => {
      timers.push(
        setTimeout(() => {
          preloadContact(id);
        }, index * PRELOAD_STAGGER_MS),
      );
    });
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [nodeService.isConnected, nodeService.isReady, peerIdsKey, preloadContact]);

  return { preloadOnHover: preloadContact };
}
