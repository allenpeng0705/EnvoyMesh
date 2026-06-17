/**
 * CallManager — per-node singleton for Phase 38 voice/video calls.
 *
 * Tracks active call state, enforces one-call-per-node, validates
 * inbound `call.*` payloads against the callId state machine, and
 * emits `CallEvent`s to subscribers.
 */

import type { CallEvent, CallSession, CallSessionStatus } from "@envoymesh/api";
import {
  CALL_RING_TIMEOUT_MS,
  createCallRejectPayload,
  createCallHangupPayload,
  type CallInvitePayload,
  type CallAcceptPayload,
  type CallRejectPayload,
  type CallIceCandidatePayload,
  type CallHangupPayload,
  type CallMutePayload,
} from "@envoymesh/protocol";

// --------------------------------------------------------------------------
// Internal session bookkeeping
// --------------------------------------------------------------------------

type CallDirection = "inbound" | "outbound";

interface InternalSession {
  callId: string;
  peerOwnerId: string;
  peerDisplayName: string;
  direction: CallDirection;
  status: CallSessionStatus;
  muted: boolean;
  startedAt?: string;
  ringTimer?: ReturnType<typeof setTimeout>;
  /** Owner ids of both participants for identity-binding checks. */
  participants: Set<string>;
}

// --------------------------------------------------------------------------
// Event emitter helpers
// --------------------------------------------------------------------------

type EventHandler = (event: CallEvent) => void;

// --------------------------------------------------------------------------
// CallManager
// --------------------------------------------------------------------------

export class CallManager {
  private _sessions = new Map<string, InternalSession>();
  private _handlers = new Set<EventHandler>();

  // ------------------------------------------------------------------
  // Public API — query
  // ------------------------------------------------------------------

  getActiveCall(): CallSession | null {
    for (const s of this._sessions.values()) {
      if (s.status !== "ended") {
        return {
          callId: s.callId,
          peerOwnerId: s.peerOwnerId,
          callType: "audio",
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

  private _emit(event: CallEvent): void {
    for (const h of this._handlers) {
      try { h(event); } catch { /* ignore handler errors */ }
    }
  }

  // ------------------------------------------------------------------
  // Outbound — caller initiates a call
  // ------------------------------------------------------------------

  /**
   * Called when the local user initiates a call to a peer.
   * Returns the callId or null if already in a call.
   */
  outboundCallInitiated(
    callId: string,
    peerOwnerId: string,
    peerDisplayName: string,
  ): string | null {
    if (this._hasActiveCall()) return null;

    const session: InternalSession = {
      callId,
      peerOwnerId,
      peerDisplayName,
      direction: "outbound",
      status: "ringing",
      muted: false,
      participants: new Set([peerOwnerId]),
    };

    this._sessions.set(callId, session);
    return callId;
  }

  // ------------------------------------------------------------------
  // Inbound — callee receives a call.invite
  // ------------------------------------------------------------------

  /**
   * Called when the local node receives a `call.invite` from a peer.
   * Deduplicates by (callId, callerOwnerId). Returns the callId if
   * the call was accepted, or null if rejected (busy / duplicate).
   */
  inboundCallReceived(
    callId: string,
    callerOwnerId: string,
    callerPeerId: string,
    callerDisplayName: string,
    sdpOffer: string,
  ): string | null {
    // Deduplicate: same (callId, callerOwnerId) → ignore
    const existing = this._sessions.get(callId);
    if (existing) {
      if (existing.peerOwnerId === callerOwnerId) {
        return null; // duplicate, silently ignore
      }
    }

    // One call at a time — reject with busy
    if (this._hasActiveCall()) {
      return null; // caller will receive call.reject(reason=busy)
    }

    const session: InternalSession = {
      callId,
      peerOwnerId: callerOwnerId,
      peerDisplayName: callerDisplayName,
      direction: "inbound",
      status: "ringing",
      muted: false,
      participants: new Set([callerOwnerId]),
    };

    // Start ring timeout (60 s)
    session.ringTimer = setTimeout(() => {
      this._handleRingTimeout(callId);
    }, CALL_RING_TIMEOUT_MS);

    this._sessions.set(callId, session);

    this._emit({
      type: "call:incoming",
      callId,
      peerOwnerId: callerOwnerId,
      peerDisplayName: callerDisplayName,
      callType: "audio",
      sdpOffer,
    });

    return callId;
  }

  private _handleRingTimeout(callId: string): void {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "ringing") return;

    session.status = "ended";
    if (session.ringTimer) clearTimeout(session.ringTimer);
    session.ringTimer = undefined;

    this._emit({
      type: "call:rejected",
      callId,
      reason: "no_answer",
    });
  }

  // ------------------------------------------------------------------
  // call.accept — callee accepts inbound call
  // ------------------------------------------------------------------

  acceptInboundCall(callId: string, calleeOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "ringing" || session.direction !== "inbound") {
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

  outboundCallAccepted(callId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.status !== "ringing" || session.direction !== "outbound") {
      return false;
    }

    session.status = "active";
    session.startedAt = new Date().toISOString();

    this._emit({ type: "call:answered", callId });
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

  /** Check if a sender is a participant in the call identified by callId. */
  isParticipant(callId: string, senderOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session) return false;
    return session.participants.has(senderOwnerId);
  }

  /** Get the session status for callId validation. */
  getSessionStatus(callId: string): CallSessionStatus | null {
    return this._sessions.get(callId)?.status ?? null;
  }

  /** Get the participant's ownerId for a given session (for identity binding). */
  getSessionPeerOwnerId(callId: string): string | null {
    return this._sessions.get(callId)?.peerOwnerId ?? null;
  }

  /** Whether the caller for a given inbound callId matches. */
  isCallerMatch(callId: string, callerOwnerId: string): boolean {
    const session = this._sessions.get(callId);
    if (!session || session.direction !== "inbound") return false;
    return session.peerOwnerId === callerOwnerId;
  }
}
