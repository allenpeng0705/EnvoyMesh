/**
 * First-run / WAN-default connectivity: public libp2p bootstrap presets plus the EnvoyMesh community relay.
 * Keep in sync with `apps/node` bootstrap preset expansion (`bootstrapPeersForPreset`, `bootstrap-resolver` KNOWN_PRESETS).
 */
/** Preset identifiers expanded to public libp2p bootstrap DNS multiaddrs. */
export const DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS = [
    "public-libp2p",
    "public-libp2p-am6",
    "public-libp2p-am7",
    "cn-relay",
];
/** EnvoyMesh-operated relay (also selectable as preset id `cn-relay`). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
/** HTTP info port exposed by the community relay (serves WebSocket client-proxy on /ws). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT = 15432;
/** Relay-only bootstraps for bonded-contact / relay-first nodes (no public libp2p swarm). */
export const DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS = ["cn-relay"];
/** Default bootstrap preset ids for a discovery profile (before explicit operator overrides). */
export function defaultBootstrapPresetsForDiscoveryProfile(profile) {
    if (profile === "contacts-only" || profile === "relay-only") {
        return DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS;
    }
    if (profile === "wan-default") {
        return DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS;
    }
    return [];
}
const PUBLIC_LIBP2P_PRESET_PREFIX = "public-libp2p";
/** Strip public-libp2p swarm presets; ensure cn-relay remains for relay reachability. */
export function normalizeBootstrapPresetsForContactsOnly(presets) {
    const trimmed = presets.map((p) => p.trim()).filter(Boolean);
    const publicOnly = new Set(DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS);
    const hasOnlyPublicDefaults = trimmed.length > 0 && trimmed.every((p) => publicOnly.has(p));
    if (hasOnlyPublicDefaults || trimmed.length === 0) {
        return [...DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS];
    }
    const withoutPublic = trimmed.filter((p) => !p.startsWith(PUBLIC_LIBP2P_PRESET_PREFIX));
    if (!withoutPublic.includes("cn-relay")) {
        return ["cn-relay", ...withoutPublic];
    }
    return withoutPublic;
}
//# sourceMappingURL=default-bootstrap.js.map