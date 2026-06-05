const ownerToPeer = new Map<string, string>();

export function rememberMeshPeer(ownerId: string, peerId: string): void {
  const owner = ownerId.trim();
  const peer = peerId.trim();
  if (!owner || !peer) {
    return;
  }
  ownerToPeer.set(owner, peer);
}

export function resolveMeshReplyPeerId(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("envoy_")) {
    return trimmed;
  }
  return ownerToPeer.get(trimmed) ?? trimmed;
}

/** Normalize outbound bridge `to` for sync replies and proactive cron/heartbeat delivery. */
export function resolveEnvoymeshBridgeSendTarget(to: string): string {
  const trimmed = to.replace(/^envoymesh:/i, "").trim();
  const resolved = resolveMeshReplyPeerId(trimmed);
  if (resolved.startsWith("envoy_")) {
    return resolved;
  }
  if (trimmed.startsWith("envoy:owner:")) {
    return trimmed;
  }
  if (resolved.startsWith("envoy:owner:")) {
    return resolved;
  }
  return resolved;
}

export function canSendEnvoymeshBridgeMessage(target: string, correlationId?: string): boolean {
  if (correlationId?.trim()) {
    return true;
  }
  const bridgeTo = resolveEnvoymeshBridgeSendTarget(target);
  return bridgeTo.startsWith("envoy_") || bridgeTo.startsWith("envoy:owner:");
}

export function resetMeshPeerRoutingForTests(): void {
  ownerToPeer.clear();
}
