import {
  PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD,
  PRUNE_EXCESS_SWARM_MAX_PEERS,
  type EnvoyMesh,
} from "@envoymesh/network";

export const NODE_STATS_INTERVAL_MS = 30_000;
/** Log a hint when libp2p connection count approaches the client cap (48). */
export const HIGH_CONNECTION_COUNT_WARN = 40;

export interface NodeStatsLogContext {
  processStartedAtMs: number;
  /** When running as relay-server CLI, report in-memory roster size. */
  relayRosterSize?: () => number;
}

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
    console.log(
      `[node-stats] uptime=${uptimeSeconds}s circuitPeers=${conn.circuitPeerIds.length} circuitConns=${conn.circuitConnections} totalPeers=${conn.totalPeerIds} totalConns=${conn.totalConnections}${rosterPart}${dialPart} memoryRss=${rssMB}MB heapUsed=${heapMB}MB external=${extMB}MB arrayBuffers=${abMB}MB`,
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

  // Protect circuit-relay hoppability: prune anonymous DHT/bootstrap peers
  // when the dial queue or peer count crosses pruneExcessSwarmConnections defaults.
  if (
    (conn.dialQueueLength != null &&
      conn.dialQueueLength > PRUNE_EXCESS_SWARM_DIAL_QUEUE_THRESHOLD) ||
    conn.totalPeerIds > PRUNE_EXCESS_SWARM_MAX_PEERS
  ) {
    void mesh.pruneExcessSwarmConnections().catch((err) => {
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
