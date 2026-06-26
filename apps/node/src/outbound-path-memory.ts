import { prioritizeDirectLanDialHints } from "./outbound-dial-hints.js";

export type StoredPathKind = "direct" | "relay";

type PathRecord = {
  kind: StoredPathKind;
  sampleHint?: string;
  updatedAt: number;
};

const byPeer = new Map<string, PathRecord>();

/** Remember a successful libp2p path for future dial-hint ordering. */
export function recordSuccessfulOutboundPath(
  transportPeerId: string,
  kind: StoredPathKind,
  sampleHint?: string,
  now = Date.now(),
): void {
  byPeer.set(transportPeerId, { kind, sampleHint, updatedAt: now });
}

export function getStoredOutboundPath(transportPeerId: string): PathRecord | undefined {
  return byPeer.get(transportPeerId);
}

/** Prefer last-known-good hints (direct before relay) without dropping unknown hints. */
export function prioritizeHintsWithPathMemory(
  transportPeerId: string,
  hints: readonly string[],
): string[] {
  const stored = byPeer.get(transportPeerId);
  const base = prioritizeDirectLanDialHints([...hints]);
  if (!stored?.sampleHint) {
    return base;
  }
  const sample = stored.sampleHint;
  const rest = base.filter((h) => h !== sample);
  if (stored.kind === "direct") {
    return [sample, ...rest];
  }
  return [...rest, sample];
}

/** Test helper */
export function resetOutboundPathMemoryForTests(): void {
  byPeer.clear();
}
