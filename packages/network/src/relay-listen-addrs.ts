/**
 * Helpers for circuit-relay listen / advertise filtering.
 * Separated so unit tests can cover without spinning libp2p.
 */

import {
  isPrivateRelayHopCircuitDialHint,
  relayCircuitToPeer,
} from "./relay-circuit-hints.js";

/** Extract trailing `/p2p/<peerId>` from a multiaddr (relay base, not circuit target). */
export function peerIdFromRelayMultiaddr(addr: string): string | undefined {
  const t = addr.trim();
  if (!t || t.includes("/p2p-circuit")) return undefined;
  const m = t.match(/\/p2p\/([^/]+)$/);
  return m?.[1];
}

/** Hop relay peer id inside `/p2p/<hop>/p2p-circuit…`. */
export function circuitHopPeerId(addr: string): string | undefined {
  const hop = addr.trim().match(/\/p2p\/([^/]+)\/p2p-circuit(?:\/|$)/);
  return hop?.[1];
}

/** Target peer id at `/p2p-circuit/p2p/<target>`. */
export function circuitTargetPeerId(addr: string): string | undefined {
  const m = addr.trim().match(/\/p2p-circuit\/p2p\/([^/]+)$/);
  return m?.[1];
}

function isPrivateRelayBase(base: string): boolean {
  const b = base.trim().replace(/\/$/, "");
  if (!b) return true;
  return isPrivateRelayHopCircuitDialHint(`${b}/p2p-circuit/p2p/_`);
}

/**
 * Multiaddrs safe to publish via relay.checkin / WAN invite.
 *
 * - Drops `/p2p-circuit/` paths whose hop is not in `usableRelayPeerIds`
 *   (store ∩ open connection) so we never advertise a dead reservation.
 * - Rewrites private-hop circuits (loopback / RFC1918) onto public
 *   `preferredRelayBases` for the same hop peer.
 * - Synthesizes a public circuit per usable preferred relay when listen
 *   addrs only exposed private views of that hop.
 */
export function buildRelayAdvertisedMultiaddrs(input: {
  listenAddrs: readonly string[];
  preferredRelayBases: readonly string[];
  usableRelayPeerIds: readonly string[];
  selfPeerId?: string;
}): string[] {
  const usable = new Set(input.usableRelayPeerIds.filter(Boolean));
  const basesByPeer = new Map<string, string[]>();
  for (const raw of input.preferredRelayBases) {
    const base = raw.trim().replace(/\/$/, "");
    const pid = peerIdFromRelayMultiaddr(base);
    if (!pid || isPrivateRelayBase(base)) continue;
    const list = basesByPeer.get(pid) ?? [];
    if (!list.includes(base)) list.push(base);
    basesByPeer.set(pid, list);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (addr: string): void => {
    const t = addr.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const raw of input.listenAddrs) {
    const addr = raw.trim();
    if (!addr) continue;
    if (!addr.includes("/p2p-circuit")) {
      add(addr);
      continue;
    }
    const hop = circuitHopPeerId(addr);
    if (!hop || !usable.has(hop)) continue;

    const target = circuitTargetPeerId(addr) ?? input.selfPeerId;
    if (isPrivateRelayHopCircuitDialHint(addr)) {
      const bases = basesByPeer.get(hop) ?? [];
      for (const base of bases) {
        if (!target) break;
        const circuit = relayCircuitToPeer(base, target);
        if (circuit) add(circuit);
      }
      continue;
    }
    add(addr);
  }

  if (input.selfPeerId) {
    for (const hop of usable) {
      for (const base of basesByPeer.get(hop) ?? []) {
        const circuit = relayCircuitToPeer(base, input.selfPeerId);
        if (circuit) add(circuit);
      }
    }
  }

  return out;
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
