import { useCallback, useEffect, useRef, useState } from "react";
import type { PeerConnectionInfo, WarmContactConnectionOptions } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";
import {
  applyReachabilityHysteresis,
  createReachabilityHysteresisState,
  REACHABILITY_MIN_REDIAL_MS,
  REACHABILITY_OFFLINE_GRACE_MS,
  REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS,
  REACHABILITY_OPEN_CHAT_OFFLINE_GRACE_MS,
  REACHABILITY_OPEN_CHAT_POLL_MS,
  REACHABILITY_OPEN_CHAT_RELAY_UPGRADE_MS,
  REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS,
  REACHABILITY_POLL_MS,
  REACHABILITY_STABLE_PATH_POLLS,
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
  const bootstrapStartedRef = useRef(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const pollMs = enabled ? REACHABILITY_OPEN_CHAT_POLL_MS : REACHABILITY_POLL_MS;
  const minWarmMs = enabled ? REACHABILITY_OPEN_CHAT_MIN_REDIAL_MS : REACHABILITY_MIN_REDIAL_MS;
  const relayUpgradeMs = enabled ? REACHABILITY_OPEN_CHAT_RELAY_UPGRADE_MS : REACHABILITY_MIN_REDIAL_MS;
  const offlineGraceMs = enabled ? REACHABILITY_OPEN_CHAT_OFFLINE_GRACE_MS : REACHABILITY_OFFLINE_GRACE_MS;
  const stablePathPolls = enabled
    ? REACHABILITY_OPEN_CHAT_STABLE_PATH_POLLS
    : REACHABILITY_STABLE_PATH_POLLS;

  const applyReading = useCallback(
    (
      next: PeerConnectionInfo,
      generation: number,
      opts?: { immediate?: boolean; deferOffline?: boolean },
    ) => {
      if (generation !== peerGenerationRef.current) {
        return;
      }
      if (opts?.deferOffline && !next.connected) {
        libp2pConnectedRef.current = false;
        libp2pDirectRef.current = false;
        return;
      }
      libp2pConnectedRef.current = next.connected;
      libp2pDirectRef.current = next.direct;
      const now = Date.now();
      const result = applyReachabilityHysteresis(hysteresisRef.current, next, now, {
        offlineGraceMs,
        immediate: opts?.immediate,
        stablePathPolls,
      });
      hysteresisRef.current = result.state;
      if (result.shouldUpdate && result.info) {
        setInfo(result.info);
      }
    },
    [offlineGraceMs, stablePathPolls],
  );

  const warmSource = "open_chat" as const satisfies WarmContactConnectionOptions["source"];

  const warmWithSource = useCallback(
    (
      opts: Omit<WarmContactConnectionOptions, "source">,
    ): WarmContactConnectionOptions => ({ ...opts, source: warmSource }),
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
        upgradeRelayToDirect?: boolean;
        silent?: boolean;
        immediate?: boolean;
        deferOffline?: boolean;
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
          next = await ns.warmContactConnection(
            peerOwnerId,
            warmWithSource({
              redial: true,
              upgradeRelayToDirect: true,
              force: true,
            }),
          );
        } else if (opts?.upgradeRelayToDirect) {
          lastRedialAtRef.current = Date.now();
          next = await ns.warmContactConnection(
            peerOwnerId,
            warmWithSource({ upgradeRelayToDirect: true }),
          );
        } else if (opts?.verifyConnection) {
          next = await ns.warmContactConnection(
            peerOwnerId,
            warmWithSource({ verifyConnection: true }),
          );
        } else if (opts?.keepAlive) {
          next = await ns.warmContactConnection(
            peerOwnerId,
            warmWithSource({ keepAlive: true }),
          );
        } else if (opts?.verifyOnly) {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        } else if (opts?.warm) {
          lastRedialAtRef.current = Date.now();
          next = await ns.warmContactConnection(peerOwnerId, warmWithSource({}));
        } else {
          next = await ns.getPeerConnectionInfo(peerOwnerId);
        }

        const immediate =
          opts?.immediate === true ||
          (opts?.warm === true && !next.connected) ||
          (next.connected &&
            (opts?.warm === true ||
              opts?.redial === true ||
              opts?.upgradeRelayToDirect === true ||
              opts?.keepAlive === true ||
              opts?.verifyOnly === true));

        applyReading(next, generation, {
          immediate,
          deferOffline: opts?.deferOffline,
        });
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
            ...(libp2pConnectedRef.current
              ? libp2pDirectRef.current
                ? { verifyOnly: true }
                : { upgradeRelayToDirect: true }
              : { warm: true }),
          });
        }
      }
    },
    [applyReading, enabled, peerOwnerId, warmWithSource],
  );

  // Reset only when the selected contact changes — not on every poll effect re-run.
  useEffect(() => {
    peerGenerationRef.current += 1;
    hysteresisRef.current = createReachabilityHysteresisState();
    lastRedialAtRef.current = 0;
    libp2pConnectedRef.current = false;
    libp2pDirectRef.current = false;
    bootstrapStartedRef.current = false;
    setBootstrapping(false);
    setInfo(null);
    setChecking(false);
  }, [peerOwnerId]);

  useEffect(() => {
    if (!enabled || !peerOwnerId || !nodeService.isConnected || !nodeService.isReady) {
      setChecking(false);
      return;
    }

    const generation = peerGenerationRef.current;

    if (!bootstrapStartedRef.current) {
      bootstrapStartedRef.current = true;
      setBootstrapping(true);
      setChecking(true);
      void (async () => {
        try {
          await runRefresh(generation, {
            verifyOnly: true,
            silent: true,
            deferOffline: true,
            immediate: true,
          });
          if (generation !== peerGenerationRef.current) {
            return;
          }
          if (libp2pConnectedRef.current) {
            // Already connected — show Online immediately; do not probe or upgrade on open.
            return;
          }
          await runRefresh(generation, { warm: true, silent: true });
        } finally {
          if (generation === peerGenerationRef.current) {
            setBootstrapping(false);
            setChecking(false);
          }
        }
      })();
    }

    const id = setInterval(() => {
      const now = Date.now();
      if (libp2pConnectedRef.current) {
        if (libp2pDirectRef.current) {
          void runRefresh(generation, { silent: true, verifyOnly: true });
        } else {
          const dueForUpgrade = now - lastRedialAtRef.current >= relayUpgradeMs;
          void runRefresh(generation, {
            silent: true,
            ...(dueForUpgrade ? { upgradeRelayToDirect: true } : { verifyOnly: true }),
          });
        }
        return;
      }
      const dueForWarm = now - lastRedialAtRef.current >= minWarmMs;
      void runRefresh(generation, {
        silent: true,
        ...(dueForWarm ? { warm: true } : { verifyOnly: true, deferOffline: true }),
      });
    }, pollMs);

    return () => clearInterval(id);
  }, [
    enabled,
    minWarmMs,
    relayUpgradeMs,
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

  return {
    info,
    checking: checking || bootstrapping,
    refresh,
  };
}

export { peerReachabilityLabel } from "../lib/peer-reachability-label.js";
