/** Default libp2p connection cap for client nodes (relay-server nodes stay uncapped). */
export const DEFAULT_CLIENT_MAX_CONNECTIONS = 150;

export interface MeshConnectionStats {
  totalPeerIds: number;
  totalConnections: number;
  circuitPeerIds: string[];
  circuitConnections: number;
}

type Libp2pConnectionLike = {
  remoteAddr?: { toString?: () => string };
  status?: string;
};

function isOpenConnection(conn: Libp2pConnectionLike | undefined): boolean {
  return conn?.status === "open" || conn?.status === undefined;
}

function remoteAddrIncludesCircuit(conn: Libp2pConnectionLike | undefined): boolean {
  return (conn?.remoteAddr?.toString?.() ?? "").includes("/p2p-circuit");
}

/**
 * Scan libp2p connection-manager state. Only open connections with `/p2p-circuit` in
 * `remoteAddr` count as circuit peers (Envoy relay paths and relay-server clients).
 */
export function scanLibp2pConnectionStats(
  connections: Iterable<[unknown, unknown]> | undefined,
): MeshConnectionStats {
  if (!connections) {
    return {
      totalPeerIds: 0,
      totalConnections: 0,
      circuitPeerIds: [],
      circuitConnections: 0,
    };
  }

  const circuitPeerIds: string[] = [];
  let totalConnections = 0;
  let circuitConnections = 0;
  let totalPeerIds = 0;

  for (const [peerIdStr, conns] of connections) {
    if (!Array.isArray(conns) || conns.length === 0) {
      continue;
    }

    const openConns = conns.filter((conn) => isOpenConnection(conn as Libp2pConnectionLike));
    if (openConns.length === 0) {
      continue;
    }

    totalPeerIds += 1;
    totalConnections += openConns.length;

    const hasCircuit = openConns.some((conn) => remoteAddrIncludesCircuit(conn as Libp2pConnectionLike));
    if (hasCircuit) {
      circuitPeerIds.push(String(peerIdStr));
      circuitConnections += openConns.filter((conn) =>
        remoteAddrIncludesCircuit(conn as Libp2pConnectionLike),
      ).length;
    }
  }

  return {
    totalPeerIds,
    totalConnections,
    circuitPeerIds,
    circuitConnections,
  };
}
