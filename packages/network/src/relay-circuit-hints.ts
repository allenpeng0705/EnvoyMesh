/** Build `/p2p-circuit/p2p/<target>` multiaddrs from relay bootstrap bases. */

export function relayCircuitToPeer(relayBaseMultiaddr: string, targetPeerId: string): string | undefined {
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

export function dedupeDialHintStrings(addrs: string[]): string[] {
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

export function buildSyntheticRelayCircuitHints(
  targetPeerId: string,
  relayBases: string[],
  maxSynthetic: number,
): string[] {
  const out: string[] = [];
  let synthetic = 0;
  for (const base of dedupeDialHintStrings(relayBases)) {
    if (synthetic >= maxSynthetic) {
      break;
    }
    const circuit = relayCircuitToPeer(base, targetPeerId);
    if (circuit) {
      out.push(circuit);
      synthetic++;
    }
  }
  return out;
}

/** True when a `/p2p-circuit/` hop is RFC1918 / link-local / loopback (not WAN-dialable). */
export function isPrivateRelayHopCircuitDialHint(addr: string): boolean {
  const a = addr.trim();
  if (!a.includes("/p2p-circuit/")) return false;
  if (/\/ip4\/10\.\d+\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/192\.168\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/169\.254\.\d+\.\d+\//.test(a)) return true;
  if (/\/ip4\/127\.\d+\.\d+\.\d+\//.test(a)) return true;
  return false;
}

/** Put relay circuit hints first — public hops before private-hop circuits. */
export function prioritizeCircuitDialHints(hints: string[]): string[] {
  const publicCircuits = hints.filter(
    (h) => h.includes("/p2p-circuit/") && !isPrivateRelayHopCircuitDialHint(h),
  );
  const privateCircuits = hints.filter((h) => isPrivateRelayHopCircuitDialHint(h));
  const direct = hints.filter((h) => !h.includes("/p2p-circuit/"));
  return [...publicCircuits, ...direct, ...privateCircuits];
}
