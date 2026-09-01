/**
 * Phase 63B — outbound `market.announce` to direct (+ referred) bonds.
 */

import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createMarketAnnouncePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type MarketCard,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  type OutboundDeliverMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

type MarketMesh = OutboundDeliverMesh &
  Pick<EnvoyMesh, "mergePeerStoreDialHints" | "tagContactForPersistentReachability">;

export type MarketAnnounceBond = {
  peerOwnerId: string;
  level: string;
};

export async function buildSignedMarketAnnounceEnvelope(input: {
  profile: NodeProfile;
  action: "upsert" | "withdraw";
  card: MarketCard;
  recipientPeerId?: string;
}): Promise<EnvoyEnvelope> {
  const payload = createMarketAnnouncePayload({
    action: input.action,
    card: input.card,
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: "market.announce",
    payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

export async function sendMarketAnnounceToBonds(input: {
  mesh: MarketMesh;
  profile: NodeProfile;
  action: "upsert" | "withdraw";
  card: MarketCard;
  bonds: MarketAnnounceBond[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  tagReachability?: (peerId: string) => void;
}): Promise<{ attempted: number; sent: number }> {
  // MKT-B: fan out to direct (+ referred) bonds only.
  const recipients = input.bonds.filter(
    (b) =>
      (b.level === "direct" || b.level === "referred") &&
      b.peerOwnerId.trim() &&
      b.peerOwnerId !== input.profile.owner.ownerId,
  );

  let sent = 0;
  for (const bond of recipients) {
    try {
      const resolved = await input.resolveLibp2pPeer(bond.peerOwnerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) continue;

      let dialHints: string[];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch {
        continue;
      }

      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch(() => {});
      }
      input.tagReachability?.(resolved.peerId);

      const envelope = await buildSignedMarketAnnounceEnvelope({
        profile: input.profile,
        action: input.action,
        card: input.card,
        recipientPeerId: resolved.peerId,
      });

      const result = await sendEnvelopeWithRetry({
        mesh: input.mesh,
        transportPeerId: resolved.peerId,
        envelope,
        dialHints,
        peerListenAddrs: resolved.listenAddrs,
        rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
      if (result.delivered) sent += 1;
    } catch (err) {
      console.warn(
        `[market.announce] miss ${bond.peerOwnerId.slice(0, 16)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { attempted: recipients.length, sent };
}
