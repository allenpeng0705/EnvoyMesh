/**
 * Builds multiaddrs used as {@link EnvoyMesh}'s outbound `dialHints`.
 * Drops loopback/non-routable listen addrs recorded for the *remote* peer (they dial localhost on this machine),
 * merges discovery seeds + relay circuit paths — same ingredients as outbound chat.
 */
import {
  isLikelyInboundConnSnapshotDialHint,
  isLoopbackOrUnspecifiedDialHint,
  isPrivateLanTcpDialHint,
  isPrivateOrUnroutableDialHint,
  isPublicLibp2pBootstrapMultiaddr,
  isUsableOutboundPeerDialHint,
  buildSyntheticRelayCircuitHints,
  dedupeDialHintStrings,
  hasDirectTcpDialHints,
  filterDialHintsForOutboundSend,
  prioritizeCircuitDialHints,
} from "@envoymesh/network";
import type { DialableAddrMode } from "@envoymesh/api";
import { expandCircuitDialCandidates } from "./discovery-inbound.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { createDefaultPersistedNodeConfig, type PersistedNodeConfig } from "./node-config-store.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR, DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS } from "@envoymesh/api";
import { filterDialableMultiaddrs } from "./node-service-wan.js";

/**
 * base58btc valid alphabet (RFC 4648 subset used by Bitcoin/IPFS):
 *   123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
 * Note: 0, O, I, l (lowercase-L) are explicitly excluded. A single
 * invalid character in a multiaddr's `/p2p/<id>` causes a
 * `SyntaxError: Non-base58btc character` at dial time. This guard
 * catches that early so corrupted addresses are silently dropped
 * rather than crashing the dial loop.
 */
const BASE58BTC_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** Return true if every peer-ID segment in the multiaddr is valid base58btc. */
export function isMultiaddrPeerIdsValid(addr: string): boolean {
  const parts = addr.split("/p2p/");
  // parts[0] is the transport prefix; parts[1..] are peer ID segments
  for (let i = 1; i < parts.length; i++) {
    // Each `/p2p/<value>` segment — the value may be followed by another
    // protocol (e.g. `/p2p/QmFoo/p2p-circuit/p2p/QmBar`), so take only
    // the first component after the peer ID.
    const peerId = parts[i]!.split("/")[0]!.trim();
    if (!peerId || !BASE58BTC_RE.test(peerId)) return false;
  }
  return true;
}

/**
 * Map the node's `discoveryProfile` to the right {@link DialableAddrMode}
 * for outbound dials.
 *
 * - `"lan-fast"` — same-LAN home setup; keep RFC1918 / CGNAT so direct
 *   dials work. (`"all"`)
 * - everything else (`"wan-default"`, `"relay-only"`, `"contacts-only"`)
 *   — strip RFC1918 / CGNAT / link-local / ULA. Cached LAN addresses
 *   from a previous same-network session will be dropped so we don't
 *   burn 30s dialing addresses that aren't reachable anymore. (`"wan-public"`)
 *
 * Callers that need an explicit mode (e.g. same-LAN mobile pairing
 * kiosk) can pass `addressFilter` directly.
 */
function defaultAddressFilterForProfile(
  config: PersistedNodeConfig | undefined,
): DialableAddrMode {
  if (config?.discoveryProfile === "lan-fast") return "all";
  return "wan-public";
}

/**
 * Smart address-filter selection for outbound dials to a known peer.
 *
 * - `lan-fast` → `"all"` (LAN first; circuits kept as fallback).
 * - Circuit + LAN → `"all"` so same-LAN can fall back after circuit.
 *   On wan-default, `buildOutboundDialHints` prefers circuits first so
 *   stale RFC1918 from installer tokens does not burn 30s before relay.
 * - Circuit only → `"wan-public"`.
 * - LAN only → `"all"`.
 * - Empty / unknown → `"wan-public"`.
 */
export function pickAddressFilterForPeer(
  peerMultiaddrs: readonly string[] | undefined,
  localDiscoveryProfile: string | undefined,
): DialableAddrMode {
  // Same-LAN home setup wins over any per-peer inspection.
  if (localDiscoveryProfile === "lan-fast") return "all";

  // No peer addresses known — fall back to "wan-public". The
  // lan-fast branch above already handled that case.
  if (!peerMultiaddrs || peerMultiaddrs.length === 0) {
    return "wan-public";
  }

  const hasLan = peerMultiaddrs.some((addr) =>
    isPrivateLanTcpDialHint(addr),
  );
  const hasCircuit = peerMultiaddrs.some((addr) =>
    addr.includes("/p2p-circuit/"),
  );

  if (hasCircuit && hasLan) return "all";
  if (hasCircuit) return "wan-public";
  if (hasLan) return "all";

  return "wan-public";
}

function dedupeDialHints(addrs: string[]): string[] {
  return dedupeDialHintStrings(addrs);
}

/** Drop public libp2p bootstrap, WebTransport, and incomplete circuit multiaddrs. */
function isUsableChatDialHint(addr: string, targetPeerId: string): boolean {
  return isUsableOutboundPeerDialHint(addr, targetPeerId);
}

/** Envoy/community relay bases for synthetic `/p2p-circuit/` dial hints — not libp2p public DHT bootstrap nodes. */
function relayBasesForCircuitDial(input: {
  config: PersistedNodeConfig | undefined;
  profileDir?: string;
}): string[] {
  const config =
    input.config ??
    (input.profileDir ? createDefaultPersistedNodeConfig(input.profileDir) : undefined);
  const bases: string[] = [];
  for (const relay of config?.configuredRelays ?? []) {
    if (relay.enabled && relay.addr?.trim()) {
      bases.push(relay.addr.trim());
    }
  }
  for (const addr of config?.bootstrapPeers ?? []) {
    const t = addr.trim();
    if (t && !isPublicLibp2pBootstrapMultiaddr(t)) {
      bases.push(t);
    }
  }
  const envBootstrap =
    process.env.ENVOYMESH_BOOTSTRAP_PEERS?.split(/[,]+/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  for (const addr of envBootstrap) {
    if (!isPublicLibp2pBootstrapMultiaddr(addr)) {
      bases.push(addr);
    }
  }
  const cfgPresets = config?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS];
  if (cfgPresets.includes("cn-relay") || config?.relayEnabled !== false) {
    bases.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  }
  // Drop any multiaddr whose /p2p/ segments contain invalid base58btc chars.
  // A corrupted peer ID (e.g. containing 'l' = lowercase-L, which is not
  // valid base58btc) causes a SyntaxError at dial time that kills the
  // entire retry loop. This guard catches that early.
  const validated = bases.filter((a) => {
    if (isMultiaddrPeerIdsValid(a)) return true;
    console.warn(`[dial-hints] dropping multiaddr with invalid base58btc peer ID: ${a.slice(0, 80)}…`);
    return false;
  });
  return dedupeDialHints(validated);
}

export async function buildOutboundDialHints(input: {
  recipientPeerId: string;
  peerListenAddrs: string[] | undefined;
  discoverySeedStore: DiscoverySeedStore | undefined;
  config: PersistedNodeConfig | undefined;
  profileDir?: string;
  /** Local node listen multiaddrs — same-subnet peers dial first. */
  localListenAddrs?: string[] | undefined;
  /**
   * Which multiaddr classes to keep in the final dial hint list. Defaults
   * to `defaultAddressFilterForProfile(config)` — `wan-public` for any
   * `discoveryProfile` other than `lan-fast`. Pass explicitly for flows
   * that need to override (e.g. mobile pairing kiosk on the same LAN).
   */
  addressFilter?: DialableAddrMode;
}): Promise<string[]> {
  const recipientPeerId = input.recipientPeerId.trim();
  const raw = (input.peerListenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
  /** Never dial the remote peer's loopback or local docker-bridge IP from our machine. */
  const nonLoopListen = raw.filter((a) => isUsableChatDialHint(a, recipientPeerId));

  const store = input.discoverySeedStore;
  if (!store) {
    return filterDialHintsByAddressFilter(
      dedupeDialHints(nonLoopListen),
      input.addressFilter ?? defaultAddressFilterForProfile(input.config),
    );
  }

  const seeds = (await store.listSeedAddrs()).filter((a) => isUsableChatDialHint(a, recipientPeerId));
  const relayPool = dedupeDialHints([
    ...seeds.filter((s) => s.includes("/p2p-circuit/")),
    ...relayBasesForCircuitDial({ config: input.config, profileDir: input.profileDir }),
  ]).filter((a) => isUsableOutboundPeerDialHint(a));

  let out = [...nonLoopListen];
  const peerSeeds = seeds.filter((s) => s.includes(recipientPeerId));
  for (const addr of peerSeeds) {
    out.push(addr);
    if (addr.includes("/p2p-circuit/")) {
      out.push(...expandCircuitDialCandidates(addr, relayPool));
    }
  }

  const hasDirect = hasDirectTcpDialHints([...nonLoopListen, ...peerSeeds]);
  const peerSpecificCircuits = out.filter(
    (h) => h.includes(recipientPeerId) && h.includes("/p2p-circuit/"),
  );
  // Synthetic circuits guess the peer reserved on a relay — skip when LAN/direct exists or we already have relay.lookup paths.
  if (!hasDirect) {
    const maxSynthetic = peerSpecificCircuits.length > 0 ? 1 : 3;
    out.push(
      ...buildSyntheticRelayCircuitHints(recipientPeerId, relayPool, maxSynthetic),
    );
  }

  const usable = dedupeDialHints(out.filter((a) => isUsableChatDialHint(a, recipientPeerId)));
  const ordered = prioritizeSameSubnetDialHints(
    prioritizeDirectLanDialHints(usable),
    input.localListenAddrs,
  );
  // Apply the address-class filter (wan-public by default for non-lan-fast
  // profiles). This must happen AFTER prioritization so the surviving order
  // reflects the prioritization, and BEFORE the circuit-prefer step so
  // `hasDirect` is computed from what's actually dialable. Without this,
  // a stale LAN address from a previous same-network session would block
  // the circuit fallback — the dial would burn 30s on the LAN address,
  // time out, and only then try the circuit, repeating every retry.
  const addressFilter = input.addressFilter ?? defaultAddressFilterForProfile(input.config);
  const filtered = filterDialHintsByAddressFilter(ordered, addressFilter);
  const hasSurvivingDirect = hasDirectTcpDialHints(filtered);
  const hasSurvivingCircuit = filtered.some((a) => a.includes("/p2p-circuit/"));
  // wan-default (and other non-lan-fast profiles): when both circuit and
  // LAN survive, prefer circuit first so installer RFC1918 does not burn
  // 30s before relay. lan-fast keeps LAN-first via prioritizeDirectLanDialHints.
  const lanFast = input.config?.discoveryProfile === "lan-fast";
  const preferCircuitHints = lanFast
    ? !hasSurvivingDirect
    : hasSurvivingCircuit || !hasSurvivingDirect;
  const forSend = preferCircuitHints
    ? prioritizeCircuitDialHints(filtered)
    : filtered;
  return filterDialHintsForOutboundSend(forSend, recipientPeerId, {
    preferCircuitHints,
  });
}

/**
 * Apply the {@link DialableAddrMode} filter to a list of multiaddrs. Used
 * at the end of `buildOutboundDialHints` to strip cached LAN/CGNAT addresses
 * that the current network can't actually dial. Kept as a thin wrapper
 * (not inlined) so the rule lives in one place — `filterDialableMultiaddrs`
 * in `node-service-wan.ts` is the single source of truth.
 */
function filterDialHintsByAddressFilter(
  addrs: readonly string[],
  mode: DialableAddrMode,
): string[] {
  if (mode === "all") return [...addrs];
  return filterDialableMultiaddrs([...addrs], mode);
}

/** Parse dotted IPv4 from a libp2p multiaddr string. */
export function parseIpv4FromMultiaddr(addr: string): string | null {
  const m = addr.match(/\/ip4\/(\d+\.\d+\.\d+\.\d+)\//);
  return m?.[1] ?? null;
}

/** True when two IPv4 addresses share the first `prefixOctets` (default /24). */
export function ipv4SameSubnet(a: string, b: string, prefixOctets = 3): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  if (pa.length !== 4 || pb.length !== 4 || pa.some((n) => !Number.isFinite(n)) || pb.some((n) => !Number.isFinite(n))) {
    return false;
  }
  for (let i = 0; i < prefixOctets; i++) {
    if (pa[i] !== pb[i]) return false;
  }
  return true;
}

/**
 * When both peers are on the same LAN subnet, try those TCP hints before other RFC1918 paths.
 */
export function prioritizeSameSubnetDialHints(
  hints: string[],
  localListenAddrs: readonly string[] | undefined,
): string[] {
  const localIps = (localListenAddrs ?? [])
    .map(parseIpv4FromMultiaddr)
    .filter((ip): ip is string => ip != null);
  if (localIps.length === 0) return hints;

  const sameSubnet: string[] = [];
  const otherLan: string[] = [];
  const rest: string[] = [];
  for (const h of hints) {
    const remoteIp = parseIpv4FromMultiaddr(h);
    if (remoteIp && localIps.some((lip) => ipv4SameSubnet(remoteIp, lip))) {
      sameSubnet.push(h);
    } else if (isPrivateLanTcpDialHint(h)) {
      otherLan.push(h);
    } else {
      rest.push(h);
    }
  }
  return [...sameSubnet, ...otherLan, ...rest];
}

/** Put same-LAN direct TCP hints first so Full-WAN profiles still dial locally when possible. */
export function prioritizeDirectLanDialHints(hints: string[]): string[] {
  const lan: string[] = [];
  const other: string[] = [];
  for (const h of hints) {
    if (isPrivateLanTcpDialHint(h)) {
      lan.push(h);
    } else {
      other.push(h);
    }
  }
  return [...lan, ...other];
}

/** Merge peer-directory / inbound-cache listen addrs, dropping ephemeral TCP snapshots. */
export function mergeDialablePeerListenAddrs(
  recipientPeerId: string,
  ...sources: (string[] | undefined)[]
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of sources) {
    for (const raw of src ?? []) {
      const a = raw.trim();
      if (!a || seen.has(a)) continue;
      if (!isUsableChatDialHint(a, recipientPeerId)) continue;
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** Prefer direct LAN/TCP dials when we have routable non-circuit hints; avoid jumping to relay on same network.
 *
 * **Cross-network safeguard:** If all direct TCP hints are private LAN (RFC1918 /
 * link-local / CGNAT), prefer circuits instead — the LAN addresses are unreachable
 * from other networks and would burn 30 s per attempt with no chance of success.
 */
export function shouldPreferCircuitDialHints(
  listenAddrs: string[] | undefined,
  dialHints: string[],
  recipientPeerId?: string,
): boolean {
  const peerId = recipientPeerId?.trim() ?? "";
  const dialableListen = peerId
    ? mergeDialablePeerListenAddrs(peerId, listenAddrs)
    : (listenAddrs ?? []).filter(
        (h) =>
          h.includes("/tcp/") &&
          !h.includes("/p2p-circuit/") &&
          !isLikelyInboundConnSnapshotDialHint(h) &&
          !isLoopbackOrUnspecifiedDialHint(h),
      );
  const directCandidates = [
    ...dialableListen,
    ...dialHints.filter((h) => h.includes("/tcp/") && !h.includes("/p2p-circuit/")),
  ];
  if (hasDirectTcpDialHints(directCandidates)) {
    // Only prefer direct when at least one hint is publicly routable.
    // Private-LAN-only hints are unreachable cross-network; preferring
    // circuits gives the relay fallback a chance to work.
    const hasPublicDirect = directCandidates.some(
      (h) => isPrivateLanTcpDialHint(h) ? false : !isPrivateOrUnroutableDialHint(h),
    );
    return !hasPublicDirect;
  }
  return dialHints.some((h) => h.includes("/p2p-circuit/"));
}

/**
 * Resolve circuit-vs-LAN dial preference for outbound send/warm.
 *
 * Explicit `true` / `false` from the caller wins — needed for `lan-fast` call
 * delivery, which must try RFC1918 first even though
 * {@link shouldPreferCircuitDialHints} would otherwise force circuits (WAN
 * safeguard for private-only hints).
 */
export function resolvePreferCircuitDialHints(
  explicit: boolean | undefined,
  listenAddrs: string[] | undefined,
  dialHints: string[],
  recipientPeerId?: string,
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return shouldPreferCircuitDialHints(listenAddrs, dialHints, recipientPeerId);
}
