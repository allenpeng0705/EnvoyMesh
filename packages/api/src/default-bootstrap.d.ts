/**
 * First-run / WAN-default connectivity: public libp2p bootstrap presets plus EnvoyMesh community relays.
 * Keep in sync with `apps/node` bootstrap preset expansion (`bootstrapPeersForPreset`, `bootstrap-resolver` KNOWN_PRESETS).
 */
/** Preset identifiers expanded to public libp2p bootstrap DNS multiaddrs + community Envoy relays. */
export declare const DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS: readonly ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7", "cn-relay", "us-relay"];
/** EnvoyMesh community relay — Asia (also selectable as preset id `cn-relay`). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR: "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
/** EnvoyMesh community relay — US (also selectable as preset id `us-relay`). */
export declare const DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR: "/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb";
/** Both community EnvoyMesh relay multiaddrs (CN + US). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS: readonly ["/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo", "/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb"];
/** Extract libp2p peer id from a `/p2p/<id>` multiaddr suffix. */
export declare function peerIdFromBootstrapMultiaddr(addr: string): string | null;
/** Peer IDs of shipped community preset relays (cn-relay + us-relay). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS: string[];
/** True when `peerId` is a shipped community preset relay (trust anchor for gated join). */
export declare function isCommunityPresetRelayPeerId(peerId: string): boolean;
/** Merge shipped community relay multiaddrs into a bootstrap list (dedupe). */
export declare function mergeCommunityRelaySiblingBootstraps(existing: readonly string[]): string[];
/** HTTP info port exposed by community relays (serves WebSocket client-proxy on /ws). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT = 15432;
export type DefaultPublicBootstrapPresetId = (typeof DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS)[number];
/** Relay-only bootstraps for bonded-contact / relay-first nodes (no public libp2p swarm). */
export declare const DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS: readonly ["cn-relay", "us-relay"];
export type DiscoveryBootstrapProfile = "lan-fast" | "wan-default" | "relay-only" | "contacts-only";
/** Default bootstrap preset ids for a discovery profile (before explicit operator overrides). */
export declare function defaultBootstrapPresetsForDiscoveryProfile(profile: DiscoveryBootstrapProfile): readonly string[];
/**
 * Legacy upgrade: homes that only persisted `cn-relay` (pre-US) pick up `us-relay`.
 * Does not force both hubs when the operator explicitly removed one.
 */
export declare function ensureCommunityRelaySiblingPresets(presets: readonly string[]): string[];
/** Strip public-libp2p swarm presets; ensure community cn-relay + us-relay remain for reachability. */
export declare function normalizeBootstrapPresetsForContactsOnly(presets: readonly string[]): string[];
