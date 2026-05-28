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

export function resetMeshPeerRoutingForTests(): void {
  ownerToPeer.clear();
}
