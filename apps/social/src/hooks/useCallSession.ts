/**
 * useCallSession — React hook for Phase 38 voice/video call state.
 *
 * Subscribes to CallEvent from the NodeService and exposes the
 * current CallSession for UI rendering.
 */

import { useState, useEffect, useCallback } from "react";
import { useNodeService } from "./useNodeService.js";
import type { CallSession, CallEvent } from "@envoymesh/api";

export interface UseCallSessionResult {
  /** The active call session, or null if no call is in progress. */
  activeCall: CallSession | null;
  /** The most recent incoming call event (for showing the incoming modal). */
  incomingCall: { callId: string; peerOwnerId: string; peerDisplayName: string; sdpOffer?: string } | null;
  /** Accept the current incoming call. */
  acceptCall: () => void;
  /** Decline the current incoming call. */
  declineCall: () => void;
  /** End the active call. */
  endCall: () => void;
  /** Toggle mute on the active call. */
  toggleMute: () => void;
  /** Whether the local microphone is muted. */
  isMuted: boolean;
  /** The WebRTC connection state. */
  connectionState: string;
  /** Dismiss the incoming call notification (without accept/decline — timeout). */
  dismissIncoming: () => void;
  /** The ID of an outbound call that is currently ringing (null if not calling). */
  callingState: string | null;
  /** Start an outbound call. Returns the callId. */
  startCall: (targetOwnerId: string) => Promise<void>;
  /** Cancel an outbound call that is ringing. */
  cancelCall: () => void;
}

export function useCallSession(): UseCallSessionResult {
  const nodeService = useNodeService();
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<UseCallSessionResult["incomingCall"]>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionState, setConnectionState] = useState("disconnected");
  // Store the incoming SDP offer for accept flow
  const [pendingSdpOffer, setPendingSdpOffer] = useState<string | undefined>(undefined);
  // Phase 38D — outbound calling state
  const [callingState, setCallingState] = useState<string | null>(null);

  useEffect(() => {
    if (!nodeService) return;

    const unsub = nodeService.onCallEvent((event: CallEvent) => {
      switch (event.type) {
        case "call:incoming":
          setIncomingCall({
            callId: event.callId,
            peerOwnerId: event.peerOwnerId,
            peerDisplayName: event.peerDisplayName,
            sdpOffer: event.sdpOffer,
          });
          setPendingSdpOffer(event.sdpOffer);
          break;
        case "call:answered":
          setIncomingCall(null);
          setPendingSdpOffer(undefined);
          setCallingState(null);
          setConnectionState("connected");
          break;
        case "call:ended":
        case "call:rejected":
          setActiveCall(null);
          setIncomingCall(null);
          setPendingSdpOffer(undefined);
          setCallingState(null);
          setConnectionState("disconnected");
          setIsMuted(false);
          break;
        case "call:remote-mute":
          // Remote party mute indicator — informational only
          break;
        case "call:error":
          setActiveCall(null);
          setIncomingCall(null);
          setConnectionState("disconnected");
          break;
      }

      // Refresh active call from the node
      const call = nodeService.getActiveCall();
      setActiveCall(call);
      if (call) {
        setIsMuted(call.muted);
      }
    });

    return () => unsub();
  }, [nodeService]);

  const acceptCall = useCallback(() => {
    if (!incomingCall) return;
    // The accept flow is triggered by the UI via RPC (outboundCallAccepted + send call.accept)
    // The CallManager handles the state transition; UI just dismisses the modal
    setIncomingCall(null);
    setConnectionState("connecting");
    // The actual call.accept envelope is sent by the caller's node service impl
  }, [incomingCall]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    // call.reject is sent by the node service
    setIncomingCall(null);
  }, [incomingCall]);

  const endCall = useCallback(() => {
    setActiveCall(null);
    setConnectionState("disconnected");
    setIsMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const dismissIncoming = useCallback(() => {
    setIncomingCall(null);
    setPendingSdpOffer(undefined);
  }, []);

  const startCall = useCallback(async (targetOwnerId: string) => {
    if (!nodeService) return;
    const callId = await nodeService.sendCallInvite(targetOwnerId);
    if (callId) {
      setCallingState(callId);
    }
  }, [nodeService]);

  const cancelCall = useCallback(() => {
    if (!nodeService || !callingState) return;
    void nodeService.endCall(callingState);
    setCallingState(null);
  }, [nodeService, callingState]);

  return {
    activeCall,
    incomingCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    isMuted,
    connectionState,
    dismissIncoming,
    callingState,
    startCall,
    cancelCall,
  };
}
