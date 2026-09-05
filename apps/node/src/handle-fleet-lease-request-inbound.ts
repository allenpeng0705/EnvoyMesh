/**
 * Phase 66B — inbound `agent.worker.lease.request` from a bonded peer:
 * enable Join if off, start lease publish, then republish now.
 * Strangers (unbonded / public) are ignored.
 */

export type FulfillFleetLeaseRequestBond = {
  peerOwnerId: string;
  level: string;
  libp2pPeerId?: string;
};

export type FulfillFleetLeaseRequestDeps = {
  requesterPeerId: string;
  requesterOwnerId?: string;
  getBonds(): Promise<FulfillFleetLeaseRequestBond[]>;
  resolveOwnerForPeer?(peerId: string): Promise<string | undefined>;
  getJoinEnabled(): Promise<boolean>;
  enableJoin(): Promise<void>;
  ensureLeaseBroadcaster(): Promise<{ publishNow: () => Promise<void> } | undefined>;
};

export async function fulfillInboundFleetLeaseRequest(
  deps: FulfillFleetLeaseRequestDeps,
): Promise<{ ok: boolean; reason?: string }> {
  const bonds = await deps.getBonds();
  let ownerId = deps.requesterOwnerId;
  if (!ownerId && deps.resolveOwnerForPeer) {
    ownerId = await deps.resolveOwnerForPeer(deps.requesterPeerId);
  }
  if (!ownerId) {
    ownerId = bonds.find((b) => b.libp2pPeerId === deps.requesterPeerId)?.peerOwnerId;
  }
  if (!ownerId) {
    return { ok: false, reason: "requester_owner_unknown" };
  }
  const bond = bonds.find((b) => b.peerOwnerId === ownerId);
  if (!bond || bond.level === "blocked" || bond.level === "public") {
    return { ok: false, reason: "requester_not_trusted" };
  }
  if (bond.level !== "direct" && bond.level !== "referred") {
    return { ok: false, reason: "requester_not_trusted" };
  }

  const joinOn = await deps.getJoinEnabled();
  if (!joinOn) {
    await deps.enableJoin();
  }
  const broadcaster = await deps.ensureLeaseBroadcaster();
  await broadcaster?.publishNow();
  return { ok: true };
}
