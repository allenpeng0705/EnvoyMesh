/**
 * CallManager — per-node singleton for Phase 38 voice/video calls.
 *
 * Tracks active call state, enforces one-call-per-node, validates
 * inbound `call.*` payloads against the callId state machine, and
 * emits `CallEvent`s to subscribers.
 */

import type { CallEvent, CallSession, CallSessionStatus, CallMediaType } from "@envoymesh/api";
import {
  CALL_RING_TIMEOUT_MS,
  type CallIceCandidatePayload,
  type CallRejectPayload,
  type CallHangupPayload,
} from "@envoymesh/protocol";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";

// --------------------------------------------------------------------------
// Internal session bookkeeping
// --------------------------------------------------------------------------

type CallDirection = "inbound" | "outbound";

interface InternalSession {
  callId: string;
  peerOwnerId: string;
  peerDisplayName: string;
  callType: CallMediaType;
  direction: CallDirection;
  status: CallSessionStatus;
  muted: boolean;
  startedAt?: string;
  ringTimer?: ReturnType<typeof setTimeout>;
  /** Owner ids of both participants for identity-binding checks. */
  participants: Set<string>;
}

export type InboundCallResult =
  | { ok: true; callId: string }
  | { ok: false; reason: "duplicate" | "busy" };

export type CallRemoteSignalRequest = {
  callId: string;
  peerOwnerId: string;
  intent: "call.reject";
  reason: CallRejectPayload["reason"];
};

type EventHandler = (event: CallEvent) => void;
type RemoteSignalHandler = (req: CallRemoteSignalRequest) => void;

// --------------------------------------------------------------------------
// CallManager
// --------------------------------------------------------------------------

export class CallManager {
  private _sessions = new Map<string, InternalSession>();
  private _handlers = new Set<EventHandler>();
  private _remoteSignalHandler: RemoteSignalHandler | null = null;

  // ------------------------------------------------------------------
  // Public API — query
  // ------------------------------------------------------------------

  getActiveCall(): CallSession | null {
    for (const s of this._sessions.values()) {
      if (s.status !== "ended") {
        return {
          callId: s.callId,
          peerOwnerId: s.peerOwnerId,
          callType: s.callType,
          status: s.status,
          startedAt: s.startedAt,
          muted: s.muted,
        };
      }
    }
    return null;
  }

  private _hasActiveCall(): boolean {
    for (const s of this._sessions.values()) {
      if (s.status !== "ended") return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Public API — events
  // ------------------------------------------------------------------

  onCallEvent(handler: EventHandler): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  /** Wire remote reject notifications (busy, ring timeout) to envelope send. */
  setRemoteSignalHandler(handler: RemoteSignalHandler | null): void {
    this._remoteSignalHandler = handler;
  }

  private _emit(event: CallEvent): void {
    webrtcCallTrace("call-manager:event", {
      type: event.type,
      callId: shortCallId("callId" in event ? event.callId : undefined),
      ...(event.type === "call:incoming"
        ? { peer: shortCallId(event.peerOwnerId), sdpLen: event.sdpOffer?.length ?? 0 }
        : {}),
      ...(event.type === "call:answered" ? { sdpAnswerLen: event.sdpAnswer?.length ?? 0 } : {}),
      ...(event.type === "call:error" ? { error: event.error?.slice(0, 120) } : {}),
      ...(event.type === "call:ended" || event.type === "call:rejected"
        ? { reason: "reason" in event ? event.reason : undefined }
        : {}),
    });
    for (const h of this._handlers) {
      try {
        h(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }

  /** Remove ended session bookkeeping to avoid unbounded Map growth. */
  private _removeSession(callId: string): void {
    const session = this._sessions.get(callId);
    if (!session) return;
    if (session.ringTimer) clearTimeout(session.ringTimer);
    this._sessions.delete(callId);
  }

  // ------------------------------------------------------------------
  // Outbound — caller initiates a call
  // ------------------------------------------------------------------

  outboundCallInitiated(
    callId: string,
    localOwnerId: string,
    peerOwnerId: string,
    peerDisplayName: string,
    callType: CallMediaType = "audio",
  ): string | null {
    if (this._hasActiveCall()) {
      webrtcCallWarn("call-manager:outbound-blocked-busy", { callId: shortCallId(callId) });
      return null;
    }

    const session: InternalSession = {
      callId,
      peerOwnerId,
      peerDisplayName,
      callType,
      direction: "outbound",
      status: "ringing",
      muted: false,
      participants: new Set([localOwnerId, peerOwnerId]),
    };

    this._sessions.set(callId, session);
    webrtcCallTrace("call-manager:outbound-initiated", {
      callId: shortCallId(callId),
      peer: shortCallId(peerOwnerId),
    });
    return callId;
  }

  /** Outbound invite could not be delivered — tear down ringing session and notify UI. */
  reportOutboundDeliveryFailed(callId: string, error: string): void {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "outbound") return;
    webrtcCallWarn("call-manager:delivery-failed", {
      callId: shortCallId(callId),
      error: error.slice(0, 120),
    });
    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;
    session.status = "ended";
    this._emit({ type: "call:error", callId, error });
    this._emit({ type: "call:ended", callId, reason: "error" });
    this._removeSession(callId);
  }

  // ------------------------------------------------------------------
  // Inbound — callee receives a call.invite
  // ------------------------------------------------------------------

  inboundCallReceived(
    callId: string,
    callerOwnerId: string,
    _callerPeerId: string,
    callerDisplayName: string,
    sdpOffer: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
    callType: CallMediaType = "audio",
  ): InboundCallResult {
    const existing = this._sessions.get(callId);
    if (existing?.peerOwnerId === callerOwnerId) {
      webrtcCallWarn("call-manager:inbound-duplicate", { callId: shortCallId(callId) });
      return { ok: false, reason: "duplicate" };
    }

    if (this._hasActiveCall()) {
      webrtcCallWarn("call-manager:inbound-busy", { callId: shortCallId(callId) });
      return { ok: false, reason: "busy" };
    }

    const session: InternalSession = {
      callId,
      peerOwnerId: callerOwnerId,
      peerDisplayName: callerDisplayName,
      callType,
      direction: "inbound",
      status: "ringing",
      muted: false,
      participants: new Set([callerOwnerId]),
    };

    session.ringTimer = setTimeout(() => {
      this._handleRingTimeout(callId);
    }, CALL_RING_TIMEOUT_MS);

    this._sessions.set(callId, session);

    webrtcCallTrace("call-manager:inbound-ringing", {
      callId: shortCallId(callId),
      caller: shortCallId(callerOwnerId),
      sdpLen: sdpOffer.length,
      path2: Boolean(iceServers?.length),
    });

    this._emit({
      type: "call:incoming",
      callId,
      peerOwnerId: callerOwnerId,
      peerDisplayName: callerDisplayName,
      callType,
      sdpOffer,
      iceServers,
    });

    return { ok: true, callId };
  }

  private _handleRingTimeout(callId: string): void {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "ringing") return;

    const peerOwnerId = session.peerOwnerId;
    const direction = session.direction;

    session.status = "ended";
    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;

    this._emit({
      type: "call:rejected",
      callId,
      reason: "no_answer",
    });

    if (direction === "inbound" && this._remoteSignalHandler) {
      this._remoteSignalHandler({
        callId,
        peerOwnerId,
        intent: "call.reject",
        reason: "no_answer",
      });
    }
    this._removeSession(callId);
  }

  // ------------------------------------------------------------------
  // call.accept — callee accepts inbound call
  // ------------------------------------------------------------------

  acceptInboundCall(callId: string, calleeOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "inbound") {
      return false;
    }

    // Renegotiation after Path 1 → Path 2 reinvite — accept envelope only.
    if (session.status === "active") {
      return session.participants.has(calleeOwnerId);
    }

    if (session.status !== "ringing") {
      return false;
    }

    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;
    session.status = "active";
    session.startedAt = new Date().toISOString();
    session.participants.add(calleeOwnerId);

    this._emit({ type: "call:answered", callId });
    return true;
  }

  // ------------------------------------------------------------------
  // Outbound accepted — caller receives call.accept
  // ------------------------------------------------------------------

  outboundCallAccepted(
    callId: string,
    sdpAnswer?: string,
    iceServers?: { urls: string; username?: string; credential?: string }[],
  ): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "outbound") {
      return false;
    }

    // Path 2 renegotiation after call.reinvite — emit updated answer SDP.
    if (session.status === "active") {
      this._emit({ type: "call:answered", callId, sdpAnswer, iceServers });
      return true;
    }

    if (session.status !== "ringing") {
      return false;
    }

    session.status = "active";
    session.startedAt = new Date().toISOString();

    this._emit({ type: "call:answered", callId, sdpAnswer, iceServers });
    return true;
  }

  // ------------------------------------------------------------------
  // call.reinvite — Path 1 → Path 2 fallback (same callId)
  // ------------------------------------------------------------------

  /** Caller-side guard before sending call.reinvite. */
  canSendOutboundReinvite(callId: string, callerOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "outbound") return false;
    if (session.status !== "ringing" && session.status !== "active") return false;
    return session.participants.has(callerOwnerId);
  }

  /** Callee-side: caller sends an updated Path 2 offer for an existing call. */
  inboundCallReinvite(
    callId: string,
    callerOwnerId: string,
    sdpOffer: string,
    iceServers: { urls: string; username?: string; credential?: string }[],
    reason: "path1_timeout" | "path1_failed" = "path1_timeout",
  ): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "inbound") return false;
    if (session.status !== "ringing" && session.status !== "active") return false;
    if (session.peerOwnerId !== callerOwnerId) return false;

    this._emit({
      type: "call:reinvite",
      callId,
      peerOwnerId: callerOwnerId,
      sdpOffer,
      iceServers,
      reason,
      transportPath: "path2",
    });
    return true;
  }

  // ------------------------------------------------------------------
  // ICE trickle — forward to local UI
  // ------------------------------------------------------------------

  iceCandidateReceived(
    callId: string,
    candidate: CallIceCandidatePayload["candidate"],
    fromOwnerId: string,
  ): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status === "ended") return false;
    if (!session.participants.has(fromOwnerId)) return false;

    this._emit({
      type: "call:ice-candidate",
      callId,
      candidate,
      fromOwnerId,
    });
    return true;
  }

  // ------------------------------------------------------------------
  // call.reject — callee rejects (or system auto-rejects)
  // ------------------------------------------------------------------

  rejectCall(callId: string, reason: CallRejectPayload["reason"]): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "ringing") return false;

    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;
    session.status = "ended";

    this._emit({
      type: "call:rejected",
      callId,
      reason: reason as "busy" | "declined" | "offline" | "error" | "no_answer",
    });
    this._removeSession(callId);
    return true;
  }

  // ------------------------------------------------------------------
  // call.hangup — either party ends the call
  // ------------------------------------------------------------------

  hangupCall(callId: string, reason: CallHangupPayload["reason"]): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status === "ended") return false;

    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;
    session.status = "ended";

    this._emit({
      type: "call:ended",
      callId,
      reason: reason as "normal" | "error" | "no_answer",
    });
    this._removeSession(callId);
    return true;
  }

  // ------------------------------------------------------------------
  // call.mute
  // ------------------------------------------------------------------

  setMute(callId: string, muted: boolean): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "active") return false;

    session.muted = muted;
    this._emit({ type: "call:remote-mute", callId, muted });
    return true;
  }

  // ------------------------------------------------------------------
  // Identity binding / validation helpers (used by call-inbound.ts)
  // ------------------------------------------------------------------

  isParticipant(callId: string, senderOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session) return false;
    return session.participants.has(senderOwnerId);
  }

  getSessionStatus(callId: string): CallSessionStatus | null {
    return this._sessions.get(callId)?.status ?? null;
  }

  getSessionPeerOwnerId(callId: string): string | null {
    return this._sessions.get(callId)?.peerOwnerId ?? null;
  }

  isCallerMatch(callId: string, callerOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "inbound") return false;
    return session.peerOwnerId === callerOwnerId;
  }

  /** Outbound session: remote party is the callee. */
  isCalleeMatch(callId: string, calleeOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "outbound") return false;
    return session.peerOwnerId === calleeOwnerId;
  }
}
