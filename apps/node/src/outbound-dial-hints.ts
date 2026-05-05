/**
 * Builds multiaddrs used as {@link EnvoyMesh}'s outbound `dialHints`.
 * Drops loopback/non-routable listen addrs recorded for the *remote* peer (they dial localhost on this machine),
 * merges discovery seeds + relay circuit paths — same ingredients as outbound chat.
 */
import { isLoopbackOrUnspecifiedDialHint } from "@envoymesh/network";
import { expandCircuitDialCandidates } from "./discovery-inbound.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

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

export async function buildOutboundDialHints(input: {
  recipientPeerId: string;
  peerListenAddrs: string[] | undefined;
  discoverySeedStore: DiscoverySeedStore | undefined;
  config: PersistedNodeConfig | undefined;
  cliBootstrapPeers: readonly string[];
}): Promise<string[]> {
  const raw = (input.peerListenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
  /** Never dial the remote peer's loopback IP from our machine — it hits 127.0.0.1 here and fails (ECONNREFUSED). */
  const nonLoopListen = raw.filter((a) => !isLoopbackOrUnspecifiedDialHint(a));

  let out = [...nonLoopListen];
  const store = input.discoverySeedStore;
  if (!store) {
    return dedupeDialHints(out);
  }

  const seeds = await store.listSeedAddrs();
  const envBootstrap =
    process.env.ENVOYMESH_BOOTSTRAP_PEERS?.split(/[,]+/)
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  const extraRelays: string[] = [
    ...input.cliBootstrapPeers,
    ...envBootstrap,
    ...(input.config?.bootstrapPeers ?? []),
    ...(input.config?.configuredRelays?.filter((r) => r.enabled && r.addr).map((r) => r.addr) ?? []),
  ];

  const cfgPresets = input.config?.bootstrapPresets ?? [];
  if (cfgPresets.includes("cn-relay")) {
    extraRelays.push("/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo");
  }

  const relayPool = dedupeDialHints([...seeds, ...extraRelays]);

  const recipientPeerId = input.recipientPeerId.trim();
  out = [...nonLoopListen];
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

  return dedupeDialHints(out);
}
