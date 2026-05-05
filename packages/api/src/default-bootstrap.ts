/**
 * First-run / WAN-default connectivity: public libp2p bootstrap presets plus the EnvoyMesh community relay.
 * Keep in sync with `apps/node` bootstrap preset expansion (`bootstrapPeersForPreset`, `bootstrap-resolver` KNOWN_PRESETS).
 */

/** Preset identifiers expanded to public libp2p bootstrap DNS multiaddrs. */
export const DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS = [
  "public-libp2p",
  "public-libp2p-am6",
  "public-libp2p-am7",
] as const

/** EnvoyMesh-operated relay (also selectable as preset id `cn-relay`). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo" as const

export type DefaultPublicBootstrapPresetId = (typeof DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS)[number]
