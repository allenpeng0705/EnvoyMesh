import type { BondRecord } from "./node-service.js";

export function resolveBondTarget(bonds: BondRecord[], hint: string | undefined): BondRecord | undefined {
  if (!hint?.trim()) return undefined;
  const h = hint.trim().toLowerCase();
  return (
    bonds.find((b) => b.peerOwnerId === hint) ??
    bonds.find((b) => b.displayName?.toLowerCase() === h) ??
    bonds.find((b) => b.displayName?.toLowerCase().includes(h)) ??
    bonds.find((b) => b.peerOwnerId.toLowerCase().includes(h))
  );
}
