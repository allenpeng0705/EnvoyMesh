import type { RelayCheckinPayload } from "@envoymesh/protocol";

const DEFAULT_MAX_ADDR_LINES = 12;

/** Short tags for operator logs (multiaddr is not always valid for cross-network direct dial). */
export function describeMultiaddrReachability(addr: string): string {
  const a = addr.trim();
  const tags = new Set<string>();
  if (a.includes("/p2p-circuit/")) tags.add("circuit");
  if (a.includes("/ip4/127.0.0.1/") || a.includes("/ip6/::1/")) tags.add("loopback");
  if (a.includes("/ip4/0.0.0.0/")) tags.add("unspec-listen");
  if (
    /\/ip4\/10\./.test(a) ||
    /\/ip4\/192\.168\./.test(a) ||
    /\/ip4\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(a)
  ) {
    tags.add("rfc1918-private");
  }
  if (/\/ip4\/100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(a)) tags.add("cgnat");
  if (/\/dns4\//.test(a) || /\/dns6\//.test(a) || /\/dnsaddr\//.test(a)) tags.add("dns");
  if (
    !tags.has("circuit") &&
    !tags.has("loopback") &&
    !tags.has("unspec-listen") &&
    /\/ip4\//.test(a) &&
    !tags.has("rfc1918-private") &&
    !tags.has("cgnat")
  ) {
    tags.add("ipv4-global?");
  }
  if (!tags.has("circuit") && /\/ip6\//.test(a) && !tags.has("loopback")) {
    tags.add("ipv6");
  }
  if (tags.size === 0) tags.add("other");
  return [...tags].sort().join("|");
}

/** Logs libp2p multiaddrs sent in relay.checkin as relayReachableAddrs (for operators / debugging). */
export function logRelayReachableAddrsForCheckin(options: {
  prefix: string;
  source: string;
  peerId: string;
  ownerId?: string;
  addrs: readonly string[];
  maxLines?: number;
}): void {
  const { prefix, source, peerId, ownerId, addrs, maxLines = DEFAULT_MAX_ADDR_LINES } = options;
  const n = addrs.length;
  const oid = ownerId ?? "-";
  console.log(`${prefix} source=${source} peerId=${peerId} ownerId=${oid} relayReachableAddrs count=${n}`);
  const cap = Math.max(0, maxLines);
  for (let i = 0; i < Math.min(n, cap); i++) {
    const line = addrs[i];
    if (line !== undefined) {
      console.log(`${prefix}   [${describeMultiaddrReachability(line)}] ${line}`);
    }
  }
  if (n > cap) {
    console.log(`${prefix}   … and ${n - cap} more`);
  }
  console.log(
    `${prefix} hint: roster stores these for debugging; cross-network meshes usually dial peers via /p2p-circuit/ from the relay's public/DNS --advertise-addr, not via your LAN IP above.`,
  );
}

export function logRelayServerCheckinAccepted(input: {
  remoteLibp2pPeerId: string;
  payload: RelayCheckinPayload;
  rosterSize: number;
  addrChanged?: boolean;
  reconnect?: boolean;
}): void {
  const { remoteLibp2pPeerId, payload, rosterSize, addrChanged, reconnect } = input;
  const addrs = payload.relayReachableAddrs;
  const flags = [addrChanged ? "ADDR_CHANGED" : null, reconnect ? "RECONNECT" : null].filter(Boolean).join(" ");
  console.log(
    `[relay-server] checkin accepted libp2pConn=${remoteLibp2pPeerId} payload.peerId=${payload.peerId} ownerId=${payload.ownerId ?? "-"} addrs=${addrs.length} rosterEntries=${rosterSize}${flags ? ` (${flags})` : ""}`,
  );
  const cap = 8;
  for (let i = 0; i < Math.min(addrs.length, cap); i++) {
    const a = addrs[i];
    if (a !== undefined) {
      console.log(`[relay-server]   stored [${describeMultiaddrReachability(a)}] ${a}`);
    }
  }
  if (addrs.length > cap) {
    console.log(`[relay-server]   … and ${addrs.length - cap} more stored`);
  }
}

export function logRelayServerLookupResponse(input: {
  requesterLibp2pPeerId: string;
  queryId: string;
  peersReturned: number;
  circuitBases: readonly string[];
  peerMultiaddrs: readonly string[];
}): void {
  const { requesterLibp2pPeerId, queryId, peersReturned, circuitBases, peerMultiaddrs } = input;
  console.log(
    `[relay-server] relay.lookup.response to=${requesterLibp2pPeerId} query=${queryId} peers=${peersReturned} circuitBaseCount=${circuitBases.length}`,
  );
  for (let i = 0; i < Math.min(circuitBases.length, 6); i++) {
    const b = circuitBases[i];
    if (b !== undefined) {
      console.log(`[relay-server]   circuit base [${describeMultiaddrReachability(b)}] ${b}`);
    }
  }
  if (circuitBases.length > 6) {
    console.log(`[relay-server]   … and ${circuitBases.length - 6} more circuit bases`);
  }
  if (circuitBases.length === 0) {
    console.warn(
      "[relay-server] no circuit bases after filter — set --advertise-addr / discovery.advertiseAddrs so relay.lookup returns dialable /p2p-circuit paths.",
    );
  }
  const cap = 8;
  for (let i = 0; i < Math.min(peerMultiaddrs.length, cap); i++) {
    const m = peerMultiaddrs[i];
    if (m !== undefined) {
      console.log(`[relay-server]   candidate [${describeMultiaddrReachability(m)}] ${m}`);
    }
  }
  if (peerMultiaddrs.length > cap) {
    console.log(`[relay-server]   … and ${peerMultiaddrs.length - cap} more candidates`);
  }
}

export function logClientRelayLookupResponse(input: {
  queryId: string;
  peerCount: number;
  multiaddrs: readonly string[];
}): void {
  const { queryId, peerCount, multiaddrs } = input;
  console.log(
    `[relay-discovery] relay.lookup.response query=${queryId} peers=${peerCount} circuitAddrs=${multiaddrs.length}`,
  );
  const cap = 12;
  for (let i = 0; i < Math.min(multiaddrs.length, cap); i++) {
    const m = multiaddrs[i];
    if (m !== undefined) {
      console.log(`[relay-discovery]   [${describeMultiaddrReachability(m)}] ${m}`);
    }
  }
  if (multiaddrs.length > cap) {
    console.log(`[relay-discovery]   … and ${multiaddrs.length - cap} more`);
  }
  if (peerCount === 0) {
    console.warn(
      "[relay-discovery] lookup returned no peers — other nodes may not have checkin'd, or filters (capability/visibility) excluded them; check relay roster on server.",
    );
  }
}
