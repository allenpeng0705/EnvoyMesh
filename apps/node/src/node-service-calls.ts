/**
 * Voice/Video calls runtime (Phase 38).
 *
 * Extracted from `node-service-impl.ts`. Wraps the existing
 * `CallManager` (which already owns per-call state-machine) and the
 * signed-envelope dispatch path.
 */
import { randomUUID } from "node:crypto";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
} from "@envoymesh/local-store";
import { isPrivateLanTcpDialHint, type EnvoyMesh } from "@envoymesh/network";
import {
  createCallHangupPayload,
  createCallIceCandidatePayload,
  createCallMutePayload,
  createCallRejectPayload,
  createUnsignedEnvelope,
  type CallRejectPayload,
  type EnvoyEnvelope,
  type UnsignedEnvoyEnvelope,
} from "@envoymesh/protocol";
import type {
  CallEvent,
  CallMediaType,
  CallSession,
  NodeProfile,
  PeerConnectionInfo,
  WarmContactConnectionOptions,
} from "@envoymesh/api";
import type { CallManager } from "./call-manager.js";
import type { ChatDeliverResult } from "./chat-outbound-deliver.js";
import { mergeDialablePeerListenAddrs } from "./outbound-dial-hints.js";
import {
  pickConnectedTransportForOwner,
  pickLibp2pFromConnectedPeers,
} from "./peer-transport-resolve.js";
import { raceWithTimeout, type TransportCacheEntry } from "./node-service-outbound-messaging.js";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";

/* ---------- effectiveCallIceServers ---------- */

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.miwifi.com:3478" },
  { urls: "stun:stun.nextcloud.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export async function effectiveCallIceServersViaRuntime(
  ctx: CallContext,
  callerSupplied?: IceServerConfig[],
): Promise<IceServerConfig[]> {
  // Explicit `[]` means "no STUN/TURN" — do not inject defaults.
  if (callerSupplied !== undefined) return callerSupplied;
  const config = (await ctx.loadConfig()) as {
    iceServers?: IceServerConfig[];
    discoveryProfile?: string;
  } | null;
  if (config?.iceServers && config.iceServers.length > 0) return config.iceServers;
  // Always ship lightweight STUN defaults. Social caps ICE gathering (~300ms)
  // so unreachable servers (e.g. Google from CN) cannot block the invite.
  // Empty ICE left some LAN calls stuck on "Connecting…" with no media path.
  return DEFAULT_ICE_SERVERS;
}

export interface CallContextTransportDeps {
  getMesh(): EnvoyMesh | undefined;
  requireMesh(): EnvoyMesh;
  resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }>;
  warmContactConnection(
    peerOwnerId: string,
    options?: WarmContactConnectionOptions,
  ): Promise<PeerConnectionInfo>;
  dialHintsForChat(
    recipientPeerId: string,
    peerListenAddrs: string[] | undefined,
  ): Promise<string[]>;
  deliverCallEnvelope(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
    dialHints: string[],
    listenAddrs?: string[],
    preferCircuitHints?: boolean,
  ): Promise<ChatDeliverResult>;
  deliverCallEnvelopeToTransportPeer(
    transportPeerId: string,
    envelope: EnvoyEnvelope,
  ): Promise<void>;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  /** Owner id → last known libp2p transport (`_lastLibp2pTransportByOwner`). */
  transportCache: Map<string, TransportCacheEntry>;
  taskStore: LocalTaskStore | undefined;
}

export interface CallContextCore {
  /** The existing per-call state-machine. */
  callManager: CallManager;
  /** Local node profile (or undefined if not initialised). */
  getProfile(): NodeProfile | undefined;
  /** Load the node config (used for ICE server defaults). */
  loadConfig(): Promise<unknown>;
  /**
   * Signs + delivers call response envelopes. Impl wires this to
   * `sendCallResponseEnvelopeViaRuntime`; accept/decline helpers call
   * that function directly.
   */
  sendCallResponseEnvelope(
    peerOwnerId: string,
    unsigned: UnsignedEnvoyEnvelope,
    intent: string,
  ): Promise<boolean>;
}

/** Full call runtime context; transport deps optional until impl wires them. */
export type CallContext = CallContextCore & Partial<CallContextTransportDeps>;

export type FullCallContext = CallContextCore & CallContextTransportDeps;

export function buildFullCallContext(host: any): FullCallContext {
  return {
    callManager: host.callManager,
    getProfile: () => host._profile,
    sendCallResponseEnvelope: (peerOwnerId, unsigned, intent) =>
      sendCallResponseEnvelopeViaRuntime(host._callContext(), peerOwnerId, unsigned, intent),
    loadConfig: () => host._configStore.load(),
    // CLI `node:dev` binds via bindExternalMesh → `_externalMesh` only.
    // Tauri/startNode may set `_mesh`. Match `_requireMesh` / chat paths.
    getMesh: () => host._mesh ?? host._externalMesh,
    requireMesh: () => host._requireMesh(),
    resolvePeerTransportForOwner: (targetOwnerId) => host._resolvePeerTransportForOwner(targetOwnerId),
    warmContactConnection: (peerOwnerId, options) => host.warmContactConnection(peerOwnerId, options),
    dialHintsForChat: (recipientPeerId, peerListenAddrs) =>
      host._dialHintsForChat(recipientPeerId, peerListenAddrs),
    deliverCallEnvelope: (transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints) =>
      host._deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs, preferCircuitHints),
    deliverCallEnvelopeToTransportPeer: (transportPeerId, envelope) =>
      host.deliverCallEnvelopeToTransportPeer(transportPeerId, envelope),
    trustStore: host._trustStore,
    peerDirectoryStore: host._peerDirectoryStore,
    transportCache: host._lastLibp2pTransportByOwner,
    taskStore: host._taskStore,
  };
}

function hasCallTransportDeps(ctx: CallContext): ctx is FullCallContext {
  return (
    typeof ctx.getMesh === "function" &&
    typeof ctx.requireMesh === "function" &&
    typeof ctx.resolvePeerTransportForOwner === "function" &&
    typeof ctx.warmContactConnection === "function" &&
    typeof ctx.dialHintsForChat === "function" &&
    typeof ctx.deliverCallEnvelope === "function" &&
    typeof ctx.deliverCallEnvelopeToTransportPeer === "function" &&
    ctx.trustStore !== undefined &&
    ctx.peerDirectoryStore !== undefined &&
    ctx.transportCache !== undefined
  );
}

/**
 * Call signaling only: when already on a direct path, keep LAN/direct.
 * When not connected, prefer relay circuits first so stale RFC1918 listen
 * addrs cannot burn the ring window (callee never rings). LAN is still
 * tried as a short fallback inside deliver — not dropped.
 */
export async function preferCircuitHintsForCallDelivery(
  ctx: Pick<CallContextCore, "loadConfig">,
  conn: { connected?: boolean; direct: boolean },
): Promise<boolean> {
  if (conn.direct) return false;
  if (conn.connected) return false;
  // Not connected — circuit-first for invite reliability (restores pre-regression
  // behavior when LAN dials hang and relay still works).
  return true;
}

/* ---------- passthroughs ---------- */

export function getActiveCallViaRuntime(ctx: CallContext): CallSession | null {
  return ctx.callManager.getActiveCall();
}

export function onCallEventViaRuntime(
  ctx: CallContext,
  handler: (event: CallEvent) => void,
): () => void {
  return ctx.callManager.onCallEvent(handler);
}

/* ---------- recordCallRejected ---------- */

export function recordCallRejectedViaRuntime(ctx: CallContext, callId: string, _reason: string): void {
  // Let CallManager emit the canonical `call:rejected` event so the UI
  // sees a single source of truth. Swallow any state-machine rejection
  // (e.g. the call already ended) — this is best-effort cleanup.
  try {
    ctx.callManager.rejectCall(
      callId,
      "error" as "busy" | "declined" | "offline" | "error" | "no_answer",
    );
  } catch {
    // best-effort
  }
}

/* ---------- sendCallResponseEnvelope ---------- */

/**
 * Phase 42B — common helper that resolves the peer's owner ID → device
 * peer ID, stamps `recipientPeerId` on the **unsigned** envelope, then
 * signs and sends through `deliverCallEnvelope` so retries + ack-skip
 * match the call path.
 */
export async function sendCallResponseEnvelopeViaRuntime(
  ctx: CallContext,
  peerOwnerId: string,
  unsigned: UnsignedEnvoyEnvelope,
  _intent: string,
): Promise<boolean> {
  if (!hasCallTransportDeps(ctx)) {
    return ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, _intent);
  }
  const profile = ctx.getProfile();
  if (!profile) return false;
  try {
    // Fast path: if we have a cached transport peer ID from the inbound
    // call.invite connection and the peer is still connected, send directly
    // without re-resolving transport or dialing. This is critical for ICE
    // candidates which must be delivered with minimal latency.
    const callId =
      typeof unsigned.payload === "object" &&
      unsigned.payload !== null &&
      "callId" in unsigned.payload
        ? String((unsigned.payload as { callId?: string }).callId)
        : undefined;
    const cachedPeerId = callId ? ctx.callManager.getSessionRemoteTransportPeerId(callId) : null;
    if (cachedPeerId) {
      const mesh = ctx.requireMesh();
      const conn = mesh.getPeerConnectionInfo(cachedPeerId);
      if (conn.connected || mesh.getConnectedPeerIds().includes(cachedPeerId)) {
        try {
          // Quick transport resolve just for recipientEnvelopePeerId —
          // transportCache makes this a fast map lookup.
          const transport = await ctx.resolvePeerTransportForOwner(peerOwnerId);
          unsigned.recipientPeerId = transport.recipientEnvelopePeerId;
          const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
          await ctx.deliverCallEnvelopeToTransportPeer(cachedPeerId, envelope as EnvoyEnvelope);
          webrtcCallTrace("call-response:fast", {
            intent: _intent,
            peer: shortCallId(cachedPeerId),
          });
          return true;
        } catch {
          // Fast path failed — fall through to full delivery.
          webrtcCallTrace("call-response:fast-failed-fallback", { intent: _intent });
        }
      }
    }

    const transport = await ctx.resolvePeerTransportForOwner(peerOwnerId);
    const mesh = ctx.requireMesh();
    const records = await ctx.peerDirectoryStore.listPeerRecords();
    const connectedPeerIds = mesh.getConnectedPeerIds();
    const liveConnected = pickConnectedTransportForOwner(
      records,
      peerOwnerId,
      connectedPeerIds,
      ctx.transportCache,
    );
    let targetPeerId = liveConnected?.peerId ?? transport.transportPeerId;
    let listenAddrs = liveConnected?.listenAddrs ?? transport.listenAddrs;
    let conn = mesh.getPeerConnectionInfo(targetPeerId);
    if (!conn.connected) {
      targetPeerId = transport.transportPeerId;
      listenAddrs = transport.listenAddrs;
      conn = mesh.getPeerConnectionInfo(targetPeerId);
    }
    if (!conn.connected) {
      try {
        await mesh.dial(targetPeerId);
        conn = mesh.getPeerConnectionInfo(targetPeerId);
      } catch {
        /* try listen addrs */
      }
    }
    if (!conn.connected) {
      const addrs = (listenAddrs ?? []).map((a) => a.trim()).filter(Boolean);
      if (addrs.length > 0) {
        // Order by expected speed: LAN TCP first, then direct TCP, then circuits.
        const ordered = [...addrs].sort((a, b) => {
          const aLan = isPrivateLanTcpDialHint(a) ? 1 : 0;
          const bLan = isPrivateLanTcpDialHint(b) ? 1 : 0;
          if (aLan !== bLan) return bLan - aLan;
          const aCircuit = a.includes("/p2p-circuit/") ? 1 : 0;
          const bCircuit = b.includes("/p2p-circuit/") ? 1 : 0;
          if (aCircuit !== bCircuit) return aCircuit - bCircuit;
          return 0;
        });
        // Try addresses sequentially in speed order — stops at first success.
        for (const addr of ordered) {
          try {
            await mesh.dial(addr);
            conn = mesh.getPeerConnectionInfo(transport.transportPeerId);
            targetPeerId = transport.transportPeerId;
            if (conn.connected) break;
          } catch {
            /* try next addr */
          }
        }
      }
    }
    const preferCircuitHints = await preferCircuitHintsForCallDelivery(ctx, conn);
    let dialHints: string[];
    try {
      dialHints = await raceWithTimeout(
        ctx.dialHintsForChat(targetPeerId, listenAddrs),
        10_000,
        "_dialHintsForChat",
      );
    } catch (hintErr) {
      console.warn(
        `[call-response] dial hints failed for ${peerOwnerId}, using listen addrs:`,
        hintErr instanceof Error ? hintErr.message : hintErr,
      );
      dialHints = mergeDialablePeerListenAddrs(targetPeerId, listenAddrs ?? []);
    }
    // Stamp the recipient device peer id BEFORE signing — the signature
    // covers canonical JSON of the unsigned envelope.
    unsigned.recipientPeerId = transport.recipientEnvelopePeerId;
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
    const deliverResult = await ctx.deliverCallEnvelope(
      targetPeerId,
      envelope,
      conn.connected ? [] : dialHints,
      conn.connected ? [] : listenAddrs,
      preferCircuitHints,
    );
    if (!deliverResult.delivered) {
      webrtcCallWarn("call-response:not-delivered", {
        intent: _intent,
        peer: shortCallId(targetPeerId),
        callId: shortCallId(
          typeof unsigned.payload === "object" &&
            unsigned.payload !== null &&
            "callId" in unsigned.payload
            ? String((unsigned.payload as { callId?: string }).callId)
            : undefined,
        ),
      });
      console.warn(
        `[call-response] could not deliver ${_intent} to ${peerOwnerId.slice(0, 24)}…`,
      );
      return false;
    }
    webrtcCallTrace("call-response:delivered", {
      intent: _intent,
      peer: shortCallId(targetPeerId),
    });
    return true;
  } catch (err) {
    console.warn(
      `[call-response] could not deliver ${_intent} to ${peerOwnerId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/* ---------- sendCallInvite ---------- */

export async function sendCallInviteViaRuntime(
  ctx: FullCallContext,
  targetOwnerId: string,
  sdpOffer: string,
  iceServers?: IceServerConfig[],
  callType: CallMediaType = "audio",
): Promise<string | null> {
  console.log(`[sendCallInvite] invoked target=${targetOwnerId.slice(0, 24)} sdpLen=${sdpOffer.length}`);
  const profile = ctx.getProfile();
  if (!profile) {
    console.warn(`[sendCallInvite] aborted: no local profile`);
    return null;
  }
  if (!ctx.getMesh()) {
    console.warn(`[sendCallInvite] aborted: mesh not bound (_mesh/_externalMesh)`);
    return null;
  }

  // The schema requires a real UUID — the stub used a non-UUID string
  // that would fail `parseCallInvitePayload` on the receiving side.
  const callId = randomUUID();
  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  webrtcCallTrace("sendCallInvite:start", {
    callId: shortCallId(callId),
    target: shortCallId(targetOwnerId),
    sdpLen: sdpOffer.length,
    path2: Boolean(iceServers?.length),
  });
  const trust = await ctx.trustStore.getTrustRecord(targetOwnerId);
  const peerDisplayName = trust?.displayName?.trim() || targetOwnerId;

  const initiated = ctx.callManager.outboundCallInitiated(
    callId,
    profile.owner.ownerId,
    targetOwnerId,
    peerDisplayName,
    callType,
  );
  if (!initiated) {
    console.warn(`[sendCallInvite] aborted: call manager busy (active call already exists)`);
    return null;
  }

  let transport;
  try {
    transport = await ctx.resolvePeerTransportForOwner(targetOwnerId);
  } catch (err) {
    webrtcCallWarn("sendCallInvite:transport-resolve-failed", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
      error: err instanceof Error ? err.message.slice(0, 120) : String(err),
    });
    console.warn(`[sendCallInvite] peer transport resolve failed for ${targetOwnerId}:`, err);
    recordCallRejectedViaRuntime(ctx, callId, "peer_unreachable");
    return null;
  }
  const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = transport;

  const mesh = ctx.requireMesh();
  const records = await ctx.peerDirectoryStore.listPeerRecords();
  const connectedPeerIds = mesh.getConnectedPeerIds();
  const liveConnected = pickConnectedTransportForOwner(
    records,
    targetOwnerId,
    connectedPeerIds,
    ctx.transportCache,
  );
  const targetPeerId = liveConnected?.peerId ?? transportPeerId;
  const connBeforeWarm = mesh.getPeerConnectionInfo(targetPeerId);
  webrtcCallTrace("sendCallInvite:transport-ready", {
    callId: shortCallId(callId),
    target: shortCallId(targetOwnerId),
    transport: shortCallId(targetPeerId),
    connected: connBeforeWarm.connected,
    direct: connBeforeWarm.direct,
  });
  console.log(
    `[sendCallInvite] target=${targetOwnerId.slice(0, 24)} transport=${targetPeerId.slice(0, 12)} connected=${connBeforeWarm.connected} direct=${connBeforeWarm.direct}`,
  );

  // Do NOT warm before invite. Concurrent warm+deliver dials raced, and a
  // half-open "connected" path made sendChat report success while the callee
  // never received call.invite (Win never rings). Delivery dials below.

  const effectiveIceServers = await effectiveCallIceServersViaRuntime(ctx, iceServers);

  let dialHints: string[];
  try {
    dialHints = await raceWithTimeout(
      ctx.dialHintsForChat(targetPeerId, listenAddrs),
      5_000,
      "_dialHintsForChat",
    );
  } catch (hintErr) {
    console.warn(
      `[sendCallInvite] dial hints failed for ${targetOwnerId}, using listen addrs:`,
      hintErr instanceof Error ? hintErr.message : hintErr,
    );
    dialHints = mergeDialablePeerListenAddrs(transportPeerId, listenAddrs ?? []);
  }

  const connForPrefer = mesh.getPeerConnectionInfo(targetPeerId);
  const preferCircuitHints = await preferCircuitHintsForCallDelivery(ctx, connForPrefer);

  const { createCallInvitePayload, createUnsignedEnvelope: createUnsignedEnvelopeFn } =
    await import("@envoymesh/protocol");

  const invitePayload = createCallInvitePayload({
    callId,
    callerOwnerId: profile.owner.ownerId,
    callerPeerId: senderPeerId,
    callType,
    sdpOffer,
    iceServers: effectiveIceServers,
  });

  const unsigned = createUnsignedEnvelopeFn({
    intent: "call.invite",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: recipientEnvelopePeerId,
    senderRole: "human",
    recipientRole: "human",
    payload: invitePayload,
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;

  // Store the transport peer ID on the outbound session so response
  // delivery (ICE candidates, accept, etc.) can use the fast path.
  ctx.callManager.setOutboundTransportPeerId(callId, targetPeerId);

  let deliverResult: ChatDeliverResult;
  try {
    // Always go through deliverCallEnvelope — it sendChats when already
    // connected and falls back to dial+retry. Never mark delivered from a
    // bare sendChat that can succeed against a stale libp2p session.
    deliverResult = await ctx.deliverCallEnvelope(
      targetPeerId,
      envelope,
      dialHints,
      listenAddrs,
      preferCircuitHints,
    );
  } catch (deliverErr) {
    const detail = deliverErr instanceof Error ? deliverErr.message : String(deliverErr);
    webrtcCallWarn("sendCallInvite:delivery-failed", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
      error: detail.slice(0, 120),
    });
    console.warn(`[sendCallInvite] call.invite delivery failed callId=${callId}:`, detail);
    ctx.callManager.reportOutboundDeliveryFailed(
      callId,
      "Could not reach contact — check relay connection and try again.",
    );
    if (ctx.taskStore) {
      await ctx.taskStore
        .appendAuditEvent(
          createAuditEvent({
            type: "message.rejected",
            intent: "call.invite",
            outcome: "deny",
            summary: `call.invite delivery failed callId=${callId}: ${detail}`,
            remotePeerId: targetOwnerId,
          }),
        )
        .catch(() => undefined);
    }
    return null;
  }

  if (!deliverResult.delivered) {
    const detail = "No reachable path to contact before call.invite send";
    webrtcCallWarn("sendCallInvite:delivery-not-delivered", {
      callId: shortCallId(callId),
      target: shortCallId(targetOwnerId),
    });
    console.warn(`[sendCallInvite] call.invite delivery failed callId=${callId}:`, detail);
    ctx.callManager.reportOutboundDeliveryFailed(
      callId,
      "Could not reach contact — check relay connection and try again.",
    );
    if (ctx.taskStore) {
      await ctx.taskStore
        .appendAuditEvent(
          createAuditEvent({
            type: "message.rejected",
            intent: "call.invite",
            outcome: "deny",
            summary: `call.invite delivery failed callId=${callId}: ${detail}`,
            remotePeerId: targetOwnerId,
          }),
        )
        .catch(() => undefined);
    }
    return null;
  }

  if (ctx.taskStore) {
    await ctx.taskStore
      .appendAuditEvent(
        createAuditEvent({
          type: "message.sent",
          intent: "call.invite",
          outcome: "allow",
          summary: `call.invite sent to ${targetOwnerId} callId=${callId}`,
          remotePeerId: targetOwnerId,
        }),
      )
      .catch(() => undefined);
  }

  console.log(`[sendCallInvite] call.invite delivered to ${targetOwnerId} callId=${callId}`);
  webrtcCallTrace("sendCallInvite:delivered", {
    callId: shortCallId(callId),
    target: shortCallId(targetOwnerId),
  });

  // NOTE (Phase 42I): the VoIP push is NOT dispatched from the caller's
  // home here. The callee's phone registers its VoIP token with ITS OWN
  // owner's home, so the caller's home has no token for the callee.
  // The dispatch lives on the callee's side, in call-inbound.ts
  // handleCallInvite (gated on the phone having no authenticated WS).

  return callId;
}

/* ---------- sendCallReinvite ---------- */

export async function sendCallReinviteViaRuntime(
  ctx: FullCallContext,
  callId: string,
  sdpOffer: string,
  iceServers?: IceServerConfig[],
  reason: "path1_timeout" | "path1_failed" = "path1_timeout",
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile || !ctx.getMesh()) return false;

  const callerOwnerId = profile.owner.ownerId;
  if (!ctx.callManager.canSendOutboundReinvite(callId, callerOwnerId)) return false;

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) return false;

  const effectiveIceServers = await effectiveCallIceServersViaRuntime(ctx, iceServers);
  if (effectiveIceServers.length === 0) return false;

  let transport;
  try {
    transport = await ctx.resolvePeerTransportForOwner(peerOwnerId);
  } catch (err) {
    console.warn(`[sendCallReinvite] peer transport resolve failed for ${peerOwnerId}:`, err);
    return false;
  }
  const { transportPeerId, recipientEnvelopePeerId, listenAddrs } = transport;

  const mesh = ctx.requireMesh();
  let conn = mesh.getPeerConnectionInfo(transportPeerId);
  if (!conn.connected) {
    for (const addr of listenAddrs ?? []) {
      const trimmed = addr.trim();
      if (!trimmed) continue;
      try {
        await mesh.dial(trimmed);
        conn = mesh.getPeerConnectionInfo(transportPeerId);
        if (conn.connected) break;
      } catch {
        /* try next addr */
      }
    }
  }
  const preferCircuitHints = await preferCircuitHintsForCallDelivery(ctx, conn);

  const dialHints = await raceWithTimeout(
    ctx.dialHintsForChat(transportPeerId, listenAddrs),
    30_000,
    "_dialHintsForChat",
  );

  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  const { createCallReinvitePayload, createUnsignedEnvelope: createUnsignedEnvelopeFn } =
    await import("@envoymesh/protocol");

  const reinvitePayload = createCallReinvitePayload({
    callId,
    callerOwnerId,
    callerPeerId: senderPeerId,
    sdpOffer,
    iceServers: effectiveIceServers,
    reason,
    transportPath: "path2",
  });

  const unsigned = createUnsignedEnvelopeFn({
    intent: "call.reinvite",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientPeerId: recipientEnvelopePeerId,
    senderRole: "human",
    recipientRole: "human",
    payload: reinvitePayload,
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem) as EnvoyEnvelope;

  const records = await ctx.peerDirectoryStore.listPeerRecords();
  const liveConnected = pickLibp2pFromConnectedPeers(
    records,
    peerOwnerId,
    mesh.getConnectedPeerIds(),
  );
  const targetPeerId = liveConnected?.peerId ?? transportPeerId;
  conn = mesh.getPeerConnectionInfo(targetPeerId);

  let deliverResult: ChatDeliverResult;
  try {
    if (conn.connected || mesh.getConnectedPeerIds().includes(targetPeerId)) {
      await mesh.sendChat(targetPeerId, envelope, { dialHints: [] });
      deliverResult = { delivered: true, deliveredAt: new Date().toISOString() };
    } else {
      deliverResult = await ctx.deliverCallEnvelope(
        targetPeerId,
        envelope,
        dialHints,
        listenAddrs,
        preferCircuitHints,
      );
    }
  } catch (deliverErr) {
    console.warn(
      `[sendCallReinvite] call.reinvite delivery failed callId=${callId}:`,
      deliverErr instanceof Error ? deliverErr.message : deliverErr,
    );
    return false;
  }

  if (ctx.taskStore) {
    await ctx.taskStore
      .appendAuditEvent(
        createAuditEvent({
          type: deliverResult.delivered ? "message.sent" : "message.rejected",
          intent: "call.reinvite",
          outcome: deliverResult.delivered ? "allow" : "deny",
          summary: deliverResult.delivered
            ? `call.reinvite sent callId=${callId} reason=${reason}`
            : `call.reinvite delivery failed callId=${callId}`,
          remotePeerId: peerOwnerId,
        }),
      )
      .catch(() => undefined);
  }

  return deliverResult.delivered;
}

/* ---------- endCall / declineCallInvite / setCallMuted ---------- */

export async function endCallViaRuntime(
  ctx: CallContext,
  callId: string,
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile) return false;

  const ended = ctx.callManager.hangupCall(callId, "normal");
  if (!ended) return false;

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) {
    // Local-only session — no peer to notify.
    return true;
  }

  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  const payload = createCallHangupPayload({ callId, reason: "normal" });
  const unsigned = createUnsignedEnvelope({
    intent: "call.hangup",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  await sendCallResponseEnvelopeViaRuntime(ctx, peerOwnerId, unsigned, "call.hangup");
  return true;
}

export async function setCallMutedViaRuntime(
  ctx: CallContext,
  callId: string,
  muted: boolean,
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile) return false;

  const updated = ctx.callManager.setMute(callId, muted);
  if (!updated) return false;

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) return false;

  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  const payload = createCallMutePayload({ callId, muted });
  const unsigned = createUnsignedEnvelope({
    intent: "call.mute",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  await sendCallResponseEnvelopeViaRuntime(ctx, peerOwnerId, unsigned, "call.mute");
  return true;
}

export async function declineCallInviteViaRuntime(
  ctx: CallContext,
  callId: string,
  reason: "busy" | "declined" | "offline" | "error" | "no_answer",
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile) return false;

  const rejected = ctx.callManager.rejectCall(callId, reason);
  if (!rejected) return false;

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) return false;

  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  const payload = createCallRejectPayload({
    callId,
    calleeOwnerId: profile.owner.ownerId,
    calleePeerId: senderPeerId,
    reason,
  });
  const unsigned = createUnsignedEnvelope({
    intent: "call.reject",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  await sendCallResponseEnvelopeViaRuntime(ctx, peerOwnerId, unsigned, "call.reject");
  return true;
}

/* ---------- sendIceCandidate ---------- */

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export async function sendIceCandidateViaRuntime(
  ctx: CallContext,
  callId: string,
  candidate: IceCandidatePayload,
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile) return false;
  const status = ctx.callManager.getSessionStatus(callId);
  if (status !== "ringing" && status !== "active") return false;

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) return false;

  const senderPeerId = derivePeerId(profile.device.publicKeyPem);
  const payload = createCallIceCandidatePayload({ callId, candidate });
  const unsigned = createUnsignedEnvelope({
    intent: "call.ice-candidate",
    senderPeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  await sendCallResponseEnvelopeViaRuntime(ctx, peerOwnerId, unsigned, "call.ice-candidate");
  return true;
}

/* ---------- acceptCallInvite / sendCallRejectToOwner ---------- */

export async function acceptCallInviteViaRuntime(
  ctx: CallContext,
  callId: string,
  sdpAnswer: string,
  iceServers?: IceServerConfig[],
): Promise<boolean> {
  const profile = ctx.getProfile();
  if (!profile) return false;

  const calleeOwnerId = profile.owner.ownerId;
  const calleePeerId = derivePeerId(profile.device.publicKeyPem);

  const peerOwnerId = ctx.callManager.getSessionPeerOwnerId(callId);
  if (!peerOwnerId) return false;

  const sessionStatus = ctx.callManager.getSessionStatus(callId);
  if (sessionStatus !== "ringing" && sessionStatus !== "active") return false;

  const { createCallAcceptPayload } = await import("@envoymesh/protocol");

  const payload = createCallAcceptPayload({
    callId,
    calleeOwnerId,
    calleePeerId,
    sdpAnswer,
    iceServers,
  });

  const unsigned = createUnsignedEnvelope({
    intent: "call.accept",
    senderPeerId: calleePeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  const delivered = await sendCallResponseEnvelopeViaRuntime(ctx, peerOwnerId, unsigned, "call.accept");
  if (!delivered) return false;

  if (sessionStatus === "ringing") {
    const accepted = ctx.callManager.acceptInboundCall(callId, calleeOwnerId);
    if (!accepted) return false;
  }
  return true;
}

export async function sendCallRejectToOwnerViaRuntime(
  ctx: CallContext,
  callId: string,
  callerOwnerId: string,
  reason: CallRejectPayload["reason"],
): Promise<void> {
  const profile = ctx.getProfile();
  if (!profile) return;

  const calleePeerId = derivePeerId(profile.device.publicKeyPem);
  const payload = createCallRejectPayload({
    callId,
    calleeOwnerId: profile.owner.ownerId,
    calleePeerId,
    reason,
  });
  const unsigned = createUnsignedEnvelope({
    intent: "call.reject",
    senderPeerId: calleePeerId,
    senderPublicKey: profile.device.publicKeyPem,
    recipientRole: "human",
    payload,
  });
  await sendCallResponseEnvelopeViaRuntime(ctx, callerOwnerId, unsigned, "call.reject");
}
