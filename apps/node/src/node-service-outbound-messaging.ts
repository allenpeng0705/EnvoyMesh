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
  isPrivateRelayHopCircuitDialHint,
  type EnvoyMesh,
} from "@envoymesh/network";
import { bondTrace, bondDialTimeoutMs, classifyBondDialTarget } from "./bond-trace.js";
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
  hasRfc6598OverlayDialEvidence,
  hasSameSubnetLanDialEvidence,
  mergeDialablePeerListenAddrs,
  shouldPreferCircuitDialHints,
  shouldRetainCircuitDialHints,
  isMultiaddrPeerIdsValid,
} from "./outbound-dial-hints.js";
import {
  privateLanListenAddrsForPersist,
  resolveReachabilityDialPolicy,
  shouldIdentifyBeforeVpnSkip,
} from "./peer-reachability-policy.js";
import { detectLikelyVpnActive } from "./cgnat-detection.js";
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
import {
  ensureReachableWithLanFirstBudget,
  raceWithTimeout,
  WARM_CONTACT_DIAL_BUDGET_MS,
  WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS,
  WARM_CONTACT_SAME_SUBNET_BUDGET_MS,
  WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS,
  WARM_CONTACT_VPN_DIAL_TIMEOUT_MS,
} from "./outbound-warm-dial.js";
import {
  inferPeerPathIntent,
  releasePeerPathDialSlot,
  tryAcquirePeerPathDialSlot,
} from "./peer-path-slots.js";

export {
  raceWithTimeout,
  WARM_CONTACT_DIAL_BUDGET_MS,
  WARM_CONTACT_DIAL_HINTS_TIMEOUT_MS,
  WARM_CONTACT_SAME_SUBNET_BUDGET_MS,
  WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS,
  WARM_CONTACT_VPN_DIAL_TIMEOUT_MS,
};

async function discoveryProfileFromConfig(
  ctx: Pick<OutboundMessagingContext, "loadConfig">,
): Promise<string | undefined> {
  try {
    const cfg = await ctx.loadConfig();
    const profile = typeof cfg?.discoveryProfile === "string" ? cfg.discoveryProfile.trim() : "";
    return profile || undefined;
  } catch {
    return undefined;
  }
}

export type TransportCacheEntry = { peerId: string; listenAddrs?: string[] };

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
    !options?.force &&
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
  addressFilter?: "lan-paired" | "wan-public" | "all",
): Promise<string[]> {
  const config = await ctx.loadConfig();
  const mesh = ctx.getReachableMesh();
  const localListen = mesh?.multiaddrs;
  // Same-subnet: pull mDNS/identify high-port LAN from peerstore (tcp/0 listeners).
  // Stable-only getPeerStoreDialHints previously dropped the only Direct path.
  const evidenceForSubnet = [
    ...(peerListenAddrs ?? []),
    ...(localListen ?? []),
  ];
  let rawDirListen: string[] = [];
  let preferredDialHint: string | undefined;
  try {
    const dirRows = (await ctx.peerDirectoryStore.listPeerRecords()).filter(
      (r) => r.peerId === recipientPeerId,
    );
    rawDirListen = dirRows.flatMap((r) => r.listenAddrs ?? []);
    preferredDialHint = dirRows
      .map((r) => r.lastSuccessfulDialHint?.trim())
      .find((h): h is string => Boolean(h));
  } catch {
    /* best-effort */
  }
  const sameSubnet = hasSameSubnetLanDialEvidence(
    localListen,
    [...evidenceForSubnet, ...rawDirListen],
    { hostNicFallback: true },
  );
  // Same-LAN: never feed a sticky relay last-dial into hint build — it races
  // Online-Direct (preferDialHintFirst also guards this).
  if (sameSubnet && preferredDialHint?.includes("/p2p-circuit/")) {
    preferredDialHint = undefined;
  }
  const peerStoreAddrs =
    mesh && typeof mesh.getPeerStoreDialHints === "function"
      ? await mesh.getPeerStoreDialHints(recipientPeerId, {
          allowEphemeralPrivateLan: sameSubnet,
        })
      : [];
  const mergedListen = sameSubnet
    ? [...new Set([...(peerListenAddrs ?? []), ...rawDirListen, ...peerStoreAddrs])]
    : mergeDialablePeerListenAddrs(recipientPeerId, peerListenAddrs, peerStoreAddrs);
  return buildOutboundDialHints({
    recipientPeerId,
    peerListenAddrs: mergedListen.length ? mergedListen : peerListenAddrs,
    discoverySeedStore: ctx.getDiscoverySeedStore(),
    config,
    profileDir: ctx.getProfileDir(),
    localListenAddrs: localListen,
    addressFilter,
    preferredDialHint,
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
    const inboundRemote = inbound?.remoteAddr?.trim();
    if (inboundRemote && isMultiaddrPeerIdsValid(inboundRemote)) {
      void ctx.peerDirectoryStore
        .recordLastSuccessfulDial({
          peerId: transportPeerId,
          dialHint: inboundRemote.includes(`/p2p/${transportPeerId}`)
            ? inboundRemote
            : `${inboundRemote.replace(/\/$/, "")}/p2p/${transportPeerId}`,
          path: inboundRemote.includes("/p2p-circuit/") ? "relay" : "direct",
        })
        .catch((err) =>
          console.warn(
            `[peer-directory] inbound recordLastSuccessfulDial failed:`,
            err instanceof Error ? err.message : err,
          ),
        );
    }
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
    const discoveryProfile = await discoveryProfileFromConfig(ctx);
    return deliverChatEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints,
      peerListenAddrs: listenAddrs,
      chatProtocol: ENVOY_CHAT_PROTOCOL,
      rebuildDialHints: () => dialHintsForChatViaRuntime(ctx, transportPeerId, listenAddrs),
      expectDeliveryAck: options?.expectDeliveryAck,
      discoveryProfile,
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
    const preferCircuits = preferCircuitHints ?? !conn.direct;
    if (!conn.connected) {
      const dialTargets = [...new Set([...(listenAddrs ?? []), ...dialHints])]
        .map((a) => a.trim())
        .filter((a) => {
          if (!a) return false;
          // Keep private LAN even when circuits are preferred — short LAN
          // timeouts below fail fast; dropping LAN made same-LAN invites miss
          // when the relay path was down.
          // Drop multiaddrs with invalid base58btc peer IDs — a single bad
          // character (e.g. lowercase-L 'l') causes SyntaxError at dial time.
          if (!isMultiaddrPeerIdsValid(a)) {
            console.warn(`[deliver] dropping multiaddr with invalid base58btc peer ID: ${a.slice(0, 60)}…`);
            return false;
          }
          return true;
        });
      if (dialTargets.length > 0) {
        console.warn(`[deliver] dialTargets(${dialTargets.length}) preferCircuits=${preferCircuits}: ${dialTargets.map((t) => t.slice(0, 160)).join(" | ")}`);
        // Keep BOTH LAN and circuit. Prefer order only — never drop RFC1918 for
        // call.invite (dropping LAN broke same-LAN homes when circuit was down;
        // circuit-only broke when LAN was the only working path).
        // Split private-hop circuits out: installer tokens often ship a
        // 192.168.x /p2p-circuit/ hop that is NOT WAN-dialable but was treated
        // as a normal circuit (8s timeout) ahead of the community relay.
        const lanAddrs = dialTargets.filter((a) => isPrivateLanTcpDialHint(a));
        const privateCircuits = dialTargets.filter((a) => isPrivateRelayHopCircuitDialHint(a));
        const publicCircuits = dialTargets.filter(
          (a) => a.includes("/p2p-circuit/") && !isPrivateRelayHopCircuitDialHint(a),
        );
        const otherAddrs = dialTargets.filter(
          (a) =>
            !isPrivateLanTcpDialHint(a) &&
            !a.includes("/p2p-circuit/"),
        );
        const ordered = preferCircuits
          ? [...publicCircuits, ...otherAddrs, ...privateCircuits, ...lanAddrs]
          : [...lanAddrs, ...otherAddrs, ...publicCircuits, ...privateCircuits];
        const bondTraceDial = envelope.intent === "bond.request";
        if (bondTraceDial) {
          bondTrace(3, "WAIT", "dialing sponsor for bond.request", {
            peer: transportPeerId.slice(0, 16),
            publicCircuits: publicCircuits.length,
            privateCircuits: privateCircuits.length,
            lan: lanAddrs.length,
            other: otherAddrs.length,
            preferCircuits,
          });
        }
        for (const addr of ordered) {
          const kind = classifyBondDialTarget(addr);
          // bond.request over WAN public-circuit: historical 15s race lost to
          // wan-default dial-queue congestion (Win first-launch). Keep LAN /
          // private-hop short; public circuit bond dials use 45s + abort.
          const timeoutMs = bondDialTimeoutMs(kind, bondTraceDial);
          if (bondTraceDial) {
            const stats =
              typeof mesh.getConnectionStats === "function"
                ? mesh.getConnectionStats()
                : undefined;
            const queued = stats?.dialQueueLength ?? 0;
            // Bootstrap presets can leave 100+ pending dials; wait briefly so
            // the sponsor circuit CONNECT is not stuck behind DHT churn.
            if (kind === "public-circuit" && queued > 16) {
              bondTrace(3, "WAIT", "dial queue congested — settling before circuit dial", {
                dialQueue: queued,
                totalConns: stats?.totalConnections,
              });
              const settleDeadline = Date.now() + 8_000;
              while (Date.now() < settleDeadline) {
                const q = mesh.getConnectionStats()?.dialQueueLength ?? 0;
                if (q <= 16) break;
                await new Promise<void>((r) => setTimeout(r, 250));
              }
            }
            const statsAfter =
              typeof mesh.getConnectionStats === "function"
                ? mesh.getConnectionStats()
                : undefined;
            bondTrace(3, "WAIT", "mesh.dial attempt", {
              kind,
              timeoutMs,
              dialQueue: statsAfter?.dialQueueLength,
              totalConns: statsAfter?.totalConnections,
              addr: addr.slice(0, 140),
            });
            // Ensure the circuit hop is connected before CONNECT — reservation
            // can look live while the relay TCP session is gone.
            if (kind === "public-circuit") {
              const relayBase = addr.split("/p2p-circuit/")[0]?.trim();
              if (relayBase && typeof mesh.eagerConnectToRelays === "function") {
                try {
                  await mesh.eagerConnectToRelays([relayBase], { timeoutMs: 10_000 });
                } catch {
                  /* best-effort; dial below still runs */
                }
              }
            }
          }
          const abort = new AbortController();
          const timer = setTimeout(() => abort.abort(), timeoutMs);
          try {
            await mesh.dial(addr, { signal: abort.signal });
            conn = mesh.getPeerConnectionInfo(transportPeerId);
            if (conn.connected) {
              if (bondTraceDial) {
                bondTrace(3, "PASS", "circuit/path dial connected", {
                  kind,
                  direct: conn.direct,
                  addr: addr.slice(0, 140),
                });
              }
              break;
            }
            if (bondTraceDial) {
              bondTrace(3, "FAIL", "dial returned but peer not connected", {
                kind,
                addr: addr.slice(0, 140),
              });
            }
          } catch (dialErr) {
            const raw = dialErr instanceof Error ? dialErr.message : String(dialErr);
            const aborted =
              abort.signal.aborted ||
              /aborted|AbortError|operation was aborted/i.test(raw);
            const msg = aborted ? `dial timeout (${timeoutMs / 1000}s)` : raw;
            if (bondTraceDial) {
              bondTrace(3, "FAIL", "mesh.dial failed", {
                kind,
                error: msg.slice(0, 120),
                addr: addr.slice(0, 140),
              });
            }
            console.warn(
              `[deliver] mesh.dial failed for ${addr.slice(0, 160)}…:`,
              msg,
            );
          } finally {
            clearTimeout(timer);
          }
        }
        if (!conn.connected) {
          if (bondTraceDial) {
            bondTrace(3, "FAIL", "all dial targets exhausted for bond.request", {
              peer: transportPeerId.slice(0, 16),
              tried: ordered.length,
            });
          }
          console.warn(
            `[deliver] all ${ordered.length} dial targets exhausted for ${transportPeerId.slice(0, 16)}… — unable to establish connection`,
          );
        }
      }
    }
    const wasConnected = conn.connected;
    // Circuit / bond sends must keep dialHints after a successful dial.
    // Relay connections are often "limited"; stream open can fail and must
    // fall back to redialing the same /p2p-circuit/ hint. Clearing hints
    // here caused: dial PASS → "Cannot open protocol stream on limited
    // connection" → retry with no circuit → hang/fail (Win auto-bond).
    // Explicit preferCircuitHints:false (LAN-first call) must not retain.
    const keepCircuitHints = shouldRetainCircuitDialHints({
      intent: envelope.intent,
      preferCircuitHints,
      wantCircuits: preferCircuits,
      connectedDirect: conn.direct,
    });
    const sendDialHints = keepCircuitHints ? dialHints : [];
    const sendPreferCircuits = keepCircuitHints
      ? true
      : preferCircuitHints === false
        ? false
        : preferCircuits && !conn.direct;
    if (conn.connected) {
      try {
        if (useChatProtocol) {
          await mesh.sendChat(transportPeerId, envelope, {
            dialHints: sendDialHints,
            preferCircuitHints: sendPreferCircuits,
          });
        } else {
          await mesh.send(transportPeerId, envelope, {
            dialHints: sendDialHints,
            preferCircuitHints: sendPreferCircuits,
          });
        }
        webrtcCallTrace("node:deliver-call-fast-path-ok", {
          peer: shortCallId(transportPeerId),
          direct: conn.direct,
        });
        if (envelope.intent === "bond.request") {
          bondTrace(3, "PASS", "bond.request sent on connected path", {
            peer: transportPeerId.slice(0, 16),
            direct: conn.direct,
          });
        }
        return { delivered: true, deliveredAt: new Date().toISOString() };
      } catch (fastErr) {
        const errMsg = fastErr instanceof Error ? fastErr.message : String(fastErr);
        webrtcCallWarn("node:deliver-call-fast-path-failed", {
          peer: shortCallId(transportPeerId),
          error: errMsg.slice(0, 120),
        });
        if (envelope.intent === "bond.request") {
          bondTrace(3, "FAIL", "connected send failed after dial — retrying with circuit hints", {
            peer: transportPeerId.slice(0, 16),
            error: errMsg.slice(0, 140),
            hintCount: dialHints.length,
            keepCircuitHints,
          });
        }
        console.warn(
          `[call] connected send failed for ${transportPeerId.slice(0, 12)}…, retrying:`,
          errMsg,
        );
      }
    }
    return deliverCallEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints: wasConnected && !keepCircuitHints ? [] : dialHints,
      // Keep LAN listen addrs for call invite retries (short LAN dial timeout).
      peerListenAddrs: wasConnected && !keepCircuitHints ? [] : listenAddrs,
      preferCircuitHints: keepCircuitHints || preferCircuits,
      discoveryProfile: await discoveryProfileFromConfig(ctx),
      rebuildDialHints:
        wasConnected && !keepCircuitHints
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
    const preferCircuits = preferCircuitHints ?? !conn.direct;
    const hasCircuit = dialHints.some((h) => h.includes("/p2p-circuit/"));
    return deliverMessageEnvelopeWithRetry({
      mesh,
      transportPeerId,
      envelope,
      dialHints,
      // Filter out private LAN listenAddrs when circuits are preferred,
      // and drop multiaddrs with invalid base58btc peer IDs.
      peerListenAddrs: (listenAddrs ?? []).filter((a) => {
        const t = a.trim();
        if (preferCircuits && hasCircuit && isPrivateLanTcpDialHint(t)) return false;
        if (!isMultiaddrPeerIdsValid(t)) return false;
        return true;
      }),
      preferCircuitHints: preferCircuits,
      discoveryProfile: await discoveryProfileFromConfig(ctx),
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
  // Nodes listen on tcp/0 → peer-directory only has high ports. Keep up to 2
  // same-subnet private LAN snapshots so dial hints can try LAN before relay.
  const mesh = ctx.getReachableMesh();
  const localListen = mesh?.multiaddrs;
  if (hasSameSubnetLanDialEvidence(localListen, fromDir, { hostNicFallback: true })) {
    const seen = new Set(merged);
    let kept = 0;
    for (const raw of fromDir) {
      const a = raw.trim();
      if (!a || seen.has(a)) continue;
      if (!isPrivateLanTcpDialHint(a) || a.includes("/p2p-circuit/")) continue;
      if (!hasSameSubnetLanDialEvidence(localListen, [a])) continue;
      seen.add(a);
      merged.push(a);
      kept += 1;
      if (kept >= 2) break;
    }
  }
  return merged.length ? merged : listenAddrs;
}

/**
 * Identify over a live relay/limited conn, then read peerstore LAN listens.
 * Used before VPN "skip home LAN" so same-LAN + VPN can still upgrade to Direct
 * when peer-directory listenAddrs were scrubbed empty (tcp/0).
 */
async function refreshLanHintsForRelayUpgrade(
  mesh: EnvoyMesh,
  transportPeerId: string,
): Promise<string[]> {
  if (typeof mesh.refreshPeerListenAddrsViaIdentify === "function") {
    try {
      await mesh.refreshPeerListenAddrsViaIdentify(transportPeerId);
    } catch {
      /* best-effort — keep existing peerstore */
    }
  }
  if (typeof mesh.getPeerStoreDialHints !== "function") {
    return [];
  }
  try {
    return await mesh.getPeerStoreDialHints(transportPeerId, {
      allowEphemeralPrivateLan: true,
    });
  } catch {
    return [];
  }
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

  const likelyVpnActive = detectLikelyVpnActive();
  let preferCircuitHints = shouldPreferCircuitDialHints(listenAddrs, dialHints, transportPeerId, {
    likelyVpnActive,
  });
  let sameSubnetLanFirst = false;
  let skipIdentifyRefresh = false;

  // PeerPath dial slot covers identify + ensurePeerReachable (not early connected returns).
  const pathIntent = inferPeerPathIntent(options);
  const acquired = await tryAcquirePeerPathDialSlot({ intent: pathIntent });
  if (!acquired) {
    return mesh.getPeerConnectionInfo(transportPeerId);
  }
  try {
    try {
      const cfg = await ctx.loadConfig();
      const profile =
        typeof cfg?.discoveryProfile === "string" ? cfg.discoveryProfile.trim() : "";
      const localListen = mesh.multiaddrs;
      // Peer-directory often only has tcp/0 high ports — keep them for same-subnet
      // evidence even though mergeDialablePeerListenAddrs strips them for dialing.
      let rawDirListen: string[] = [];
      try {
        const records = await ctx.peerDirectoryStore.listPeerRecords();
        rawDirListen = records
          .filter((r) => r.peerId === transportPeerId)
          .flatMap((r) => r.listenAddrs ?? []);
      } catch {
        /* best-effort */
      }

      // Identify over live Online-Relay to refresh tcp/0 LAN listens. Only keep
      // same-/24 or overlay addresses — foreign RFC1918 must not enter dialHints.
      let identifiedLan: string[] = [];
      if (
        shouldIdentifyBeforeVpnSkip({
          upgradeRelayToDirect: options?.upgradeRelayToDirect,
          connected: existing.connected,
          direct: existing.direct,
          likelyVpnActive,
        })
      ) {
        const refreshed = await refreshLanHintsForRelayUpgrade(mesh, transportPeerId);
        identifiedLan = refreshed.filter(
          (a) =>
            hasSameSubnetLanDialEvidence(localListen, [a], { hostNicFallback: true }) ||
            hasRfc6598OverlayDialEvidence(localListen, [a]),
        );
        if (identifiedLan.length > 0) {
          dialHints = [...new Set([...dialHints, ...identifiedLan])];
          rawDirListen = [...rawDirListen, ...privateLanListenAddrsForPersist(identifiedLan)];
        }
      }

      const policy = resolveReachabilityDialPolicy({
        transportPeerId,
        discoveryProfile: profile || undefined,
        likelyVpnActive,
        localListenAddrs: localListen,
        peerListenAddrs: [...(listenAddrs ?? []), ...rawDirListen],
        dialHints,
        upgradeRelayToDirect: options?.upgradeRelayToDirect,
      });
      preferCircuitHints = policy.preferCircuitHints;
      sameSubnetLanFirst = policy.sameSubnetLanFirst;
      dialHints = policy.dialHints;
      if (policy.skipUpgradeStayOnRelay) {
        return existing.connected ? existing : mesh.getPeerConnectionInfo(transportPeerId);
      }
      // Persist + skip second identify only when we got usable same-/24|overlay LAN.
      if (identifiedLan.length > 0 && policy.sameSubnetLanFirst) {
        const lanToPersist = privateLanListenAddrsForPersist(identifiedLan).filter((a) => {
          return (
            hasSameSubnetLanDialEvidence(localListen, [a], { hostNicFallback: true }) ||
            hasRfc6598OverlayDialEvidence(localListen, [a])
          );
        });
        if (lanToPersist.length > 0) {
          try {
            await ctx.peerDirectoryStore.mergeListenAddrsForPeerId(
              transportPeerId,
              lanToPersist,
            );
          } catch {
            /* best-effort */
          }
          skipIdentifyRefresh = true;
        }
      }
    } catch {
      /* keep heuristic */
    }

    // Scrub after same-subnet detection. On same LAN, skip the aggressive scrub —
    // mergeDialable drops tcp/0 high ports, and patching peerstore with only
    // circuits wiped mDNS-learned live listen addrs (stuck Online-Relay).
    if (!sameSubnetLanFirst && typeof mesh.scrubPeerStoreDialHints === "function") {
      const dialableListen = mergeDialablePeerListenAddrs(transportPeerId, listenAddrs, dialHints);
      void mesh.scrubPeerStoreDialHints(transportPeerId, dialableListen);
    }

    if (typeof mesh.mergePeerStoreDialHints === "function") {
      void mesh.mergePeerStoreDialHints(transportPeerId, dialHints);
    }

    // redial / stale verify may tear down; upgradeRelayToDirect must NOT — keep
    // the working relay until a Direct dial succeeds (see ensurePeerReachable).
    const tearingDown =
      options?.redial === true || (needsProbe && !options?.keepAlive);
    if (tearingDown) {
      try {
        await mesh.closeConnectionsToPeer(transportPeerId);
      } catch {
        /* ignore */
      }
    }

    const forceFreshDial =
      options?.redial === true || !existing.connected || tearingDown;
    const upgradeRelayToDirect =
      options?.upgradeRelayToDirect === true || options?.redial === true;

    const result = await ensureReachableWithLanFirstBudget({
      mesh,
      transportPeerId,
      protocol: ENVOY_CHAT_PROTOCOL,
      dialHints,
      preferCircuitHints,
      sameSubnetLanFirst,
      forceFreshDial,
      upgradeRelayToDirect,
      skipIdentifyRefresh,
      likelyVpnActive,
    });
    void ctx.flushPendingRoomSyncs();
    void ctx.flushPendingRoomMessages();
    if (result.connected) {
      markOutboundPeerVerified(transportPeerId);
      void recordLastSuccessfulDialFromMesh(ctx, transportPeerId, result).catch((err) =>
        console.warn(
          `[peer-directory] recordLastSuccessfulDial failed:`,
          err instanceof Error ? err.message : err,
        ),
      );
    }
    return result;
  } finally {
    releasePeerPathDialSlot(pathIntent);
  }
}

async function recordLastSuccessfulDialFromMesh(
  ctx: Pick<OutboundMessagingContext, "peerDirectoryStore" | "requireMesh" | "getReachableMesh">,
  transportPeerId: string,
  info: { connected: boolean; direct: boolean },
): Promise<void> {
  if (!info.connected) return;
  const mesh = ctx.getReachableMesh() ?? ctx.requireMesh();
  const remote =
    typeof mesh.getPeerRemoteMultiaddr === "function"
      ? mesh.getPeerRemoteMultiaddr(transportPeerId)?.trim()
      : undefined;
  if (!remote) return;
  // Prefer a dialable form that still names this peer (append /p2p/<id> when missing).
  let dialHint = remote;
  if (!dialHint.includes(`/p2p/${transportPeerId}`) && !dialHint.endsWith(`/p2p/${transportPeerId}`)) {
    dialHint = `${dialHint.replace(/\/$/, "")}/p2p/${transportPeerId}`;
  }
  if (!isMultiaddrPeerIdsValid(dialHint)) return;
  await ctx.peerDirectoryStore.recordLastSuccessfulDial({
    peerId: transportPeerId,
    dialHint,
    path: info.direct ? "direct" : "relay",
  });
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
  const libp2pConnected =
    conn.connected || mesh.getConnectedPeerIds().includes(transportPeerId);
  let dialHints: string[];
  // Direct + connected: reuse with empty hints. Relay / offline: keep circuit +
  // LAN hints so the first attempt can open a stream without relying solely on
  // a Mac-initiated inbound circuit (common Win→Mac failure after dual restart).
  if (libp2pConnected && conn.direct) {
    dialHints = [];
  } else {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      10_000,
      "_dialHintsForChat",
    );
  }

  const sameSubnetForSend = hasSameSubnetLanDialEvidence(
    mesh.multiaddrs,
    [...(listenAddrs ?? []), ...dialHints],
    { hostNicFallback: true },
  );
  // Same-subnet: do not scrub mDNS/identify tcp/0 listen addrs out of peerstore.
  if (!sameSubnetForSend && typeof mesh.scrubPeerStoreDialHints === "function") {
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

  // Local Ext Agent threads use targetOwnerId === bridge agentPeerId (envoy_agent_*).
  // resolveRecipientEnvelopePeerId intentionally returns undefined without a device
  // key — fine for human peers (no misaddress filter) but the bridge requires an
  // exact recipientPeerId match before POST /message to Hermes/HomeClaw.
  const bridgeAgentPeerId = ctx.getBridgeAgentPeerId()?.trim();
  const addressingLocalBridge =
    Boolean(bridgeAgentPeerId) &&
    targetOwnerId === bridgeAgentPeerId &&
    transportPeerId === mesh.peerId;
  const envelopeRecipientPeerId = addressingLocalBridge
    ? bridgeAgentPeerId
    : recipientEnvelopePeerId;
  const envelopeRecipientRole =
    addressingLocalBridge || targetOwnerId.startsWith("envoy_agent_")
      ? ("agent" as const)
      : ("human" as const);

  const envelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: derivePeerId(selfProfile.device.publicKeyPem),
      senderPublicKey: selfProfile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: envelopeRecipientPeerId,
      recipientRole: envelopeRecipientRole,
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

  const buildEmittedMsg = (
    deliveryReceipt: "pending" | "sent" | "delivered" | "failed",
  ): ChatMessage => ({
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
  });

  // Emit to local UIs (Social / EnvoyGo) *before* waiting on P2P dial/ack.
  // Voice notes + attachments were appearing only after delivery finished,
  // which felt like a multi-second hang on the sender.
  const bridgeHandler = ctx.getBridgeChatHandler();
  const isLocalBridge = transportPeerId === mesh.peerId && Boolean(bridgeHandler);
  if (!isLocalBridge) {
    const early = buildEmittedMsg("sent");
    console.log(`[sendChat] Emitting chat:message locally (pre-delivery):`, early);
    ctx.persistChatMessage(targetOwnerId, early);
    ctx.emitChatMessage(early);
  }

  let deliverResult: ChatDeliverResult = { delivered: false };
  try {
    if (isLocalBridge && bridgeHandler) {
      console.log(`[sendChat] self-send to ${targetOwnerId}, routing via bridge handler`);
      await bridgeHandler(envelope, mesh.peerId);
      deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
    } else {
      // Online-Direct can be half-open (common after Windows sleep / asymmetric LAN).
      // Only skip the delivery ack when this peer was recently path-verified; otherwise
      // wait for chat.delivered so hung streams fail fast and retry.
      const skipAck =
        conn.connected &&
        conn.direct &&
        isOutboundPeerRecentlyVerified(transportPeerId);
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
  if (isLocalBridge) {
    const emittedMsg = buildEmittedMsg(deliveryReceipt);
    console.log(`[sendChat] Emitting chat:message locally:`, emittedMsg);
    ctx.persistChatMessage(targetOwnerId, emittedMsg);
    ctx.emitChatMessage(emittedMsg);
  }
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
