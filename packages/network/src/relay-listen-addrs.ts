/**
 * Helpers for circuit-relay listen / advertise filtering.
 * Separated so unit tests can cover without spinning libp2p.
 */

/** Extract trailing `/p2p/<peerId>` from a multiaddr (relay base, not circuit target). */
export function peerIdFromRelayMultiaddr(addr: string): string | undefined {
  const t = addr.trim();
  if (!t || t.includes("/p2p-circuit")) return undefined;
  const m = t.match(/\/p2p\/([^/]+)$/);
  return m?.[1];
}

/**
 * Build libp2p listen multiaddrs that reserve on specific relays.
 *
 * Bare `/p2p-circuit` starts AutoRelay discovery against every HOP-capable
 * peer (including public IPFS bootstraps). Listening on
 * `<relayBase>/p2p-circuit` instead uses the configured path and does not
 * open that discovery hunt.
 */
export function buildConfiguredRelayCircuitListenAddrs(
  configuredRelayAddrs: readonly string[],
): string[] {
  const out: string[] = [];
  for (const raw of configuredRelayAddrs) {
    const base = raw.trim().replace(/\/+$/, "");
    if (!base || base.includes("/p2p-circuit")) continue;
    if (!base.includes("/p2p/")) continue;
    const listen = `${base}/p2p-circuit`;
    if (!out.includes(listen)) out.push(listen);
  }
  return out;
}

/**
 * Keep direct addrs; keep `/p2p-circuit/` only when the hop relay peer is
 * in `preferredRelayPeerIds`. When preferred is empty, return addrs unchanged.
 */
export function filterMultiaddrsToPreferredRelays(
  addrs: readonly string[],
  preferredRelayPeerIds: readonly string[],
): string[] {
  if (preferredRelayPeerIds.length === 0) return [...addrs];
  const preferred = new Set(preferredRelayPeerIds);
  return addrs.filter((a) => {
    if (!a.includes("/p2p-circuit")) return true;
    // `/ip4/…/p2p/<relay>/p2p-circuit/p2p/<us>` or listen form without trailing peer
    const hop = a.match(/\/p2p\/([^/]+)\/p2p-circuit(?:\/|$)/);
    if (!hop?.[1]) return false;
    return preferred.has(hop[1]);
  });
}
