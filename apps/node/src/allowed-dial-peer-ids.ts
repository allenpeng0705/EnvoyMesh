/**
 * Strict dial allow-set for quietWan / aggressive / contacts-only.
 * Defense-in-depth: blocks outbound dials to anonymous DHT swarm peers.
 * Never enable on relay-server nodes (would break circuit hops).
 */
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS,
  peerIdFromBootstrapMultiaddr,
  type ConnectivityMode,
  type DiscoveryProfile,
} from "@envoymesh/api";

export function shouldEnableStrictDialPolicy(input: {
  connectivityMode?: ConnectivityMode | string | null;
  discoveryProfile?: DiscoveryProfile | string | null;
  relayServerEnabled?: boolean;
}): boolean {
  if (input.relayServerEnabled) return false;
  const mode = input.connectivityMode;
  if (mode === "quietWan" || mode === "aggressive") return true;
  if (input.discoveryProfile === "contacts-only") return true;
  return false;
}

/** Extract peer IDs from multiaddrs (last `/p2p/<id>` segment). */
export function peerIdsFromMultiaddrs(addrs: Iterable<string>): string[] {
  const out: string[] = [];
  for (const addr of addrs) {
    const id = peerIdFromBootstrapMultiaddr(addr);
    if (id) out.push(id);
    else {
      const idx = addr.lastIndexOf("/p2p/");
      if (idx >= 0) {
        const rest = addr.slice(idx + "/p2p/".length);
        const slash = rest.indexOf("/");
        const peer = slash >= 0 ? rest.slice(0, slash) : rest;
        if (peer) out.push(peer);
      }
    }
  }
  return out;
}

export interface BuildAllowedDialPeerIdsInput {
  selfPeerId?: string;
  bootstrapPeerIds?: Iterable<string>;
  preferredRelayPeerIds?: Iterable<string>;
  configuredRelayAddrs?: Iterable<string>;
  bondedTransportPeerIds?: Iterable<string>;
  seedAddrs?: Iterable<string>;
  nearbyOrConnectedPeerIds?: Iterable<string>;
  extraPeerIds?: Iterable<string>;
  /** When true (default), always include shipped CN/US community relays. */
  includeCommunityRelays?: boolean;
}

/**
 * Live allow-set for {@link EnvoyMeshOptions.allowedDialPeerIds}.
 * Always includes self + community relays when present.
 */
export function buildAllowedDialPeerIds(input: BuildAllowedDialPeerIdsInput): Set<string> {
  const out = new Set<string>();
  if (input.selfPeerId) out.add(input.selfPeerId);

  const includeCommunity = input.includeCommunityRelays !== false;
  if (includeCommunity) {
    for (const id of DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS) out.add(id);
  }

  const addAll = (items?: Iterable<string>) => {
    if (!items) return;
    for (const id of items) {
      if (id) out.add(id);
    }
  };

  addAll(input.bootstrapPeerIds);
  addAll(input.preferredRelayPeerIds);
  addAll(input.bondedTransportPeerIds);
  addAll(input.nearbyOrConnectedPeerIds);
  addAll(input.extraPeerIds);

  if (input.configuredRelayAddrs) {
    for (const id of peerIdsFromMultiaddrs(input.configuredRelayAddrs)) out.add(id);
  }
  if (input.seedAddrs) {
    for (const id of peerIdsFromMultiaddrs(input.seedAddrs)) out.add(id);
  }

  return out;
}

/** Mutable caches for the sync `allowedDialPeerIds` callback. */
export type StrictDialAllowCache = {
  bondedTransportPeerIds: Set<string>;
  seedAddrs: Set<string>;
  nearbyPeerIds: Set<string>;
  /** Ephemeral IDs (e.g. Discover search target before dial). */
  extraPeerIds: Set<string>;
};

export function createStrictDialAllowCache(): StrictDialAllowCache {
  return {
    bondedTransportPeerIds: new Set(),
    seedAddrs: new Set(),
    nearbyPeerIds: new Set(),
    extraPeerIds: new Set(),
  };
}

export function warnIfStrictDialAllowSetTooSmall(allowed: Set<string>, logPrefix = "[strict-dial]"): void {
  if (allowed.size < 2) {
    console.warn(
      `${logPrefix} allow-set size=${allowed.size} (<2) — community relays or bootstrap missing; gater may block useful dials`,
    );
  }
}
