/**
 * Outbound messaging core — peer transport resolve, dial hints, deliver, warm, sendChat.
 *
 * Extracted from `node-service-impl.ts`. State (transport cache, mesh handles)
 * stays on the class and is accessed through OutboundMessagingContext.
 */
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type {
  AiIdentity,
  ChatMessage,
  NodeConfig,
  NodeProfile,
  PeerConnectionInfo,
  SendChatParams,
  SendChatResult,
  WarmContactConnectionOptions,
} from "@envoymesh/api";
import {
  applyAiIdentityForIdentity,
  chatMessagePayloadDeviceFields,
  stripModelThinking,
} from "@envoymesh/api";
import type { BridgeIdentity } from "./bridge/pipe.js";
import { recordMeshActivity } from "./connectivity-runtime.js";
import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import {
  ENVOY_CHAT_PROTOCOL,
  isPrivateLanTcpDialHint,
  type EnvoyMesh,
} from "@envoymesh/network";
import {
  deliverCallEnvelopeWithRetry,
  deliverChatEnvelopeWithRetry,
  deliverMessageEnvelopeWithRetry,
  isChatProtocolIntent,
  type ChatDeliverResult,
} from "./chat-outbound-deliver.js";
import { markOutboundPeerVerified, isOutboundPeerRecentlyVerified } from "./outbound-peer-freshness.js";
import {
  canStartOwnerWarm,
  markOwnerWarmFinished,
  markOwnerWarmStarted,
} from "./bond-warm-coordinator.js";
import {
  buildOutboundDialHints,
  mergeDialablePeerListenAddrs,
  shouldPreferCircuitDialHints,
} from "./outbound-dial-hints.js";
import { dialableInboundRemoteAddrs, mergeInboundPeerDialHintsIfDue } from "./inbound-dial-hint-learn.js";
import { withOutboundSendLock } from "./outbound-send-lock.js";
import {
  normalizeTransportPeerId,
  ownerIdFromProfileIntent,
} from "./peer-directory-learn.js";
import {
  pickBestLibp2pPeerDirectoryRecord,
  pickConnectedTransportForOwner,
  pickLibp2pFromConnectedPeers,
  resolveRecipientEnvelopePeerId,
} from "./peer-transport-resolve.js";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";
import type { PersistedNodeConfig } from "./node-config-store.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";

export const WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS = 10_000;

export type TransportCacheEntry = { peerId: string; listenAddrs?: string[] };

/** Unblocks when an underlying fs read or mutex never settles (seen on some Windows setups). */
export function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface OutboundMessagingContext {
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
  getReachableMesh(): EnvoyMesh | undefined;
  requireMesh(): EnvoyMesh;
  getDiscoverySeedStore(): DiscoverySeedStore | undefined;
  getProfileDir(): string;
  peerDirectoryStore: LocalPeerDirectoryStore;
  getTransportCache(): Map<string, TransportCacheEntry>;
  setTransportCache(ownerId: string, entry: TransportCacheEntry): void;
  deleteTransportCache(ownerId: string): void;
  getPendingHelloRequesterPeerIds(): Iterable<{ requesterOwnerId: string; remotePeerId: string }>;
  getInboundListenAddrMergeByPeer(): Map<string, number>;
  learnInboundDialHints(transportPeerId: string, remoteAddr?: string): Promise<unknown>;
  assertOnline(): void;
  recordOwnerActivity(): void;
  requireProfile(): NodeProfile;
  loadHumanProfile(): Promise<{ displayName?: string } | undefined>;
  getTrustDisplayName(ownerId: string): Promise<string | undefined>;
  tagBondedContactReachability(peerId: string): void;
  flushPendingRoomSyncs(): void;
  flushPendingRoomMessages(): void;
  getBridgeAgentPeerId(): string | undefined;
  getSelfOwnerId(): string | undefined;
  getBridgeChatHandler(): ((envelope: EnvoyEnvelope, peerId: string) => Promise<void>) | undefined;
  persistChatMessage(threadPeerOwnerId: string, msg: ChatMessage): void;
  emitChatMessage(msg: ChatMessage): void;
  markOutboundChatDelivered(
    threadPeerOwnerId: string,
    messageId: string,
    deliveredAt: string,
  ): Promise<void>;
  learnFromMessage(outgoing: boolean, text: string): void;
  resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }>;
  deliverChatEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    options?: { expectDeliveryAck?: boolean },
  ): Promise<ChatDeliverResult>;
  dialHintsForChat(recipientPeerId: string, peerListenAddrs: string[] | undefined): Promise<string[]>;
}

export interface SendAgentChatContext extends OutboundMessagingContext {
  ensureAgentIdentity(): Promise<BridgeIdentity | null>;
  getNodeConfig(): Promise<NodeConfig | null | undefined>;
  getTrustRecord(ownerId: string): Promise<{ displayName?: string } | undefined>;
}

function withPathVerified(
  mesh: EnvoyMesh,
  transportPeerId: string,
  info: PeerConnectionInfo,
): PeerConnectionInfo {
  if (!info.connected) {
    return info;
  }
  return {
    ...info,
    pathVerified: isOutboundPeerRecentlyVerified(transportPeerId),
  };
}

function isDedupeableBackgroundWarm(options?: WarmContactConnectionOptions): boolean {
  return (
    !options?.redial &&
    !options?.upgradeRelayToDirect &&
    !options?.verifyConnection &&
    !options?.keepAlive &&
    options?.verifyOnly !== true
  );
}

export async function dialHintsForChatViaRuntime(
  ctx: OutboundMessagingContext,
  recipientPeerId: string,
  peerListenAddrs: string[] | undefined,
): Promise<string[]> {
  const config = await ctx.loadConfig();
  const mesh = ctx.getReachableMesh();
  const peerStoreAddrs =
    mesh && typeof mesh.getPeerStoreDialHints === "function"
      ? await mesh.getPeerStoreDialHints(recipientPeerId)
      : [];
  const mergedListen = mergeDialablePeerListenAddrs(
    recipientPeerId,
    peerListenAddrs,
    peerStoreAddrs,
  );
  return buildOutboundDialHints({
    recipientPeerId,
    peerListenAddrs: mergedListen.length ? mergedListen : peerListenAddrs,
    discoverySeedStore: ctx.getDiscoverySeedStore(),
    config,
    profileDir: ctx.getProfileDir(),
    localListenAddrs: mesh?.multiaddrs,
  });
}

export async function learnInboundDialHintsViaRuntime(
  ctx: Pick<
    OutboundMessagingContext,
    "getReachableMesh" | "peerDirectoryStore" | "getInboundListenAddrMergeByPeer"
  >,
  remotePeerId: string,
  remoteAddr?: string,
): Promise<string[]> {
  const mesh = ctx.getReachableMesh();
  return mergeInboundPeerDialHintsIfDue({
    remotePeerId,
    remoteAddr,
    lastMergeByPeer: ctx.getInboundListenAddrMergeByPeer(),
    peerDirectory: ctx.peerDirectoryStore,
    mesh: mesh ?? undefined,
  });
}

export async function rememberBondedPeerTransportFromInboundViaRuntime(
  ctx: OutboundMessagingContext,
  envelope: EnvoyEnvelope,
  inbound?: { transportPeerId?: string; remoteAddr?: string },
): Promise<void> {
  const transportPeerId = normalizeTransportPeerId(inbound?.transportPeerId);
  const ownerId = ownerIdFromProfileIntent(envelope);
  if (!transportPeerId || !ownerId) return;

  const listenAddrs = inbound?.remoteAddr?.trim()
    ? dialableInboundRemoteAddrs(inbound.remoteAddr, transportPeerId)
    : [];
  ctx.setTransportCache(ownerId, { peerId: transportPeerId, listenAddrs });
  markOutboundPeerVerified(transportPeerId);

  void ctx.learnInboundDialHints(transportPeerId, inbound?.remoteAddr).catch((err) =>
    console.warn(`[peer-directory] inbound dial hint learn failed:`, err),
  );

  try {
    await ctx.peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId,
      peerId: transportPeerId,
      listenAddrs,
    });
    if (envelope.senderPublicKey?.trim()) {
      await ctx.peerDirectoryStore.mergeInboundDeviceBinding({
        peerId: transportPeerId,
        devicePublicKeyPem: envelope.senderPublicKey,
        ownerId,
      });
    }
    console.log(
      `[peer-directory] learned ${ownerId.slice(0, 20)}… → libp2p ${transportPeerId.slice(0, 12)}… from ${envelope.intent}`,
    );
  } catch (err) {
    console.warn(`[peer-directory] learn from ${envelope.intent} failed:`, err);
  }
}

export function finalizePeerTransportResolve(
  targetOwnerId: string,
  transportPeerId: string,
  records: Awaited<ReturnType<LocalPeerDirectoryStore["listPeerRecords"]>>,
  listenAddrs: string[],
  isConnected: ((peerId: string) => boolean) | undefined,
): {
  transportPeerId: string;
  recipientEnvelopePeerId: string | undefined;
  listenAddrs: string[] | undefined;
} {
  if (isConnected && !isConnected(transportPeerId)) {
    const connected = records
      .filter((r) => r.ownerId === targetOwnerId && isLibp2pPeerId(r.peerId) && isConnected(r.peerId))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    const live = connected[0];
    if (live) {
      const merged = mergeDialablePeerListenAddrs(
        live.peerId,
        live.listenAddrs,
        records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
      );
      return {
        transportPeerId: live.peerId,
        recipientEnvelopePeerId: resolveRecipientEnvelopePeerId(records, targetOwnerId, live.peerId),
        listenAddrs: merged.length ? merged : undefined,
      };
    }
  }
  return {
    transportPeerId,
    recipientEnvelopePeerId: resolveRecipientEnvelopePeerId(records, targetOwnerId, transportPeerId),
    listenAddrs: listenAddrs.length ? listenAddrs : undefined,
  };
}

export async function resolvePeerTransportForOwnerViaRuntime(
  ctx: OutboundMessagingContext,
  targetOwnerId: string,
): Promise<{
  transportPeerId: string;
  recipientEnvelopePeerId: string | undefined;
  listenAddrs: string[] | undefined;
}> {
  const mesh = ctx.getReachableMesh();
  const isConnected = mesh
    ? (peerId: string) => mesh.getPeerConnectionInfo(peerId).connected
    : undefined;

  const records = await raceWithTimeout(
    ctx.peerDirectoryStore.listPeerRecords(),
    25_000,
    "listPeerRecords",
  );
  const connectedPeerIds = mesh?.getConnectedPeerIds() ?? [];
  const cache = ctx.getTransportCache();

  const liveConnected = pickConnectedTransportForOwner(
    records,
    targetOwnerId,
    connectedPeerIds,
    cache,
  );
  if (liveConnected) {
    const listenAddrs = mergeDialablePeerListenAddrs(
      liveConnected.peerId,
      liveConnected.listenAddrs,
      records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
    );
    ctx.setTransportCache(targetOwnerId, {
      peerId: liveConnected.peerId,
      listenAddrs,
    });
    return finalizePeerTransportResolve(
      targetOwnerId,
      liveConnected.peerId,
      records,
      listenAddrs,
      isConnected,
    );
  }

  const cachedTransport = cache.get(targetOwnerId);
  if (cachedTransport && isLibp2pPeerId(cachedTransport.peerId)) {
    let transportPeerId = cachedTransport.peerId;
    let transportListenAddrs = cachedTransport.listenAddrs;
    const bestConnected = pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected });
    if (
      bestConnected &&
      isLibp2pPeerId(bestConnected.peerId) &&
      bestConnected.peerId !== transportPeerId &&
      isConnected?.(bestConnected.peerId)
    ) {
      transportPeerId = bestConnected.peerId;
      transportListenAddrs = bestConnected.listenAddrs ?? [];
      ctx.setTransportCache(targetOwnerId, {
        peerId: transportPeerId,
        listenAddrs: transportListenAddrs,
      });
    } else if (
      isConnected &&
      !isConnected(transportPeerId) &&
      bestConnected &&
      isLibp2pPeerId(bestConnected.peerId)
    ) {
      transportPeerId = bestConnected.peerId;
      transportListenAddrs = bestConnected.listenAddrs ?? [];
      ctx.setTransportCache(targetOwnerId, {
        peerId: transportPeerId,
        listenAddrs: transportListenAddrs,
      });
    }
    let dirRow = records.find(
      (r) => r.ownerId === targetOwnerId && r.peerId === transportPeerId,
    );
    if (!dirRow) {
      dirRow = records.find((r) => r.peerId === transportPeerId);
    }
    if (!dirRow) {
      dirRow = pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected });
    }
    const ownerListenAddrs = records
      .filter((r) => r.ownerId === targetOwnerId)
      .flatMap((r) => r.listenAddrs ?? []);
    const listenAddrs = mergeDialablePeerListenAddrs(
      transportPeerId,
      transportListenAddrs,
      dirRow?.listenAddrs,
      ownerListenAddrs,
    );
    return finalizePeerTransportResolve(
      targetOwnerId,
      transportPeerId,
      records,
      listenAddrs,
      isConnected,
    );
  }

  const libp2pRow =
    pickBestLibp2pPeerDirectoryRecord(records, targetOwnerId, { isConnected }) ??
    pickLibp2pFromConnectedPeers(records, targetOwnerId, connectedPeerIds);
  if (libp2pRow) {
    const listenAddrs = mergeDialablePeerListenAddrs(
      libp2pRow.peerId,
      libp2pRow.listenAddrs,
      records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
    );
    ctx.setTransportCache(targetOwnerId, {
      peerId: libp2pRow.peerId,
      listenAddrs,
    });
    return finalizePeerTransportResolve(
      targetOwnerId,
      libp2pRow.peerId,
      records,
      listenAddrs,
      isConnected,
    );
  }

  let targetPeer: Awaited<ReturnType<LocalPeerDirectoryStore["getPeerByOwnerId"]>>;
  try {
    targetPeer = await raceWithTimeout(
      ctx.peerDirectoryStore.getPeerByOwnerId(targetOwnerId),
      25_000,
      "getPeerByOwnerId",
    );
  } catch (err) {
    throw err;
  }
  if (!targetPeer) {
    targetPeer =
      records.find((r) => r.ownerId === targetOwnerId) ??
      records.find((r) => r.peerId === targetOwnerId) ??
      undefined;
  }
  if (!targetPeer?.peerId) {
    throw new Error(`Peer not found for owner: ${targetOwnerId}`);
  }
  const transportPeerId = targetPeer.peerId;
  if (!isLibp2pPeerId(transportPeerId)) {
    throw new Error(`Peer directory has Envoy envelope id for this owner (not libp2p).`);
  }
  const listenAddrs = mergeDialablePeerListenAddrs(
    transportPeerId,
    targetPeer.listenAddrs,
    records.filter((r) => r.ownerId === targetOwnerId).flatMap((r) => r.listenAddrs ?? []),
  );
  ctx.setTransportCache(targetOwnerId, {
    peerId: transportPeerId,
    listenAddrs,
  });
  return finalizePeerTransportResolve(
    targetOwnerId,
    transportPeerId,
    records,
    listenAddrs,
    isConnected,
  );
}

export async function resolveLibp2pPeerForBondOwnerViaRuntime(
  ctx: OutboundMessagingContext,
  ownerId: string,
): Promise<{ transportPeerId: string; listenAddrs?: string[] } | undefined> {
  const cached = ctx.getTransportCache().get(ownerId);
  if (cached && isLibp2pPeerId(cached.peerId)) {
    return { transportPeerId: cached.peerId, listenAddrs: cached.listenAddrs };
  }

  for (const pending of ctx.getPendingHelloRequesterPeerIds()) {
    if (pending.requesterOwnerId === ownerId && isLibp2pPeerId(pending.remotePeerId)) {
      return { transportPeerId: pending.remotePeerId, listenAddrs: [] };
    }
  }

  try {
    const resolved = await resolvePeerTransportForOwnerViaRuntime(ctx, ownerId);
    return { transportPeerId: resolved.transportPeerId, listenAddrs: resolved.listenAddrs };
  } catch {
    const records = await ctx.peerDirectoryStore.listPeerRecords();
    const libp2p = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
    if (libp2p) {
      const mesh = ctx.getReachableMesh();
      let listenAddrs = libp2p.listenAddrs;
      if (mesh) {
        try {
          const storeAddrs = await mesh.getPeerStoreDialHints(libp2p.peerId);
          const merged = mergeDialablePeerListenAddrs(libp2p.peerId, listenAddrs, storeAddrs);
          if (merged.length > 0) {
            listenAddrs = merged;
          }
        } catch {
          /* best-effort */
        }
      }
      return { transportPeerId: libp2p.peerId, listenAddrs };
    }
    console.warn(
      `[profile.sync] no libp2p route to ${ownerId.slice(0, 20)}…: Peer not found for owner (ask contact to message you once, or re-save their profile photo)`,
    );
    return undefined;
  }
}

async function withChatSendLock<T>(
  transportPeerId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withOutboundSendLock(transportPeerId, fn);
}

export async function deliverChatEnvelopeViaRuntime(
  ctx: OutboundMessagingContext,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
  dialHints: string[],
  listenAddrs?: string[],
  options?: { expectDeliveryAck?: boolean },
): Promise<ChatDeliverResult> {
  return withChatSendLock(transportPeerId, async () => {
    const mesh = ctx.requireMesh();
    return deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints,
      peerListenAddrs: listenAddrs,
      chatProtocol: ENVOY_CHAT_PROTOCOL,
      rebuildDialHints: () => dialHintsForChatViaRuntime(ctx, transportPeerId, listenAddrs),
      expectDeliveryAck: options?.expectDeliveryAck,
    });
  });
}

export async function deliverCallEnvelopeToTransportPeerViaRuntime(
  ctx: OutboundMessagingContext,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
): Promise<void> {
  const mesh = ctx.requireMesh();
  // Protocol dispatch: chat/call/profile use `mesh.sendChat` (chat protocol);
  // other intents (agent.card.*, social.intro.*, …) must use `mesh.send`
  // (message protocol) — sending them on chat yields `invalid intent …
  // on chat protocol` and the retry loop never recovers.
  const useChatProtocol = isChatProtocolIntent(envelope.intent);
  const conn = mesh.getPeerConnectionInfo(transportPeerId);
  if (conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId)) {
    if (useChatProtocol) {
      await mesh.sendChat(transportPeerId, envelope, { dialHints: [] });
    } else {
      await mesh.send(transportPeerId, envelope, { dialHints: [] });
    }
    return;
  }
  if (useChatProtocol) {
    await deliverCallEnvelopeViaRuntime(ctx, transportPeerId, envelope, [], undefined, false);
  } else {
    await deliverMessageEnvelopeViaRuntime(ctx, transportPeerId, envelope, [], undefined, false);
  }
}

export async function deliverCallEnvelopeViaRuntime(
  ctx: OutboundMessagingContext,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
  dialHints: string[],
  listenAddrs?: string[],
  preferCircuitHints?: boolean,
): Promise<ChatDeliverResult> {
  return withChatSendLock(transportPeerId, async () => {
    const mesh = ctx.requireMesh();
    let conn = mesh.getPeerConnectionInfo(transportPeerId);
    // Fast-path: chat/call/profile uses chat protocol; everything else uses
    // message protocol (otherwise the chat stream handler rejects with
    // `invalid intent … on chat protocol`).
    const useChatProtocol = isChatProtocolIntent(envelope.intent);
    webrtcCallTrace("node:deliver-call-envelope", {
      intent: envelope.intent,
      callId: shortCallId(
        typeof envelope.payload === "object" &&
          envelope.payload !== null &&
          "callId" in envelope.payload
          ? String((envelope.payload as { callId?: string }).callId)
          : undefined,
      ),
      peer: shortCallId(transportPeerId),
      connected: conn.connected,
      direct: conn.direct,
      hintCount: dialHints.length,
    });
    if (!conn.connected) {
      const dialTargets = [...new Set([...(listenAddrs ?? []), ...dialHints])]
        .map((a) => a.trim())
        .filter(Boolean);
      if (dialTargets.length > 0) {
        const ordered = [...dialTargets].sort((a, b) => {
          const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
          const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
          if (aLan !== bLan) return bLan - aLan;
          const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
          const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
          if (aCircuit !== bCircuit) return aCircuit - bCircuit;
          return 0;
        });
        for (const addr of ordered) {
          try {
            await mesh.dial(addr);
            conn = mesh.getPeerConnectionInfo(transportPeerId);
            if (conn.connected) break;
          } catch {
            /* try next addr */
          }
        }
      }
    }
    const preferCircuits = preferCircuitHints ?? !conn.direct;
    const wasConnected = conn.connected;
    if (conn.connected) {
      try {
        if (useChatProtocol) {
          await mesh.sendChat(transportPeerId, envelope, {
            dialHints: [],
            preferCircuitHints: preferCircuits && !conn.direct,
          });
        } else {
          await mesh.send(transportPeerId, envelope, {
            dialHints: [],
            preferCircuitHints: preferCircuits && !conn.direct,
          });
        }
        webrtcCallTrace("node:deliver-call-fast-path-ok", {
          peer: shortCallId(transportPeerId),
          direct: conn.direct,
        });
        return { delivered: true, deliveredAt: new Date().toISOString() };
      } catch (fastErr) {
        webrtcCallWarn("node:deliver-call-fast-path-failed", {
          peer: shortCallId(transportPeerId),
          error: fastErr instanceof Error ? fastErr.message.slice(0, 120) : String(fastErr),
        });
        console.warn(
          `[call] connected send failed for ${transportPeerId.slice(0, 12)}…, retrying:`,
          fastErr instanceof Error ? fastErr.message : fastErr,
        );
      }
    }
    return deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints: wasConnected ? [] : dialHints,
      peerListenAddrs: wasConnected ? [] : listenAddrs,
      preferCircuitHints: preferCircuits,
      rebuildDialHints: wasConnected
        ? undefined
        : () => dialHintsForChatViaRuntime(ctx, transportPeerId, listenAddrs),
    });
  });
}

/**
 * Message-protocol sibling of {@link deliverCallEnvelopeViaRuntime} for
 * non-chat-protocol intents (agent.card.*, social.intro.*, device.pair.*,
 * task.*, discovery.*, share.*, …). Chat/call/profile intents must NOT go
 * through this — they use the chat protocol for bonded-contact reliability.
 */
export async function deliverMessageEnvelopeViaRuntime(
  ctx: OutboundMessagingContext,
  transportPeerId: string,
  envelope: EnvoyEnvelope,
  dialHints: string[],
  listenAddrs?: string[],
  preferCircuitHints?: boolean,
): Promise<ChatDeliverResult> {
  return withChatSendLock(transportPeerId, async () => {
    const mesh = ctx.requireMesh();
    const conn = mesh.getPeerConnectionInfo(transportPeerId);
    if (conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId)) {
      try {
        await mesh.send(transportPeerId, envelope, { dialHints: [] });
        return { delivered: true, deliveredAt: new Date().toISOString() };
      } catch {
        /* fall through to retry with rebuildDialHints */
      }
    }
    return deliverMessageEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints,
      peerListenAddrs: listenAddrs,
      preferCircuitHints: preferCircuitHints ?? !conn.direct,
      rebuildDialHints: () => dialHintsForChatViaRuntime(ctx, transportPeerId, listenAddrs),
    });
  });
}

export async function getPeerConnectionInfoViaRuntime(
  ctx: OutboundMessagingContext,
  peerOwnerId: string,
): Promise<PeerConnectionInfo> {
  const mesh = ctx.getReachableMesh();
  if (!mesh) {
    return { connected: false, direct: false };
  }

  const bridgeAgentPeerId = ctx.getBridgeAgentPeerId();
  if (bridgeAgentPeerId && peerOwnerId === bridgeAgentPeerId) {
    return { connected: true, direct: true };
  }

  const selfOwnerId = ctx.getSelfOwnerId();
  if (selfOwnerId && peerOwnerId === selfOwnerId) {
    return { connected: true, direct: true };
  }

  try {
    const { transportPeerId } = await ctx.resolvePeerTransportForOwner(peerOwnerId);
    if (transportPeerId === mesh.peerId) {
      return { connected: true, direct: true };
    }
    // Fast libp2p snapshot for UI badges — no stream probe here (probe runs on send via
    // warmContactConnection verifyConnection / prepareOutboundPeerConnection).
    return withPathVerified(mesh, transportPeerId, mesh.getPeerConnectionInfo(transportPeerId));
  } catch (err) {
    console.warn(
      `[getPeerConnectionInfo] no route to ${peerOwnerId.slice(0, 24)}…:`,
      err instanceof Error ? err.message : err,
    );
    return { connected: false, direct: false };
  }
}

export async function mergeFreshListenAddrsViaRuntime(
  ctx: OutboundMessagingContext,
  ownerId: string,
  transportPeerId: string,
  listenAddrs: string[] | undefined,
): Promise<string[] | undefined> {
  const cached = ctx.getTransportCache().get(ownerId.trim())?.listenAddrs;
  let fromDir: string[] = [];
  try {
    const records = await ctx.peerDirectoryStore.listPeerRecords();
    fromDir = records
      .filter((r) => r.ownerId === ownerId.trim() || r.peerId === transportPeerId)
      .flatMap((r) => r.listenAddrs ?? []);
  } catch {
    /* best-effort */
  }
  const merged = mergeDialablePeerListenAddrs(
    transportPeerId,
    listenAddrs,
    cached,
    fromDir,
  );
  return merged.length ? merged : listenAddrs;
}

export async function warmContactConnectionTransportViaRuntime(
  ctx: OutboundMessagingContext,
  transportPeerId: string,
  listenAddrs: string[] | undefined,
  options?: WarmContactConnectionOptions,
): Promise<PeerConnectionInfo> {
  const mesh = ctx.requireMesh();
  void ctx.tagBondedContactReachability(transportPeerId);
  const existing = mesh.getPeerConnectionInfo(transportPeerId);

  if (options?.verifyOnly) {
    if (!existing.connected) {
      return existing;
    }
    return mesh.probeBondedPeerConnection(transportPeerId);
  }

  const needsProbe = options?.keepAlive === true || options?.verifyConnection === true;
  if (existing.connected && !options?.redial && !options?.upgradeRelayToDirect) {
    if (needsProbe) {
      if (options?.verifyConnection) {
        const probed = await mesh.probeBondedPeerConnection(transportPeerId);
        if (probed.connected) {
          markOutboundPeerVerified(transportPeerId);
          return probed;
        }
      } else {
        const probed = await mesh.probeBondedPeerConnection(transportPeerId);
        if (probed.connected || options?.keepAlive === true) {
          if (probed.connected) {
            markOutboundPeerVerified(transportPeerId);
          }
          return probed;
        }
      }
    } else {
      return existing;
    }
  }

  let dialHints: string[];
  try {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS,
      "_dialHintsForChat",
    );
  } catch {
    return mesh.getPeerConnectionInfo(transportPeerId);
  }

  const dialableListen = mergeDialablePeerListenAddrs(transportPeerId, listenAddrs, dialHints);
  if (typeof mesh.scrubPeerStoreDialHints === "function") {
    void mesh.scrubPeerStoreDialHints(transportPeerId, dialableListen);
  }

  const preferCircuitHints = shouldPreferCircuitDialHints(listenAddrs, dialHints, transportPeerId);

  if (typeof mesh.mergePeerStoreDialHints === "function") {
    void mesh.mergePeerStoreDialHints(transportPeerId, dialHints);
  }

  const tearingDown =
    options?.redial === true ||
    options?.upgradeRelayToDirect === true ||
    (needsProbe && !options?.keepAlive);
  if (tearingDown) {
    try {
      await mesh.closeConnectionsToPeer(transportPeerId);
    } catch {
      /* ignore */
    }
  }

  const result = await mesh.ensurePeerReachable(transportPeerId, ENVOY_CHAT_PROTOCOL, {
    dialHints,
    preferCircuitHints,
    forceFreshDial:
      options?.redial === true ||
      !existing.connected ||
      options?.upgradeRelayToDirect === true ||
      tearingDown,
    upgradeRelayToDirect: options?.upgradeRelayToDirect === true || options?.redial === true,
  });
  void ctx.flushPendingRoomSyncs();
  void ctx.flushPendingRoomMessages();
  if (result.connected) {
    markOutboundPeerVerified(transportPeerId);
  }
  return result;
}

export async function warmContactConnectionViaRuntime(
  ctx: OutboundMessagingContext,
  peerOwnerId: string,
  options?: WarmContactConnectionOptions,
): Promise<PeerConnectionInfo> {
  ctx.assertOnline();
  const selfOwnerId = ctx.getSelfOwnerId();
  if (selfOwnerId && peerOwnerId.trim() === selfOwnerId) {
    return { connected: true, direct: true, pathVerified: true };
  }

  const dedupeWarm = isDedupeableBackgroundWarm(options);
  if (dedupeWarm && !canStartOwnerWarm(peerOwnerId)) {
    return getPeerConnectionInfoViaRuntime(ctx, peerOwnerId);
  }
  if (dedupeWarm) {
    markOwnerWarmStarted(peerOwnerId);
  }

  try {
    let transportPeerId: string;
    let listenAddrs: string[] | undefined;
    try {
      const resolved = await ctx.resolvePeerTransportForOwner(peerOwnerId);
      transportPeerId = resolved.transportPeerId;
      listenAddrs = resolved.listenAddrs;
    } catch (err) {
      console.warn(
        `[warmContact] no route to ${peerOwnerId.slice(0, 24)}…:`,
        err instanceof Error ? err.message : err,
      );
      return { connected: false, direct: false };
    }

    listenAddrs = await mergeFreshListenAddrsViaRuntime(
      ctx,
      peerOwnerId,
      transportPeerId,
      listenAddrs,
    );

    const mesh = ctx.getReachableMesh();
    const info = await warmContactConnectionTransportViaRuntime(
      ctx,
      transportPeerId,
      listenAddrs,
      options,
    );
    return mesh ? withPathVerified(mesh, transportPeerId, info) : info;
  } finally {
    if (dedupeWarm) {
      markOwnerWarmFinished(peerOwnerId);
    }
  }
}

export async function sendChatViaRuntime(
  ctx: OutboundMessagingContext,
  targetOwnerId: string,
  text: string,
  attachments?: SendChatParams["attachments"],
): Promise<SendChatResult> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  recordMeshActivity();
  const mesh = ctx.requireMesh();
  const selfProfile = ctx.requireProfile();

  console.log(`[sendChat] targetOwnerId=${targetOwnerId}, text=${text}`);

  let transportPeerId: string;
  let recipientEnvelopePeerId: string | undefined;
  let listenAddrs: string[] | undefined;
  try {
    ({ transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await ctx.resolvePeerTransportForOwner(targetOwnerId));
  } catch (err) {
    ctx.deleteTransportCache(targetOwnerId);
    throw err;
  }

  const [selfHuman, recipientDisplayName] = await Promise.all([
    ctx.loadHumanProfile(),
    ctx.getTrustDisplayName(targetOwnerId),
  ]);

  const conn = mesh.getPeerConnectionInfo(transportPeerId);
  let dialHints: string[];
  if (conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId)) {
    dialHints = [];
  } else {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      10_000,
      "_dialHintsForChat",
    );
  }

  if (typeof mesh.scrubPeerStoreDialHints === "function") {
    void mesh.scrubPeerStoreDialHints(
      transportPeerId,
      mergeDialablePeerListenAddrs(transportPeerId, listenAddrs, dialHints),
    );
  }

  console.log(
    `[sendChat] transportPeerId=${transportPeerId} connected=${conn.connected} envelopeRecipientPeerId=${recipientEnvelopePeerId ?? "(omitted)"} dialHints=${dialHints.length}`,
  );

  void ctx.tagBondedContactReachability(transportPeerId);

  const wireText = stripModelThinking(text);

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
      senderPublicKey: selfProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: selfProfile.owner.ownerId,
        text: wireText,
        attachments: attachments?.map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          sensitivity: a.sensitivity,
          ...(a.vaultRelativePath ? { vaultRelativePath: a.vaultRelativePath } : {}),
        })),
        ...chatMessagePayloadDeviceFields({
          deviceCertificate: selfProfile.deviceCertificate,
          ownerPublicKeyPem: selfProfile.owner.publicKeyPem,
        }),
      }),
    }),
    selfProfile.device.privateKeyPem,
  );

  let deliverResult: ChatDeliverResult = { delivered: false };
  const bridgeHandler = ctx.getBridgeChatHandler();
  try {
    if (transportPeerId === mesh.peerId && bridgeHandler) {
      console.log(`[sendChat] self-send to ${targetOwnerId}, routing via bridge handler`);
      await bridgeHandler(envelope, mesh.peerId);
      deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
    } else {
      const skipAck = conn.connected && conn.direct;
      deliverResult = await ctx.deliverChatEnvelope(
        transportPeerId,
        envelope,
        dialHints,
        listenAddrs,
        { ...(skipAck ? { expectDeliveryAck: false } : undefined) },
      );
    }
  } catch (err) {
    ctx.deleteTransportCache(targetOwnerId);
    throw err;
  }

  if (deliverResult.delivered) {
    ctx.setTransportCache(targetOwnerId, {
      peerId: transportPeerId,
      listenAddrs: listenAddrs ?? [],
    });
  }

  const deliveryReceipt = deliverResult.delivered ? ("delivered" as const) : ("sent" as const);
  const emittedMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: mesh.peerId,
      ownerId: selfProfile.owner.ownerId,
      displayName: selfHuman?.displayName ?? selfProfile.owner.ownerId,
      actorRole: "human",
    },
    recipient: {
      nodeId: transportPeerId,
      ownerId: targetOwnerId,
      displayName: recipientDisplayName ?? targetOwnerId,
    },
    content: {
      text: wireText,
      ...(attachments?.length
        ? {
            attachments: attachments.map((a) => ({
              id: a.id,
              filename: a.filename,
              mimeType: a.mimeType,
              sizeBytes: a.sizeBytes,
              sensitivity: a.sensitivity,
              ...(a.vaultRelativePath ? { vaultRelativePath: a.vaultRelativePath } : {}),
            })),
          }
        : {}),
    },
    metadata: {
      timestamp: envelope.createdAt,
      deliveryReceipt,
    },
    signature: envelope.signature,
  };
  console.log(`[sendChat] Emitting chat:message locally:`, emittedMsg);
  ctx.persistChatMessage(targetOwnerId, emittedMsg);
  ctx.emitChatMessage(emittedMsg);
  if (deliverResult.delivered) {
    await ctx.markOutboundChatDelivered(
      targetOwnerId,
      envelope.messageId,
      deliverResult.deliveredAt ?? envelope.createdAt,
    );
  }
  ctx.learnFromMessage(true, wireText);
  return {
    messageId: envelope.messageId,
    deliveryReceipt,
    deliveredAt: deliverResult.deliveredAt,
  };
}

export async function sendAgentChatViaRuntime(
  ctx: SendAgentChatContext,
  targetOwnerId: string,
  text: string,
): Promise<SendChatResult> {
  ctx.assertOnline();
  recordMeshActivity();
  const mesh = ctx.requireMesh();
  const agentIdentity = await ctx.ensureAgentIdentity();
  if (!agentIdentity) {
    throw new Error("Agent identity is not available");
  }

  const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
    await ctx.resolvePeerTransportForOwner(targetOwnerId);

  const [selfHuman, recipientTrust, config] = await Promise.all([
    ctx.loadHumanProfile(),
    ctx.getTrustRecord(targetOwnerId),
    ctx.getNodeConfig(),
  ]);

  let wireText = stripModelThinking(text);
  const aiIdentity = config?.aiSettings?.identity as AiIdentity | undefined;
  wireText = applyAiIdentityForIdentity(wireText, aiIdentity);
  console.log(`[sendAgentChat] targetOwnerId=${targetOwnerId}, text=${wireText.slice(0, 80)}`);

  const dialHints = await raceWithTimeout(
    ctx.dialHintsForChat(transportPeerId, listenAddrs),
    30_000,
    "_dialHintsForChat",
  );

  void ctx.tagBondedContactReachability(transportPeerId);

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: agentIdentity.agentPeerId,
      senderPublicKey: agentIdentity.agentPublicKeyPem,
      senderRole: "agent",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        senderOwnerId: agentIdentity.ownerId,
        text: wireText,
      }),
      agentCredential: agentIdentity.agentCredential,
    }),
    agentIdentity.agentPrivateKeyPem,
  );

  let deliverResult: ChatDeliverResult = { delivered: false };
  const bridgeHandler = ctx.getBridgeChatHandler();
  if (transportPeerId === mesh.peerId && bridgeHandler) {
    await bridgeHandler(envelope, mesh.peerId);
    deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
  } else {
    deliverResult = await ctx.deliverChatEnvelope(transportPeerId, envelope, dialHints, listenAddrs, {
      expectDeliveryAck: false,
    });
  }

  if (deliverResult.delivered || transportPeerId !== mesh.peerId) {
    ctx.setTransportCache(targetOwnerId, {
      peerId: transportPeerId,
      listenAddrs: listenAddrs ?? [],
    });
  }

  const deliveryReceipt = deliverResult.delivered ? ("delivered" as const) : ("sent" as const);
  const emittedMsg: ChatMessage = {
    messageId: envelope.messageId,
    sender: {
      nodeId: agentIdentity.agentPeerId,
      ownerId: agentIdentity.ownerId,
      displayName: selfHuman?.displayName ?? agentIdentity.ownerId,
      actorRole: "agent",
      agentId: agentIdentity.agentCredential.agentId,
      agentVerified: true,
    },
    recipient: {
      nodeId: transportPeerId,
      ownerId: targetOwnerId,
      displayName: recipientTrust?.displayName ?? targetOwnerId,
    },
    content: { text: wireText },
    metadata: {
      timestamp: envelope.createdAt,
      deliveryReceipt,
    },
    signature: envelope.signature,
  };
  ctx.persistChatMessage(targetOwnerId, emittedMsg);
  ctx.emitChatMessage(emittedMsg);
  if (deliverResult.delivered) {
    await ctx.markOutboundChatDelivered(
      targetOwnerId,
      envelope.messageId,
      deliverResult.deliveredAt ?? envelope.createdAt,
    );
  }
  return {
    messageId: envelope.messageId,
    deliveryReceipt,
    deliveredAt: deliverResult.deliveredAt,
  };
}
