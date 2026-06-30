/**
 * Voice/Video calls runtime (Phase 38).
 *
 * Extracted from `node-service-impl.ts`. Wraps the existing
 * `CallManager` (which already owns per-call state-machine) and the
 * signed-envelope dispatch path. The runtime's contract is small:
 * it builds the right `call.*` payload, signs it, and hands it to
 * the class's `_sendCallResponseEnvelope` helper.
 *
 * The big methods (`sendCallInvite`, `sendCallReinvite`,
 * `acceptCallInvite`, `_sendCallResponseEnvelope` itself) stay on
 * the class — they pull in mesh transport, ICE config, and the
 * sign-and-deliver pipeline. This commit extracts the
 * send-response / mute / hangup / reject / ice-candidate helpers
 * which all share the same "build payload, sign, send" shape.
 */
import { derivePeerId } from "@envoymesh/identity";
import {
  createCallHangupPayload,
  createCallIceCandidatePayload,
  createCallMutePayload,
  createCallRejectPayload,
  createUnsignedEnvelope,
  type CallRejectPayload,
  type UnsignedEnvoyEnvelope,
} from "@envoymesh/protocol";
import type { CallManager } from "./call-manager.js";
import type { CallEvent, CallSession, NodeProfile } from "@envoymesh/api";

/* ---------- effectiveCallIceServers ---------- */

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

const DEFAULT_ICE_SERVERS: IceServerConfig[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

export async function effectiveCallIceServersViaRuntime(
  ctx: CallContext,
  callerSupplied?: IceServerConfig[],
): Promise<IceServerConfig[]> {
  // Explicit `[]` means "no STUN/TURN" — do not inject defaults.
  if (callerSupplied !== undefined) return callerSupplied;
  const config = (await ctx.loadConfig()) as { iceServers?: IceServerConfig[] } | null;
  if (config?.iceServers && config.iceServers.length > 0) return config.iceServers;
  return DEFAULT_ICE_SERVERS;
}

export interface CallContext {
  /** The existing per-call state-machine. */
  callManager: CallManager;
  /** Local node profile (or undefined if not initialised). */
  getProfile(): NodeProfile | undefined;
  /** Class's private helper that signs + delivers the unsigned envelope. */
  sendCallResponseEnvelope(
    peerOwnerId: string,
    unsigned: UnsignedEnvoyEnvelope,
    intent: string,
  ): Promise<boolean>;
  /** Load the node config (used for ICE server defaults). */
  loadConfig(): Promise<unknown>;
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
  await ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, "call.hangup");
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
  await ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, "call.mute");
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
  await ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, "call.reject");
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
  await ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, "call.ice-candidate");
  return true;
}

/* ---------- sendCallRejectToOwner (busy path — no local session) ---------- */

/* ---------- acceptCallInvite ---------- */

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

  const { createCallAcceptPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");

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
  const delivered = await ctx.sendCallResponseEnvelope(peerOwnerId, unsigned, "call.accept");
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
  await ctx.sendCallResponseEnvelope(callerOwnerId, unsigned, "call.reject");
}