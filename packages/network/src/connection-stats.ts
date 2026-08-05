/**
 * Default libp2p connection cap for client nodes (relay-server nodes stay uncapped).
 *
 * Lowered from 150 to 48 (2026-07-31): the public DHT swarm fills 150
 * connections with anonymous peers, overloading the dial queue (250+) and
 * intermittently starving the circuit relay CONNECT handler. This causes
 * bond.request timeouts on WAN even though the relay reservation is "live."
 *
 * 48 is enough for:
 *   - DHT routing (bootstrap peers + k-bucket peers)
 *   - Discovery (capability topic providers)
 *   - Bonded contacts (direct + referred)
 *   - Circuit relay hops
 *   - mDNS LAN peers
 *
 * When the cap is hit, libp2p's connection manager evicts the lowest-priority
 * connections — anonymous DHT peers go first, tagged contacts/relays stay.
 */
export const DEFAULT_CLIENT_MAX_CONNECTIONS = 48;

/** Default mDNS browse interval — lower values increase LAN multicast CPU use. */
export const DEFAULT_MDNS_INTERVAL_MS = 10_000;

export interface MeshConnectionStats {
  totalPeerIds: number;
  totalConnections: number;
  circuitPeerIds: string[];
  circuitConnections: number;
  /** Open libp2p remote peer ids (direct + relay). */
  connectedPeerIds: string[];
  /** Pending outbound dials in libp2p queue (if available). */
  dialQueueLength?: number;
}

type Libp2pConnectionLike = {
  remoteAddr?: { toString?: () => string };
  remotePeer?: { toString?: () => string };
  status?: string;
};

function isOpenConnection(conn: Libp2pConnectionLike | undefined): boolean {
  return conn?.status === "open" || conn?.status === undefined;
}

function remoteAddrIncludesCircuit(conn: Libp2pConnectionLike | undefined): boolean {
  return (conn?.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit");
}

function aggregatePeerConnectionStats(
  peerConns: Iterable<[string, Libp2pConnectionLike[]]>,
): MeshConnectionStats {
  const circuitPeerIds: string[] = [];
  const connectedPeerIds: string[] = [];
  let totalConnections = 0;
  let circuitConnections = 0;
  let totalPeerIds = 0;

  for (const [peerIdStr, conns] of peerConns) {
    if (!Array.isArray(conns) || conns.length === 0) {
      continue;
    }

    const openConns = conns.filter((conn) => isOpenConnection(conn));
    if (openConns.length === 0) {
      continue;
    }

    totalPeerIds += 1;
    totalConnections += openConns.length;
    connectedPeerIds.push(String(peerIdStr));

    const hasCircuit = openConns.some((conn) => remoteAddrIncludesCircuit(conn));
    if (hasCircuit) {
      circuitPeerIds.push(String(peerIdStr));
      circuitConnections += openConns.filter((conn) => remoteAddrIncludesCircuit(conn)).length;
    }
  }

  return {
    totalPeerIds,
    totalConnections,
    circuitPeerIds,
    circuitConnections,
    connectedPeerIds,
  };
}

/**
 * Scan libp2p `getConnections()` output (libp2p v3+ API).
 */
export function scanLibp2pConnectionsFlat(
  connections: Libp2pConnectionLike[] | undefined,
): MeshConnectionStats {
  if (!connections?.length) {
    return {
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
      connectedPeerIds: [],
    };
  }

  const byPeer = new Map<string, Libp2pConnectionLike[]>();
  for (const conn of connections) {
    if (!isOpenConnection(conn)) {
      continue;
    }
    const peerIdStr = conn.remotePeer?.toString?.() ?? "unknown";
    const list = byPeer.get(peerIdStr) ?? [];
    list.push(conn);
    byPeer.set(peerIdStr, list);
  }

  return aggregatePeerConnectionStats(byPeer.entries());
}

/**
 * Scan libp2p connection-manager peer map (`getConnectionsMap()`).
 */
export function scanLibp2pConnectionsMap(
  connections: Map<string, Libp2pConnectionLike[]> | undefined,
): MeshConnectionStats {
  if (!connections) {
    return {
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
      connectedPeerIds: [],
    };
  }
  return aggregatePeerConnectionStats(connections.entries());
}

/**
 * @deprecated Prefer {@link scanLibp2pConnectionsFlat} or {@link scanLibp2pConnectionsMap}.
 * Legacy shape: iterable of `[peerId, connections[]]`.
 */
// Removed in P2 #20 — call sites already migrated. Keep this comment as a
// breadcrumb in case someone greps for the old name.
