/**
 * requestPeerProfile runtime (Step 48).
 *
 * Extracted from `node-service-impl.ts`. Public method
 * `requestPeerProfile` (28 lines) + private helper
 * `_requestPeerProfileOnce` (50 lines).
 *
 * The runtime:
 *   1. Dedupes concurrent in-flight requests for the same ownerId
 *   2. Honors a cooldown (returns cached profile if hit)
 *   3. Resolves the peer's transport via the peer directory or
 *      the live connection map
 *   4. Sends a `profile.request` envelope + handles the reply
 *   5. Caches the result + emits a `profile:updated` event
 */
import { derivePeerId } from "@envoymesh/identity";
import { handleInboundProfileSync } from "./profile-sync-inbound.js";
import { sendProfileRequest } from "./profile-sync-outbound.js";
import {
  pickBestLibp2pPeerDirectoryRecord,
  pickLibp2pFromConnectedPeers,
} from "./peer-transport-resolve.js";
import type {
  LocalPeerDirectoryStore,
  ContactOwnerKeyStore,
  PeerProfileCacheStore,
} from "@envoymesh/local-store";
import type { NodeProfile } from "@envoymesh/api";
import type { MeshLike } from "./request-peer-profile-types.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RequestPeerProfileContext {
  /** Local mesh (must be reachable). */
  requireMesh(): MeshLike;
  /** Local node profile (must be loaded). */
  requireProfile(): NodeProfile;
  /** Contact-owner-key store. */
  getContactOwnerKeyStore(): ContactOwnerKeyStore | undefined;
  /** Peer-profile cache store. */
  getPeerProfileCacheStore(): PeerProfileCacheStore | undefined;
  /** Peer directory store. */
  getPeerDirectoryStore(): LocalPeerDirectoryStore;
  /** Resolve a peer's transport (transportPeerId + recipientEnvelopePeerId). */
  resolvePeerTransportForOwner(ownerId: string): Promise<{
    recipientEnvelopePeerId: string;
  }>;
  /** Resolve the libp2p peer for a bonded owner. */
  resolveLibp2pPeerForBondOwner(ownerId: string): Promise<{
    transportPeerId: string;
    listenAddrs: string[];
  } | undefined>;
  /** Compute dial hints for an outbound chat. */
  dialHintsForChat(peerId: string, listenAddrs?: string[]): Promise<string[]>;
  /** Emit a lifecycle event. */
  emit(event: string, payload: unknown): void;
  /** Cooldown (ms) for re-requesting the same owner. */
  getProfileRequestCooldownMs(): number;
  /** In-flight dedupe map (mutable). */
  getInFlightMap(): Map<string, Promise<{ ok: boolean; reason?: string }>>;
  /** Last-fire timestamp map (mutable). */
  getLastAtMap(): Map<string, number>;
}

export async function requestPeerProfileViaRuntime(
  ctx: RequestPeerProfileContext,
  ownerId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const key = ownerId.trim();
  if (!key) {
    return { ok: false, reason: "owner id required" };
  }
  const inflight = ctx.getInFlightMap().get(key);
  if (inflight) {
    return inflight;
  }
  const lastAt = ctx.getLastAtMap().get(key) ?? 0;
  if (Date.now() - lastAt < ctx.getProfileRequestCooldownMs()) {
    const cache = ctx.getPeerProfileCacheStore();
    const cached = cache ? await cache.get(key) : undefined;
    if (cached) {
      return { ok: true };
    }
  }
  const run = requestPeerProfileOnceViaRuntime(ctx, key);
  ctx.getInFlightMap().set(key, run);
  try {
    return await run;
  } finally {
    ctx.getInFlightMap().delete(key);
    ctx.getLastAtMap().set(key, Date.now());
  }
}

async function requestPeerProfileOnceViaRuntime(
  ctx: RequestPeerProfileContext,
  ownerId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const mesh = ctx.requireMesh();
  const profile = ctx.requireProfile();
  const keyStore = ctx.getContactOwnerKeyStore();
  const cache = ctx.getPeerProfileCacheStore();
  if (!keyStore || !cache) {
    return { ok: false, reason: "profile cache not initialized" };
  }
  try {
    const records = await ctx.getPeerDirectoryStore().listPeerRecords();
    const connectedPeerIds = mesh.getConnectedPeerIds();
    const liveConnected = pickLibp2pFromConnectedPeers(records, ownerId, connectedPeerIds);
    const resolved = liveConnected
      ? { transportPeerId: liveConnected.peerId, listenAddrs: liveConnected.listenAddrs }
      : await ctx.resolveLibp2pPeerForBondOwner(ownerId);
    if (!resolved) {
      return { ok: false, reason: "peer not in directory (no libp2p route)" };
    }
    const { transportPeerId, listenAddrs } = resolved;
    if (!liveConnected && !mesh.getPeerConnectionInfo(transportPeerId).connected) {
      return { ok: false, reason: "peer not connected" };
    }
    let envelopeRecipientPeerId: string | undefined;
    try {
      envelopeRecipientPeerId = (await ctx.resolvePeerTransportForOwner(ownerId)).recipientEnvelopePeerId;
    } catch {
      const records = await ctx.getPeerDirectoryStore().listPeerRecords();
      const rec = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
      if (rec?.devicePublicKeyPem) {
        envelopeRecipientPeerId = derivePeerId(rec.devicePublicKeyPem);
      }
    }
    const reply = await sendProfileRequest({
      mesh: mesh as any,
      profile,
      transportPeerId,
      envelopeRecipientPeerId: envelopeRecipientPeerId ?? transportPeerId,
      listenAddrs,
      dialHintsFor: (peerId: string, addrs?: string[]) =>
        ctx.dialHintsForChat(peerId, addrs ?? listenAddrs),
    } as any);
    const cached = await handleInboundProfileSync({
      envelope: reply,
      contactOwnerKeyStore: keyStore,
      peerProfileCache: cache,
    });
    if (cached.handled) {
      ctx.emit("profile:updated", { ownerId: cached.ownerId });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}