/**
 * First-run / WAN-default connectivity: public libp2p bootstrap presets plus the EnvoyMesh community relay.
 * Keep in sync with `apps/node` bootstrap preset expansion (`bootstrapPeersForPreset`, `bootstrap-resolver` KNOWN_PRESETS).
 */
/** Preset identifiers expanded to public libp2p bootstrap DNS multiaddrs. */
export declare const DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS: readonly ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7", "cn-relay"];
/** EnvoyMesh-operated relay (also selectable as preset id `cn-relay`). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR: "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
/** HTTP info port exposed by the community relay (serves WebSocket client-proxy on /ws). */
export declare const DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT = 15432;
export type DefaultPublicBootstrapPresetId = (typeof DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS)[number];
/** Relay-only bootstraps for bonded-contact / relay-first nodes (no public libp2p swarm). */
export declare const DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS: readonly ["cn-relay"];
export type DiscoveryBootstrapProfile = "lan-fast" | "wan-default" | "contacts-only";
/** Default bootstrap preset ids for a discovery profile (before explicit operator overrides). */
export declare function defaultBootstrapPresetsForDiscoveryProfile(profile: DiscoveryBootstrapProfile): readonly string[];
/** Strip public-libp2p swarm presets; ensure cn-relay remains for relay reachability. */
export declare function normalizeBootstrapPresetsForContactsOnly(presets: readonly string[]): string[];
//# sourceMappingURL=default-bootstrap.d.ts.map
