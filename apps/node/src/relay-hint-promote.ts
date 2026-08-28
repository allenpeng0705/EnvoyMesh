/**
 * Phase 46E.3 — store preset-vouched relay hint multiaddrs for active-set selection.
 *
 * Only hints from community preset peer IDs (cn-relay / us-relay) are accepted.
 */
import {
  isCommunityPresetRelayPeerId,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";
import type { RelayHint } from "@envoymesh/protocol";

const MAX_VOUCHED = 16;

export interface VouchedRelayHintStore {
  noteFromPreset(sourcePeerId: string | null | undefined, hints: readonly RelayHint[]): string[];
  listAddrs(): string[];
  clear(): void;
}

export function createVouchedRelayHintStore(): VouchedRelayHintStore {
  const addrs = new Map<string, number>(); // addr → lastSeenMs

  function noteFromPreset(
    sourcePeerId: string | null | undefined,
    hints: readonly RelayHint[],
  ): string[] {
    if (!sourcePeerId || !isCommunityPresetRelayPeerId(sourcePeerId)) {
      return listAddrs();
    }
    const now = Date.now();
    for (const hint of hints) {
      for (const raw of hint.multiaddrs ?? []) {
        const t = raw.trim();
        if (!t || !t.includes("/p2p/") || t.includes("/p2p-circuit/")) continue;
        if (t.includes("bootstrap.libp2p.io")) continue;
        const pid = peerIdFromBootstrapMultiaddr(t);
        if (pid && isCommunityPresetRelayPeerId(pid)) continue; // already hubs
        addrs.set(t, now);
      }
    }
    // Cap by recency
    if (addrs.size > MAX_VOUCHED) {
      const sorted = [...addrs.entries()].sort((a, b) => b[1] - a[1]);
      addrs.clear();
      for (const [a, ts] of sorted.slice(0, MAX_VOUCHED)) {
        addrs.set(a, ts);
      }
    }
    return listAddrs();
  }

  function listAddrs(): string[] {
    return [...addrs.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([a]) => a);
  }

  function clear(): void {
    addrs.clear();
  }

  return { noteFromPreset, listAddrs, clear };
}
