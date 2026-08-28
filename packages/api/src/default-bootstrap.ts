/**
 * First-run / WAN-default connectivity: public libp2p bootstrap presets plus EnvoyMesh community relays.
 * Keep in sync with `apps/node` bootstrap preset expansion (`bootstrapPeersForPreset`, `bootstrap-resolver` KNOWN_PRESETS).
 */

/** Preset identifiers expanded to public libp2p bootstrap DNS multiaddrs + community Envoy relays. */
export const DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS = [
  "public-libp2p",
  "public-libp2p-am6",
  "public-libp2p-am7",
  "cn-relay",
  "us-relay",
] as const

/** EnvoyMesh community relay — Asia (also selectable as preset id `cn-relay`). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR =
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo" as const

/** EnvoyMesh community relay — US (also selectable as preset id `us-relay`). */
export const DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR =
  "/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb" as const

/** Both community EnvoyMesh relay multiaddrs (CN + US). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS = [
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
] as const

/** Extract libp2p peer id from a `/p2p/<id>` multiaddr suffix. */
export function peerIdFromBootstrapMultiaddr(addr: string): string | null {
  const m = addr.trim().match(/\/p2p\/([^/]+)$/)
  return m?.[1] ?? null
}

/** Peer IDs of shipped community preset relays (cn-relay + us-relay). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS = DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS.map(
  (addr) => peerIdFromBootstrapMultiaddr(addr),
).filter((id): id is string => id != null)

const COMMUNITY_PRESET_RELAY_PEER_ID_SET = new Set(DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS)

/** True when `peerId` is a shipped community preset relay (trust anchor for gated join). */
export function isCommunityPresetRelayPeerId(peerId: string): boolean {
  return COMMUNITY_PRESET_RELAY_PEER_ID_SET.has(peerId.trim())
}

/**
 * Merge shipped community relay multiaddrs into a bootstrap list (dedupe).
 * Used by public-mode relays to seed the sibling book from the repo fleet
 * without each host hand-editing `--bootstrap`. Self is filtered later by peer id.
 */
export function mergeCommunityRelaySiblingBootstraps(
  existing: readonly string[],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (addr: string): void => {
    const t = addr.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  for (const a of existing) push(a)
  for (const a of DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS) push(a)
  return out
}

/** HTTP info port exposed by community relays (serves WebSocket client-proxy on /ws). */
export const DEFAULT_ENVOY_COMMUNITY_RELAY_HTTP_PORT = 15432

export type DefaultPublicBootstrapPresetId = (typeof DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS)[number]

/** Relay-only bootstraps for bonded-contact / relay-first nodes (no public libp2p swarm). */
export const DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS = ["cn-relay", "us-relay"] as const

export type DiscoveryBootstrapProfile = "lan-fast" | "wan-default" | "relay-only" | "contacts-only"

/** Default bootstrap preset ids for a discovery profile (before explicit operator overrides). */
export function defaultBootstrapPresetsForDiscoveryProfile(
  profile: DiscoveryBootstrapProfile,
): readonly string[] {
  if (profile === "contacts-only" || profile === "relay-only") {
    return DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS
  }
  if (profile === "wan-default") {
    return DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS
  }
  return []
}

const PUBLIC_LIBP2P_PRESET_PREFIX = "public-libp2p"

const COMMUNITY_RELAY_PRESETS = ["cn-relay", "us-relay"] as const

/**
 * Legacy upgrade: homes that only persisted `cn-relay` (pre-US) pick up `us-relay`.
 * Does not re-add a hub the operator explicitly removed when the other is absent —
 * if either is missing while the other remains, only fill the historical CN→US gap.
 * (Independent opt-out of a single hub is allowed; defaults still ship both.)
 */
export function ensureCommunityRelaySiblingPresets(presets: readonly string[]): string[] {
  const trimmed = presets.map((p) => p.trim()).filter(Boolean)
  const hasCn = trimmed.includes("cn-relay")
  const hasUs = trimmed.includes("us-relay")
  if (!hasCn || hasUs) return trimmed
  // Insert us-relay immediately after cn-relay when present.
  const out: string[] = []
  for (const p of trimmed) {
    out.push(p)
    if (p === "cn-relay") out.push("us-relay")
  }
  return out
}

/** Strip public-libp2p swarm presets; ensure community cn-relay + us-relay remain for reachability. */
export function normalizeBootstrapPresetsForContactsOnly(presets: readonly string[]): string[] {
  const trimmed = presets.map((p) => p.trim()).filter(Boolean)
  const publicOnly = new Set<string>(DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS)
  const hasOnlyPublicDefaults = trimmed.length > 0 && trimmed.every((p) => publicOnly.has(p))
  if (hasOnlyPublicDefaults || trimmed.length === 0) {
    return [...DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS]
  }
  const withoutPublic = trimmed.filter((p) => !p.startsWith(PUBLIC_LIBP2P_PRESET_PREFIX))
  const rest = withoutPublic.filter((p) => p !== "cn-relay" && p !== "us-relay")
  return [...COMMUNITY_RELAY_PRESETS, ...rest]
}
