/**
 * Discover dialability — can this row act now?
 *
 * A relay roster hit can be listed while holding no live circuit hop
 * (`hasHopSlot: false`, no addresses): fine to *show*, not yet dialable, so the
 * card must not offer a Say Hello that is guaranteed to fail (see
 * `DiscoverPeerCard`). Mirrors the EnvoyGo `PeerSearchResult.dialable` rule.
 */

/**
 * The subset of a Discover row that decides dialability.
 *
 * Deliberately structural rather than `Pick<PeerSearchResult, …>`: the desktop
 * `PeerSearchResult` (`@envoymesh/api`) carries no addresses, while EnvoyGo phone
 * hits do, and both feed the same rule.
 */
export type DialabilityInput = {
  /**
   * Live relay circuit hop, when the responding relay reported one (relay
   * roster). `undefined` = unknown / non-relay hit.
   */
  hasHopSlot?: boolean;
  /**
   * Known addresses — only present on sources that publish them (EnvoyGo phone
   * hits). The desktop node resolves dial paths from its peer directory and does
   * not send addresses in a Discover row, so the desktop only exercises the hop
   * clause below.
   */
  multiaddrs?: string[];
};

/** True for an address that does not need a relay circuit reservation. */
export function isDirectPeerAddress(addr: string): boolean {
  return !addr.includes("/p2p-circuit");
}

/**
 * True when a Say Hello has a chance of reaching this peer.
 *
 * 1. A *direct* address decides on its own — a hop report only governs
 *    `/p2p-circuit/` paths — so a peer that a DHT merge gave real addresses
 *    stays dialable even when a roster reported no live slot. (Phone-only today;
 *    the desktop merge in `mergeDhtAndRelayTopicResults` already prefers the
 *    hop-silent DHT hit for a peer that is in both sources.)
 * 2. An explicit `hasHopSlot: false` with no direct address is not dialable.
 * 3. Anything else (live hop, or a source that reported nothing) keeps the
 *    legacy permissive behaviour: the desktop node can still resolve a dial path
 *    from its peer directory, so silence is not proof of unreachability.
 */
export function isPeerReachableNow(peer: DialabilityInput): boolean {
  const addrs = peer.multiaddrs ?? [];
  if (addrs.some(isDirectPeerAddress)) return true;
  return peer.hasHopSlot !== false;
}
