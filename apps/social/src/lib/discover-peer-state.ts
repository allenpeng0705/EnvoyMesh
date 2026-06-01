import type { BondRecord } from "@envoymesh/api";

const OUTBOUND_HELLO_KEY = "envoymesh:outbound-hellos";

export type PeerHelloUiState = "none" | "sent" | "connected";

export function loadOutboundHellos(): Set<string> {
  try {
    const raw = sessionStorage.getItem(OUTBOUND_HELLO_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function markOutboundHello(targetId: string): void {
  const key = targetId.trim();
  if (!key) return;
  const next = loadOutboundHellos();
  next.add(key);
  sessionStorage.setItem(OUTBOUND_HELLO_KEY, JSON.stringify([...next]));
}

export function resolvePeerHelloState(
  ownerId: string,
  nodeId: string,
  bonds: readonly BondRecord[],
  outbound: ReadonlySet<string>,
): PeerHelloUiState {
  if (bonds.some((b) => b.peerOwnerId === ownerId || b.libp2pPeerId === nodeId || b.libp2pPeerId === ownerId)) {
    return "connected";
  }
  if (outbound.has(ownerId) || outbound.has(nodeId)) {
    return "sent";
  }
  return "none";
}
