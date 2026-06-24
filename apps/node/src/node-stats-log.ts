import type { EnvoyMesh } from "@envoymesh/network";

export const NODE_STATS_INTERVAL_MS = 60_000;
/** Log a hint when libp2p connection count suggests dial churn / GC pressure. */
export const HIGH_CONNECTION_COUNT_WARN = 60;

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
      `[node-stats] WARNING: ${conn.totalConnections} open libp2p connections (peers=${conn.totalPeerIds}${dialPart}) — check relay dial churn; bond warm runs every 60s per contact`,
    );
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
