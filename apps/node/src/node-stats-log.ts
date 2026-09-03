import {
  PRUNE_EXCESS_SWARM_MAX_PEERS,
  pruneThresholdForMaxConnections,
  assessDialBudget,
  type EnvoyMesh,
} from "@envoymesh/network";

export const NODE_STATS_INTERVAL_MS = 30_000;
/** Log a hint when libp2p connection count approaches the client cap (48). */
export const HIGH_CONNECTION_COUNT_WARN = 40;

export interface NodeStatsLogContext {
  processStartedAtMs: number;
  /** When running as relay-server CLI, report in-memory roster size. */
  relayRosterSize?: () => number;
  /**
   * The node's effective maxConnections (from the connectivity preset). When
   * set, the prune threshold tracks it so low-cap presets (quietWan=24) don't
   * over-prune legitimate peers. Undefined → use the fixed default (32).
   * See docs/connectivity-internals-and-design.md Solution C1.
   */
  maxConnections?: number;
  /** Latest event-loop lag sample (ms); logged when elevated. */
  getEventLoopLagMs?: () => number;
}

/** Warn when lag exceeds this (below the 2s health-exit threshold). */
export const NODE_STATS_LAG_WARN_MS = 500;

export function logNodeRuntimeStats(mesh: EnvoyMesh, context: NodeStatsLogContext): void {
  const uptimeSeconds = Math.floor((Date.now() - context.processStartedAtMs) / 1000);
  const conn = mesh.getConnectionStats();
  const mem = process.memoryUsage?.() ?? { rss: 0, heapUsed: 0 };
  const rssMB = Math.floor(mem.rss / 1024 / 1024);
  const heapMB = Math.floor(mem.heapUsed / 1024 / 1024);
  const rosterSize = context.relayRosterSize?.();
  const rosterPart = rosterSize != null ? ` relayRoster=${rosterSize}` : "";

  if (uptimeSeconds % 300 < 60 || rssMB > 1024) {
    const extMB = Math.floor((mem.external ?? 0) / 1024 / 1024);
    const abMB = Math.floor((mem.arrayBuffers ?? 0) / 1024 / 1024);
    const dialPart = conn.dialQueueLength != null ? ` dialQueue=${conn.dialQueueLength}` : "";
    const lagMs = context.getEventLoopLagMs?.();
    const lagPart =
      typeof lagMs === "number" && Number.isFinite(lagMs) ? ` eventLoopLag=${Math.round(lagMs)}ms` : "";
    // circuitPeers = open hop connections TO us; liveReservation+advCircuits =
    // whether EnvoyGo can dial US via /p2p-circuit/ under CGNAT.
    const liveReservation =
      typeof mesh.hasLiveRelayReservation === "function" && mesh.hasLiveRelayReservation()
        ? 1
        : 0;
    const failureStreak =
      typeof mesh.getRelayReservationStatus === "function"
        ? (mesh.getRelayReservationStatus().failureStreak ?? 0)
        : 0;
    const advCircuits =
      typeof mesh.getRelayAdvertisedMultiaddrs === "function"
        ? mesh.getRelayAdvertisedMultiaddrs().filter((a) => a.includes("/p2p-circuit")).length
        : 0;
    console.log(
      `[node-stats] uptime=${uptimeSeconds}s circuitPeers=${conn.circuitPeerIds.length} circuitConns=${conn.circuitConnections} liveReservation=${liveReservation} advCircuits=${advCircuits} resvFailStreak=${failureStreak} totalPeers=${conn.totalPeerIds} totalConns=${conn.totalConnections}${rosterPart}${dialPart}${lagPart} memoryRss=${rssMB}MB heapUsed=${heapMB}MB external=${extMB}MB arrayBuffers=${abMB}MB`,
    );
  }

  const lagSample = context.getEventLoopLagMs?.();
  if (typeof lagSample === "number" && lagSample > NODE_STATS_LAG_WARN_MS) {
    const dialPart = conn.dialQueueLength != null ? ` dialQueue=${conn.dialQueueLength}` : "";
    console.warn(
      `[node-stats] WARNING: eventLoopLag=${Math.round(lagSample)}ms (>${NODE_STATS_LAG_WARN_MS})${dialPart} — soft wedge risk; sibling /health watchdog will SIGKILL if /health stops answering`,
    );
  }

  if (rssMB > 2048) {
    const extMB = Math.floor((mem.external ?? 0) / 1024 / 1024);
    const abMB = Math.floor((mem.arrayBuffers ?? 0) / 1024 / 1024);
    const dialPart = conn.dialQueueLength != null ? ` dialQueue=${conn.dialQueueLength}` : "";
    console.warn(
      `[node-stats] WARNING: memory usage ${rssMB}MB exceeds 2GB (heapUsed=${heapMB}MB external=${extMB}MB arrayBuffers=${abMB}MB totalConns=${conn.totalConnections}${dialPart}) — may be libp2p/GC pressure, not necessarily a leak`,
    );
  }

  if (conn.totalConnections >= HIGH_CONNECTION_COUNT_WARN) {
    const dialPart = conn.dialQueueLength != null ? ` dialQueue=${conn.dialQueueLength}` : "";
    console.warn(
      `[node-stats] WARNING: ${conn.totalConnections} open libp2p connections (peers=${conn.totalPeerIds}${dialPart}) — check relay dial churn; bond-warm interval=${60_000 * 5}ms (5min) per contact with ${60_000 * 5}ms per-contact cooldown (cap ${"see BOND_WARM_MAX_CONNECTIONS"})`,
    );
  }

  // Operator signal: prune kicks in at dialQueue>20, but a sustained queue
  // above background threshold means something is still storming (reprobe/bond-warm/DHT).
  const dialBudget = assessDialBudget(conn.dialQueueLength);
  if (dialBudget.deferBackgroundWork) {
    console.warn(
      `[node-stats] WARNING: dialQueue=${dialBudget.dialQueueLength} (congested) — dial/microtask storm risk; check bootstrap pollution and liveReservation`,
    );
  }

  // Protect circuit-relay hoppability: prune anonymous DHT/bootstrap peers
  // when the dial queue or peer count crosses the (preset-scaled) threshold.
  const pruneMaxPeers = pruneThresholdForMaxConnections(context.maxConnections);
  if (dialBudget.shouldPrune || conn.totalPeerIds > pruneMaxPeers) {
    void mesh
      .pruneExcessSwarmConnections({ maxPeers: pruneMaxPeers })
      .catch((err) => {
        console.warn(
          "[node-stats] pruneExcessSwarmConnections failed:",
          err instanceof Error ? err.message : err,
        );
      });
  }
}

export function startNodeStatsInterval(mesh: EnvoyMesh, context: NodeStatsLogContext): () => void {
  const timer = setInterval(() => {
    try {
      logNodeRuntimeStats(mesh, context);
    } catch (err) {
      console.error("[node-stats] stats interval error:", err);
    }
  }, NODE_STATS_INTERVAL_MS);
  return () => clearInterval(timer);
}
