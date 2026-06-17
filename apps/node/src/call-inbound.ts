/**
 * call-inbound.ts — Phase 38 call.* intent handler.
 *
 * Routes inbound `call.invite`, `call.accept`, `call.reject`,
 * `call.hangup`, `call.ice-candidate`, and `call.mute` envelopes
 * through the `CallManager` state machine with identity binding
 * and callId validation per the design doc §4.0.
 */

import {
  parseCallInvitePayload,
  parseCallAcceptPayload,
  parseCallRejectPayload,
  parseCallIceCandidatePayload,
  parseCallHangupPayload,
  parseCallMutePayload,
  createCallRejectPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { CallManager } from "./call-manager.js";
import type { LocalTrustStore, LocalPeerDirectoryStore } from "@envoymesh/local-store";

export interface CallInboundDeps {
  callManager: CallManager;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  /** Callback to send a signed envelope back to the remote party. */
  sendResponseEnvelope: (envelope: EnvoyEnvelope) => Promise<void>;
}

const LOG = "[call-inbound]";

/** Resolve sender's ownerId from envelope context. */
function senderOwnerId(envelope: EnvoyEnvelope): string {
  return envelope.agentCredential?.ownerId ?? envelope.senderPeerId ?? "";
}

export async function handleCallIntent(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  const { intent } = envelope;

  switch (intent) {
    case "call.invite":
      return handleCallInvite(envelope, deps);
    case "call.accept":
      return handleCallAccept(envelope, deps);
    case "call.reject":
      return handleCallReject(envelope, deps);
    case "call.hangup":
      return handleCallHangup(envelope, deps);
    case "call.ice-candidate":
      return handleCallIceCandidate(envelope, deps);
    case "call.mute":
      return handleCallMute(envelope, deps);
    default:
      return false;
  }
}

// ------------------------------------------------------------------
// call.invite
// ------------------------------------------------------------------

async function handleCallInvite(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallInvitePayload>;
  try {
    payload = parseCallInvitePayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.invite payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  // Identity binding: envelope signer must match callerOwnerId in payload
  if (senderOwner !== payload.callerOwnerId) {
    console.warn(`${LOG} call.invite identity binding failed: sender=${senderOwner} callerOwnerId=${payload.callerOwnerId}`);
    return true;
  }

  // Trust check: must be bonded (referred or direct)
  const trust = await deps.trustStore.getTrustRecord(payload.callerOwnerId);
  if (!trust || trust.level === "blocked" || trust.level === "public") {
    console.warn(`${LOG} call.invite from untrusted peer: ${payload.callerOwnerId}`);
    return true;
  }

  // Resolve display name
  const displayName = trust?.displayName ?? payload.callerOwnerId;

  deps.callManager.inboundCallReceived(
    payload.callId,
    payload.callerOwnerId,
    payload.callerPeerId,
    displayName,
    payload.sdpOffer,
  );

  return true;
}

// ------------------------------------------------------------------
// call.accept
// ------------------------------------------------------------------

async function handleCallAccept(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallAcceptPayload>;
  try {
    payload = parseCallAcceptPayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.accept payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  // Identity binding: envelope signer must match calleeOwnerId
  if (senderOwner !== payload.calleeOwnerId) {
    console.warn(`${LOG} call.accept identity binding failed`);
    return true;
  }

  if (!deps.callManager.isCallerMatch(payload.callId, payload.calleeOwnerId)) {
    console.warn(`${LOG} call.accept callee mismatch: ${payload.callId}`);
    return true;
  }

  deps.callManager.outboundCallAccepted(payload.callId);
  return true;
}

// ------------------------------------------------------------------
// call.reject
// ------------------------------------------------------------------

async function handleCallReject(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallRejectPayload>;
  try {
    payload = parseCallRejectPayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.reject payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  if (senderOwner !== payload.calleeOwnerId) {
    console.warn(`${LOG} call.reject identity binding failed`);
    return true;
  }

  deps.callManager.rejectCall(payload.callId, payload.reason);
  return true;
}

// ------------------------------------------------------------------
// call.hangup
// ------------------------------------------------------------------

async function handleCallHangup(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallHangupPayload>;
  try {
    payload = parseCallHangupPayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.hangup payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  if (!deps.callManager.isParticipant(payload.callId, senderOwner)) {
    console.warn(`${LOG} call.hangup sender not a participant: ${senderOwner}`);
    return true;
  }

  deps.callManager.hangupCall(payload.callId, payload.reason);
  return true;
}

// ------------------------------------------------------------------
// call.ice-candidate
// ------------------------------------------------------------------

async function handleCallIceCandidate(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallIceCandidatePayload>;
  try {
    payload = parseCallIceCandidatePayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.ice-candidate payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  if (!deps.callManager.isParticipant(payload.callId, senderOwner)) {
    console.warn(`${LOG} call.ice-candidate sender not a participant: ${senderOwner}`);
    return true;
  }

  console.log(`${LOG} ICE candidate for call ${payload.callId} from ${senderOwner}`);
  return true;
}

// ------------------------------------------------------------------
// call.mute
// ------------------------------------------------------------------

async function handleCallMute(
  envelope: EnvoyEnvelope,
  deps: CallInboundDeps,
): Promise<boolean> {
  let payload: ReturnType<typeof parseCallMutePayload>;
  try {
    payload = parseCallMutePayload(envelope.payload);
  } catch {
    console.warn(`${LOG} invalid call.mute payload`);
    return true;
  }

  const senderOwner = senderOwnerId(envelope);

  if (!deps.callManager.isParticipant(payload.callId, senderOwner)) {
    console.warn(`${LOG} call.mute sender not a participant: ${senderOwner}`);
    return true;
  }

  deps.callManager.setMute(payload.callId, payload.muted);
  return true;
}
