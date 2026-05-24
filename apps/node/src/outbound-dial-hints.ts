/**
 * Builds multiaddrs used as {@link EnvoyMesh}'s outbound `dialHints`.
 * Drops loopback/non-routable listen addrs recorded for the *remote* peer (they dial localhost on this machine),
 * merges discovery seeds + relay circuit paths — same ingredients as outbound chat.
 */
import {
  isPublicLibp2pBootstrapMultiaddr,
  isUsableOutboundPeerDialHint,
} from "@envoymesh/network";
import { expandCircuitDialCandidates } from "./discovery-inbound.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import { createDefaultPersistedNodeConfig, type PersistedNodeConfig } from "./node-config-store.js";
import { DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR, DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS } from "@envoymesh/api";

function relayCircuitToPeer(relayBaseMultiaddr: string, targetPeerId: string): string | undefined {
  const s = relayBaseMultiaddr.trim().replace(/\/$/, "");
  if (!s || !s.includes("/p2p/") || s.includes("/p2p-circuit/")) {
    return undefined;
  }
  const m = s.match(/\/p2p\/([^/]+)$/);
  const lastPeer = m?.[1];
  if (!lastPeer || lastPeer === targetPeerId) {
    return undefined;
  }
  return `${s}/p2p-circuit/p2p/${targetPeerId}`;
}

function dedupeDialHints(addrs: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const a of addrs) {
    const t = a.trim();
    if (!t || seen.has(t)) {
      continue;
    }
    seen.add(t);
    ordered.push(t);
  }
  return ordered;
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
  for (const addr of seeds) {
    if (!addr.includes(recipientPeerId)) {
      continue;
    }
    out.push(addr);
    if (addr.includes("/p2p-circuit/")) {
      out.push(...expandCircuitDialCandidates(addr, relayPool));
    }
  }

  let synthetic = 0;
  const maxSynthetic = 32;
  for (const base of relayPool) {
    if (synthetic >= maxSynthetic) {
      break;
    }
    const c = relayCircuitToPeer(base, recipientPeerId);
    if (c) {
      out.push(c);
      synthetic++;
    }
  }

  return dedupeDialHints(out.filter((a) => isUsableChatDialHint(a, recipientPeerId)));
}
