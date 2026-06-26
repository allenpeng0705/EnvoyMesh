import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createSystemSignalPayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import { resolveEmpSupportedCapabilities } from "@envoymesh/api";
import {
  filterUsableOutboundPeerDialHints,
  isLoopbackOrUnspecifiedDialHint,
} from "@envoymesh/network";
import { sendEnvelopeWithRetry, type OutboundDeliverMesh } from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

/** Our dialable listen multiaddrs for bonded contacts (LAN/WAN direct, no relay circuits). */
export function ownListenAddrsForPresenceSignal(
  meshPeerId: string,
  multiaddrs: readonly string[],
): string[] {
  const peerId = meshPeerId.trim();
  return filterUsableOutboundPeerDialHints(
    multiaddrs
      .map((a) => a.trim())
      .filter(
        (a) =>
          a &&
          !a.includes("/p2p-circuit/") &&
          !isLoopbackOrUnspecifiedDialHint(a) &&
          a.includes(`/p2p/${peerId}`),
      ),
    peerId,
  );
}

export async function broadcastPresenceSignalToBonds(input: {
  mesh: OutboundDeliverMesh;
  meshPeerId: string;
  profile: NodeProfile;
  listenAddrs: readonly string[];
  bondOwnerIds: string[];
  config?: PersistedNodeConfig;
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<{ sent: number; skipped: number }> {
  const meshPeerId = input.meshPeerId.trim();
  const listenAddrs = ownListenAddrsForPresenceSignal(meshPeerId, input.listenAddrs);
  if (listenAddrs.length === 0 || input.bondOwnerIds.length === 0) {
    return { sent: 0, skipped: input.bondOwnerIds.length };
  }

  const payload = createSystemSignalPayload({
    deviceCertificate: input.profile.deviceCertificate,
    ownerPublicKeyPem: input.profile.owner.publicKeyPem,
    listenAddrs,
    supportedCapabilities: resolveEmpSupportedCapabilities({
      socialProxyEnabled: input.config?.socialProxyEnabled,
      documentAcquisitionEnabled: input.config?.documentAcquisitionEnabled,
      capabilityProviderEnabled: input.config?.capabilityProviderEnabled,
    }),
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "system",
    recipientRole: "human",
    intent: "system.signal",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);

  let sent = 0;
  let skipped = 0;
  for (const ownerId of input.bondOwnerIds) {
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
        skipped += 1;
        continue;
      }
      const dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      await sendEnvelopeWithRetry({
        mesh: input.mesh,
        transportPeerId: resolved.peerId,
        envelope: { ...envelope, recipientPeerId: resolved.peerId },
        dialHints,
        peerListenAddrs: resolved.listenAddrs,
        rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
      sent += 1;
    } catch (err) {
      skipped += 1;
      console.warn(
        `[presence] signal to ${ownerId.slice(0, 20)}… failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (sent > 0) {
    console.log(
      `[presence] announced ${listenAddrs.length} listen addr(s) to ${sent} bonded contact(s)`,
    );
  }
  return { sent, skipped };
}
