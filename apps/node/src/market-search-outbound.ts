/**
 * Phase 63C — outbound `market.search` fan-out (bonds + known/connected peers + DHT).
 * Uses expect-reply so sellers can answer on the same stream (`replyWithEnvelope`).
 * Peers are queried in parallel (bounded concurrency) so cold Browse returns sooner.
 */

import { derivePeerId, signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import {
  createMarketSearchPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendExpectReplyWithRetry,
  type OutboundExpectReplyMesh,
} from "./chat-outbound-deliver.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

type MarketMesh = OutboundExpectReplyMesh &
  Pick<
    EnvoyMesh,
    "mergePeerStoreDialHints" | "tagContactForPersistentReachability" | "getConnectedPeerIds"
  >;

export type MarketSearchTarget = {
  peerId: string;
  listenAddrs?: string[];
};

const DEFAULT_CONCURRENCY = 6;

export async function buildSignedMarketSearchEnvelope(input: {
  profile: NodeProfile;
  query: string;
  category?: import("@envoymesh/protocol").MarketCard["category"];
  limit?: number;
  recipientPeerId?: string;
}): Promise<EnvoyEnvelope> {
  const payload = createMarketSearchPayload({
    query: input.query,
    category: input.category,
    limit: input.limit ?? 10,
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: "market.search",
    payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function sendMarketSearchToPeers(input: {
  mesh: MarketMesh;
  profile: NodeProfile;
  query: string;
  category?: import("@envoymesh/protocol").MarketCard["category"];
  limit?: number;
  targets: MarketSearchTarget[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  tagReachability?: (peerId: string) => void;
  /** Cap concurrent fan-out. */
  maxPeers?: number;
  /** Parallel peer queries (default 6). */
  concurrency?: number;
  /** Called for each verified `market.search.result` reply. */
  onResult?: (reply: EnvoyEnvelope, remotePeerId: string) => Promise<void>;
}): Promise<{ attempted: number; sent: number; replies: number }> {
  const selfPeerId = derivePeerId(input.profile.device.publicKeyPem);
  const seen = new Set<string>();
  const targets: MarketSearchTarget[] = [];
  for (const t of input.targets) {
    const id = t.peerId?.trim();
    if (!id || !isLibp2pPeerId(id) || id === selfPeerId || seen.has(id)) continue;
    seen.add(id);
    targets.push(t);
    if (targets.length >= (input.maxPeers ?? 24)) break;
  }

  const concurrency = Math.max(1, input.concurrency ?? DEFAULT_CONCURRENCY);
  const outcomes = await mapPool(targets, concurrency, async (target) => {
    try {
      let dialHints: string[];
      try {
        dialHints = await input.dialHintsFor(target.peerId, target.listenAddrs);
      } catch {
        return { sent: false, reply: false };
      }
      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(target.peerId, dialHints),
        ).catch(() => {});
      }
      input.tagReachability?.(target.peerId);

      const envelope = await buildSignedMarketSearchEnvelope({
        profile: input.profile,
        query: input.query,
        category: input.category,
        limit: input.limit,
        recipientPeerId: target.peerId,
      });
      const reply = await sendExpectReplyWithRetry({
        mesh: input.mesh,
        transportPeerId: target.peerId,
        envelope,
        dialHints,
        peerListenAddrs: target.listenAddrs,
        timeoutMs: 8_000,
        rebuildDialHints: () => input.dialHintsFor(target.peerId, target.listenAddrs),
        maxAttempts: 2,
      });
      if (!verifyInboundEnvelope(reply) || reply.intent !== "market.search.result") {
        return { sent: true, reply: false };
      }
      if (input.onResult) {
        await input.onResult(reply, target.peerId);
      }
      return { sent: true, reply: true };
    } catch (err) {
      console.warn(
        `[market.search] miss ${target.peerId.slice(0, 16)}…:`,
        err instanceof Error ? err.message : err,
      );
      return { sent: false, reply: false };
    }
  });

  let sent = 0;
  let replies = 0;
  for (const o of outcomes) {
    if (o.sent) sent += 1;
    if (o.reply) replies += 1;
  }
  return { attempted: targets.length, sent, replies };
}
