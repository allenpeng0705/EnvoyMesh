/**
 * Builds multiaddrs used as {@link EnvoyMesh}'s outbound `dialHints`.
 * Drops loopback/non-routable listen addrs recorded for the *remote* peer (they dial localhost on this machine),
 * merges discovery seeds + relay circuit paths — same ingredients as outbound chat.
 */
import {
  isLikelyInboundConnSnapshotDialHint,
  isLoopbackOrUnspecifiedDialHint,
  isPrivateLanTcpDialHint,
  isPublicLibp2pBootstrapMultiaddr,
  isUsableOutboundPeerDialHint,
  buildSyntheticRelayCircuitHints,
  dedupeDialHintStrings,
  hasDirectTcpDialHints,
  filterDialHintsForOutboundSend,
} from "@envoymesh/network";
import { expandCircuitDialCandidates } from "./discovery-inbound.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { createDefaultPersistedNodeConfig, type PersistedNodeConfig } from "./node-config-store.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR, DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS } from "@envoymesh/api";

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
  return dedupeDialHints(bases);
}

export async function buildOutboundDialHints(input: {
  recipientPeerId: string;
  peerListenAddrs: string[] | undefined;
  discoverySeedStore: DiscoverySeedStore | undefined;
  config: PersistedNodeConfig | undefined;
  profileDir?: string;
  /** Local node listen multiaddrs — same-subnet peers dial first. */
  localListenAddrs?: string[] | undefined;
}): Promise<string[]> {
  const recipientPeerId = input.recipientPeerId.trim();
  const raw = (input.peerListenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
  /** Never dial the remote peer's loopback or local docker-bridge IP from our machine. */
  const nonLoopListen = raw.filter((a) => isUsableChatDialHint(a, recipientPeerId));

  const store = input.discoverySeedStore;
  if (!store) {
    return dedupeDialHints(nonLoopListen);
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
  return filterDialHintsForOutboundSend(ordered, recipientPeerId, {
    preferCircuitHints: !hasDirect,
  });
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

/** Prefer direct LAN/TCP dials when we have routable non-circuit hints; avoid jumping to relay on same network. */
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
    return false;
  }
  return dialHints.some((h) => h.includes("/p2p-circuit/"));
}
