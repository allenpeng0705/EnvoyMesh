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

/** Put relay circuit hints first — helps cold cross-NAT dials. */
export function prioritizeCircuitDialHints(hints: string[]): string[] {
  const circuits = hints.filter((h) => h.includes("/p2p-circuit/"));
  const direct = hints.filter((h) => !h.includes("/p2p-circuit/"));
  return [...circuits, ...direct];
}
