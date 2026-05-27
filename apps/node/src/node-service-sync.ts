import type { SendSyncStateUpdateParams, SendSyncStateUpdateResult } from "@envoymesh/api";
import type { NodeProfile } from "@envoymesh/api";
import { createSyncStatePayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { EnvoyMesh } from "@envoymesh/network";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";

export interface NodeSyncRuntimeDeps {
  requireProfile(): NodeProfile;
  requireMesh(): EnvoyMesh;
  peerDirectoryStore: LocalPeerDirectoryStore;
}

export async function sendSyncStateUpdateViaMesh(
  deps: NodeSyncRuntimeDeps,
  params: SendSyncStateUpdateParams,
): Promise<SendSyncStateUpdateResult> {
  const profile = deps.requireProfile();
  const mesh = deps.requireMesh();
  const scope = params.scope.trim();
  const updateBase64 = params.updateBase64.trim();
  if (!scope || !updateBase64) {
    return { ok: false, recipients: 0, error: "scope and updateBase64 are required" };
  }

  const payload = createSyncStatePayload({
    scope,
    updateBase64,
    senderOwnerId: profile.owner.ownerId,
  });

  const targets: string[] = [];
  if (params.targetPeerId?.trim()) {
    targets.push(params.targetPeerId.trim());
  } else {
    const selfPeerId = mesh.peerId;
    const peers = await deps.peerDirectoryStore.listPeerRecords();
    for (const row of peers) {
      if (row.ownerId === profile.owner.ownerId && row.peerId !== selfPeerId) {
        targets.push(row.peerId);
      }
    }
  }

  if (targets.length === 0) {
    return { ok: true, recipients: 0 };
  }

  let sent = 0;
  for (const peerId of targets) {
    try {
      const unsigned = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: peerId,
        recipientRole: "human",
        intent: "sync.state",
        payload,
      });
      const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      await mesh.send(peerId, envelope);
      sent += 1;
    } catch (error) {
      console.warn(
        `[sendSyncStateUpdate] send to ${peerId} failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { ok: sent > 0, recipients: sent };
}
