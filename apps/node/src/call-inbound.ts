/**
 * call-inbound.ts — Phase 38 call.* intent handler.
 *
 * Routes inbound `call.invite`, `call.accept`, `call.reject`,
 * `call.hangup`, `call.ice-candidate`, and `call.mute` envelopes
 * through the `CallManager` state machine with identity binding
 * and callId validation per the design doc §4.0.
 *
 * Phase 42A added defensive SDP / ICE-candidate validation
 * (validateSdpString / validateIceCandidate) so a malformed
 * payload from a bonded-but-compromised peer cannot crash the
 * callee's setRemoteDescription or flood addIceCandidate.
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

// --------------------------------------------------------------------------
// Phase 42A — defensive SDP / ICE-candidate validation
// --------------------------------------------------------------------------

/** Max bytes accepted in an SDP offer/answer (Phase 42 design §6). */
export const MAX_SDP_BYTES = 64 * 1024;

/**
 * SDP ICE candidate grammar (subset of RFC 5245 §15.1).
 *
 * Format: `candidate:<foundation> <component-id> <protocol> <priority> <address> <port> typ <type> [raddr <address>] [rport <port>] [generation <num>] [network-cost <num>]`
 *
 * The first 6 tokens after `candidate:` are mandatory; `typ <type>` is
 * mandatory; `raddr` / `rport` / `generation` / `network-cost` are optional
 * keywords each followed by their own value. The regex below matches the
 * whole line. `foundation` is a 1-32 char string of alphanumerics and `+/`.
 */
const ICE_CANDIDATE_REGEX =
  /^candidate:[A-Za-z0-9+/_-]{1,32} [0-9]+ (udp|UDP|tcp|TCP) [0-9]+ (\d+\.\d+\.\d+\.\d+|[0-9a-fA-F:]+) [0-9]+ typ (host|srflx|relay|prflx|HOST|SRFLX|RELAY|PRFLX)( raddr (\d+\.\d+\.\d+\.\d+|[0-9a-fA-F:]+))?( rport [0-9]+)?( generation [0-9]+)?( network-cost [0-9]+)?$/;

/** Returns true when [sdp] is a non-empty string within the size cap. */
export function validateSdpString(sdp: unknown): sdp is string {
  return typeof sdp === "string" && sdp.length > 0 && sdp.length <= MAX_SDP_BYTES;
}

/** Returns true when [candidate.candidate] matches the SDP candidate grammar. */
export function validateIceCandidate(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  if (candidate.length === 0 || candidate.length > 1024) return false;
  return ICE_CANDIDATE_REGEX.test(candidate);
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

  // Phase 42A — defensive SDP validation. A malicious bonded peer could
  // send a 10 MB SDP that OOMs the callee's setRemoteDescription. The
  // schema's z.string().min(1) is the first line of defense; the size
  // cap is the second.
  const sdpOfferLength = typeof payload.sdpOffer === "string" ? payload.sdpOffer.length : 0;
  if (!validateSdpString(payload.sdpOffer)) {
    console.warn(`${LOG} call.invite sdpOffer failed validation (length=${sdpOfferLength})`);
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

  // Phase 42A — same SDP defensive check on the answer path.
  const sdpAnswerLength = typeof payload.sdpAnswer === "string" ? payload.sdpAnswer.length : 0;
  if (!validateSdpString(payload.sdpAnswer)) {
    console.warn(`${LOG} call.accept sdpAnswer failed validation (length=${sdpAnswerLength})`);
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

  // Phase 42A — defensive ICE candidate grammar check. A bonded peer
  // that floods junk candidates could OOM the local addIceCandidate
  // queue. The regex matches the standard SDP candidate attribute.
  if (!validateIceCandidate(payload.candidate?.candidate)) {
    console.warn(`${LOG} call.ice-candidate failed grammar validation`);
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
