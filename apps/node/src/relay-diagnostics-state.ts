export interface RelayCheckinAttempt {
  target: string;
  ok: boolean;
  error?: string;
}

export interface RelayDiagnosticsSnapshot {
  at: string;
  source: "node-service" | "cli";
  targets: string[];
  checkinResults: RelayCheckinAttempt[];
  lookup?: {
    ok: boolean;
    peerCount: number;
    circuitAddrsStored: number;
    error?: string;
  };
}

let lastSnapshot: RelayDiagnosticsSnapshot | undefined;

export function recordRelayCheckinCycle(input: {
  source: RelayDiagnosticsSnapshot["source"];
  targets: string[];
  results: RelayCheckinAttempt[];
}): void {
  lastSnapshot = {
    at: new Date().toISOString(),
    source: input.source,
    targets: [...input.targets],
    checkinResults: [...input.results],
    lookup: lastSnapshot?.lookup,
  };
}

export function recordRelayLookupResult(input: {
  source: RelayDiagnosticsSnapshot["source"];
  targets: string[];
  ok: boolean;
  peerCount: number;
  circuitAddrsStored: number;
  error?: string;
}): void {
  const prev = lastSnapshot;
  lastSnapshot = {
    at: new Date().toISOString(),
    source: input.source,
    targets: input.targets.length > 0 ? [...input.targets] : (prev?.targets ?? []),
    checkinResults: prev?.checkinResults ?? [],
    lookup: {
      ok: input.ok,
      peerCount: input.peerCount,
      circuitAddrsStored: input.circuitAddrsStored,
      ...(input.error ? { error: input.error } : {}),
    },
  };
}

export function getRelayDiagnosticsSnapshot(): RelayDiagnosticsSnapshot | undefined {
  return lastSnapshot;
}

export function resetRelayDiagnosticsSnapshot(): void {
  lastSnapshot = undefined;
}
