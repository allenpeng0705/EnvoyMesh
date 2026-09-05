/**
 * Phase 67C — multi-home summary for Team job detail (Assigner vs workers).
 */

export type ChainHomesSummary = {
  assignerPeerId?: string;
  workerPeerIds: string[];
  /** True when this home is the creator watching a remote Assigner. */
  watchingRemoteAssigner: boolean;
  localRole?: "creator" | "assigner";
};

export function summarizeChainHomes(input: {
  remoteOwnership?: {
    assignerPeerId?: string;
    localRole?: "creator" | "assigner";
  };
  steps?: Array<{ workerPeerId?: string }>;
}): ChainHomesSummary {
  const assignerPeerId = input.remoteOwnership?.assignerPeerId?.trim() || undefined;
  const workers = new Set<string>();
  for (const step of input.steps ?? []) {
    const id = step.workerPeerId?.trim();
    if (!id) continue;
    if (assignerPeerId && id === assignerPeerId) continue;
    workers.add(id);
  }
  const localRole = input.remoteOwnership?.localRole;
  return {
    ...(assignerPeerId ? { assignerPeerId } : {}),
    workerPeerIds: [...workers],
    watchingRemoteAssigner: localRole === "creator" && Boolean(assignerPeerId),
    ...(localRole ? { localRole } : {}),
  };
}

export function shortChainPeerId(peerId: string, max = 16): string {
  if (peerId.length <= max) return peerId;
  return `${peerId.slice(0, max - 1)}…`;
}
