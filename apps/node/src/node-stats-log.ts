import type { EnvoyMesh } from "@envoymesh/network";

export const NODE_STATS_INTERVAL_MS = 60_000;

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
    console.log(
      `[node-stats] uptime=${uptimeSeconds}s circuitPeers=${conn.circuitPeerIds.length} circuitConns=${conn.circuitConnections} totalPeers=${conn.totalPeerIds} totalConns=${conn.totalConnections}${rosterPart} memoryRss=${rssMB}MB heapUsed=${heapMB}MB`,
    );
  }

  if (rssMB > 2048) {
    console.warn(`[node-stats] WARNING: memory usage ${rssMB}MB exceeds 2GB - possible leak`);
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
