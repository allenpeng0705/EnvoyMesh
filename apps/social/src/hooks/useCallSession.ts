/**
 * useCallSession — React hook for Phase 38/42 voice call state.
 *
 * Keeps a live WebRtcCallTransport through the call, applies remote answer
 * SDP, forwards trickle ICE, and wires end/decline/mute to the home node.
 *
 * Outbound calls start on Path 1 (no STUN/TURN). If the direct connection
 * does not establish within the Path 1 timeout, the hook sends call.reinvite
 * with a Path 2 offer (STUN/TURN) for the same callId.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNodeService } from "./useNodeService.js";
import { useToast } from "./useToast.js";
import { useT } from "../context/I18nContext.js";
import {
  createWebRtcCallTransport,
  type WebRtcCallTransport,
  type CallTransportPath,
} from "../lib/webrtc-call-transport.js";
import type { CallSession, CallEvent } from "@envoymesh/api";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "../lib/webrtc-call-trace.js";

type IceServerConfig = { urls: string; username?: string; credential?: string };

const CALLER_RINGBACK_TIMEOUT_MS = 30_000;

export interface UseCallSessionResult {
  activeCall: CallSession | null;
  incomingCall: {
    callId: string;
    peerOwnerId: string;
    peerDisplayName: string;
    sdpOffer?: string;
    iceServers?: IceServerConfig[];
  } | null;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  isRemoteMuted: boolean;
  micAvailable: boolean;
  connectionState: string;
  dismissIncoming: () => void;
  callingState: string | null;
  activePeerDisplayName: string | null;
  startCall: (targetOwnerId: string, displayName?: string) => Promise<void>;
  cancelCall: () => void;
  remoteStream: MediaStream | null;
}

function isPath2Invite(iceServers?: IceServerConfig[]): boolean {
  return Boolean(iceServers && iceServers.length > 0);
}

export function useCallSession(): UseCallSessionResult {
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const t = useT();
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [incomingCall, setIncomingCall] = useState<UseCallSessionResult["incomingCall"]>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [pendingSdpOffer, setPendingSdpOffer] = useState<string | undefined>(undefined);
  const [callingState, setCallingState] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [activePeerDisplayName, setActivePeerDisplayName] = useState<string | null>(null);

  const transportRef = useRef<WebRtcCallTransport | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const iceCallIdRef = useRef<string>("");
  const activePeerRef = useRef<{ ownerId: string; displayName: string } | null>(null);
  const pendingInviteIceServersRef = useRef<IceServerConfig[] | undefined>(undefined);
  const path2FallbackSentRef = useRef(false);

  const closeTransport = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    setRemoteStream(null);
    setMicAvailable(true);
  }, []);

  const syncMicAvailable = useCallback(() => {
    setMicAvailable(transportRef.current?.isMicAvailable() ?? true);
  }, []);

  const notifyMicUnavailable = useCallback(() => {
    showToast(t("call:micListenOnly"), "info");
  }, [showToast, t]);

  const sendIceCandidate = useCallback(
    (candidate: Parameters<typeof nodeService.sendIceCandidate>[1]) => {
      const callId = iceCallIdRef.current;
      if (!callId) return;
      void nodeService.sendIceCandidate(callId, candidate).catch((err) => {
        console.warn("[useCallSession] sendIceCandidate failed:", err);
      });
    },
    [nodeService],
  );

  const buildTransport = useCallback(
    (options: {
      path: CallTransportPath;
      iceServers: RTCIceServer[];
      onPath1Timeout?: () => void;
    }) =>
      createWebRtcCallTransport({
        path: options.path,
        iceServers: options.iceServers,
        onRemoteStream: (stream) => setRemoteStream(stream),
        onConnectionStateChange: (state) => setConnectionState(state),
        onSdpGenerated: () => undefined,
        onIceCandidate: (candidate) => sendIceCandidate(candidate),
        onMutePayload: () => undefined,
        onPath1Timeout: options.onPath1Timeout,
      }),
    [sendIceCandidate],
  );

  const performPath2Fallback = useCallback(
    async (callId: string, reason: "path1_timeout" | "path1_failed" = "path1_timeout") => {
      if (path2FallbackSentRef.current || !nodeService) return;
      path2FallbackSentRef.current = true;

      closeTransport();
      setConnectionState("connecting");

      const nodeConfig = await nodeService.getNodeConfig();
      const configIce = (nodeConfig?.iceServers ?? []) as RTCIceServer[];

      try {
        iceCallIdRef.current = callId;
        const transport = buildTransport({ path: "path2", iceServers: configIce });
        transportRef.current = transport;
        const sdpOffer = await transport.startOffer();
        syncMicAvailable();
        if (!transport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        const sent = await nodeService.sendCallReinvite(
          callId,
          sdpOffer,
          nodeConfig?.iceServers ?? undefined,
          reason,
        );
        if (!sent) {
          console.warn("[useCallSession] sendCallReinvite failed for callId:", callId);
        }
      } catch (err) {
        console.warn("[useCallSession] Path 2 fallback failed:", err);
        closeTransport();
      }
    },
    [nodeService, buildTransport, closeTransport, syncMicAvailable, notifyMicUnavailable],
  );

  const onPath1TimeoutHandler = useCallback(() => {
    const callId = activeCallIdRef.current ?? iceCallIdRef.current;
    if (callId) {
      void performPath2Fallback(callId, "path1_timeout");
    }
  }, [performPath2Fallback]);

  const renegotiateCalleePath2 = useCallback(
    async (callId: string, remoteSdp: string, iceServers: IceServerConfig[]) => {
      if (!nodeService) return;

      closeTransport();
      iceCallIdRef.current = callId;
      setConnectionState("connecting");

      try {
        const transport = buildTransport({
          path: "path2",
          iceServers: iceServers as RTCIceServer[],
        });
        transportRef.current = transport;
        const sdpAnswer = await transport.startAnswer(remoteSdp);
        syncMicAvailable();
        if (!transport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        await nodeService.acceptCallInvite(callId, sdpAnswer, iceServers);
        setConnectionState("connected");
      } catch (err) {
        console.warn("[useCallSession] callee Path 2 renegotiation failed:", err);
        closeTransport();
        setConnectionState("disconnected");
      }
    },
    [nodeService, buildTransport, closeTransport, syncMicAvailable, notifyMicUnavailable],
  );

  useEffect(() => {
    if (!nodeService) return;

    const unsub = nodeService.onCallEvent((event: CallEvent) => {
      webrtcCallTrace("ui:call-event", {
        type: event.type,
        callId: shortCallId("callId" in event ? event.callId : undefined),
      });
      switch (event.type) {
        case "call:incoming":
          setIncomingCall({
            callId: event.callId,
            peerOwnerId: event.peerOwnerId,
            peerDisplayName: event.peerDisplayName,
            sdpOffer: event.sdpOffer,
            iceServers: event.iceServers,
          });
          setPendingSdpOffer(event.sdpOffer);
          pendingInviteIceServersRef.current = event.iceServers;
          break;
        case "call:reinvite":
          setPendingSdpOffer(event.sdpOffer);
          pendingInviteIceServersRef.current = event.iceServers;
          setIncomingCall((prev) =>
            prev && prev.callId === event.callId
              ? { ...prev, sdpOffer: event.sdpOffer, iceServers: event.iceServers }
              : prev,
          );
          if (activeCallIdRef.current === event.callId) {
            void renegotiateCalleePath2(event.callId, event.sdpOffer, event.iceServers);
          }
          break;
        case "call:answered":
          setIncomingCall(null);
          setPendingSdpOffer(undefined);
          setCallingState(null);
          if (event.sdpAnswer && transportRef.current) {
            void transportRef.current
              .applyRemoteAnswer(event.sdpAnswer)
              .then(() => setConnectionState("connected"))
              .catch((err) =>
                console.warn("[useCallSession] applyRemoteAnswer failed:", err),
              );
          } else {
            setConnectionState("connected");
          }
          setActiveCall({
            callId: event.callId,
            peerOwnerId: activePeerRef.current?.ownerId ?? "",
            callType: "audio",
            status: "active",
            muted: false,
          });
          activeCallIdRef.current = event.callId;
          break;
        case "call:ice-candidate":
          if (transportRef.current && event.callId === activeCallIdRef.current) {
            void transportRef.current.addIceCandidate(event.candidate);
          }
          break;
        case "call:ended":
        case "call:rejected":
          closeTransport();
          setActiveCall(null);
          setIncomingCall(null);
          setPendingSdpOffer(undefined);
          setCallingState(null);
          setActivePeerDisplayName(null);
          activeCallIdRef.current = null;
          activePeerRef.current = null;
          iceCallIdRef.current = "";
          pendingInviteIceServersRef.current = undefined;
          path2FallbackSentRef.current = false;
          setConnectionState("disconnected");
          setIsMuted(false);
          setIsRemoteMuted(false);
          break;
        case "call:remote-mute":
          setIsRemoteMuted(event.muted);
          setActiveCall((prev) => (prev ? { ...prev, muted: event.muted } : prev));
          break;
        case "call:error":
          webrtcCallWarn("ui:call-error", {
            callId: shortCallId(event.callId),
            error: event.error?.slice(0, 120),
          });
          showToast(event.error || t("call:failed"), "error");
          closeTransport();
          setActiveCall(null);
          setIncomingCall(null);
          setCallingState(null);
          setActivePeerDisplayName(null);
          activeCallIdRef.current = null;
          activePeerRef.current = null;
          iceCallIdRef.current = "";
          path2FallbackSentRef.current = false;
          setConnectionState("disconnected");
          setIsMuted(false);
          setIsRemoteMuted(false);
          break;
      }
    });

    return () => unsub();
  }, [nodeService, closeTransport, renegotiateCalleePath2, showToast, t]);

  const cancelCallRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!callingState || activeCall) return;
    const timer = setTimeout(() => {
      showToast(t("call:noAnswer"), "info");
      cancelCallRef.current();
    }, CALLER_RINGBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callingState, activeCall, showToast, t]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !nodeService) return;
    const remoteSdp = pendingSdpOffer ?? incomingCall.sdpOffer;
    if (!remoteSdp) {
      console.warn("[useCallSession] cannot accept call: missing remote SDP");
      return;
    }

    const callId = incomingCall.callId;
    webrtcCallTrace("ui:accept-call", {
      callId: shortCallId(callId),
      peer: shortCallId(incomingCall.peerOwnerId),
      path2: isPath2Invite(pendingInviteIceServersRef.current ?? incomingCall.iceServers),
    });
    activePeerRef.current = {
      ownerId: incomingCall.peerOwnerId,
      displayName: incomingCall.peerDisplayName,
    };
    setActivePeerDisplayName(incomingCall.peerDisplayName);
    const peerOwnerId = incomingCall.peerOwnerId;
    setIncomingCall(null);
    setConnectionState("connecting");
    setIsMuted(false);
    setIsRemoteMuted(false);
    activeCallIdRef.current = callId;
    setActiveCall({
      callId,
      peerOwnerId,
      callType: "audio",
      status: "active",
      muted: false,
    });

    const inviteIce =
      pendingInviteIceServersRef.current ?? incomingCall.iceServers;
    const usePath2 = isPath2Invite(inviteIce);
    const nodeConfig = await nodeService.getNodeConfig();
    const pathIceServers = usePath2
      ? ((nodeConfig?.iceServers ?? []) as RTCIceServer[])
      : [];

    try {
      closeTransport();
      iceCallIdRef.current = callId;
      const transport = buildTransport({
        path: usePath2 ? "path2" : "path1",
        iceServers: pathIceServers,
      });
      transportRef.current = transport;
      const sdpAnswer = await transport.startAnswer(remoteSdp);
      syncMicAvailable();
      if (!transport.isMicAvailable()) {
        notifyMicUnavailable();
      }
      await nodeService.acceptCallInvite(
        callId,
        sdpAnswer,
        usePath2 ? nodeConfig?.iceServers ?? [] : [],
      );
      setConnectionState("connected");
    } catch (err) {
      console.warn("[useCallSession] failed to accept call:", err);
      closeTransport();
      activeCallIdRef.current = null;
      setActiveCall(null);
      setActivePeerDisplayName(null);
      setConnectionState("disconnected");
      showToast(t("call:failed"), "error");
    }
  }, [
    incomingCall,
    pendingSdpOffer,
    nodeService,
    buildTransport,
    closeTransport,
    syncMicAvailable,
    notifyMicUnavailable,
    showToast,
    t,
  ]);

  const declineCall = useCallback(() => {
    if (!incomingCall || !nodeService) return;
    void nodeService.declineCallInvite(incomingCall.callId, "declined");
    setIncomingCall(null);
    setPendingSdpOffer(undefined);
    pendingInviteIceServersRef.current = undefined;
  }, [incomingCall, nodeService]);

  const endCall = useCallback(() => {
    const callId = activeCallIdRef.current ?? activeCall?.callId ?? callingState;
    closeTransport();
    if (callId && nodeService) {
      void nodeService.endCall(callId);
    }
    setActiveCall(null);
    setCallingState(null);
    activeCallIdRef.current = null;
    activePeerRef.current = null;
    iceCallIdRef.current = "";
    path2FallbackSentRef.current = false;
    setConnectionState("disconnected");
    setIsMuted(false);
    setIsRemoteMuted(false);
  }, [activeCall, callingState, nodeService, closeTransport]);

  const toggleMute = useCallback(() => {
    const callId = activeCallIdRef.current ?? activeCall?.callId;
    if (!callId || !nodeService || !micAvailable) return;
    const next = !isMuted;
    transportRef.current?.setMute(next, callId);
    setIsMuted(next);
    void nodeService.setCallMuted(callId, next);
  }, [activeCall, isMuted, micAvailable, nodeService]);

  const dismissIncoming = useCallback(() => {
    setIncomingCall(null);
    setPendingSdpOffer(undefined);
    pendingInviteIceServersRef.current = undefined;
  }, []);

  const startCall = useCallback(
    async (targetOwnerId: string, displayName?: string) => {
      if (!nodeService) return;
      const peerLabel = displayName?.trim() || targetOwnerId;
      webrtcCallTrace("ui:start-call", { target: shortCallId(targetOwnerId) });

      path2FallbackSentRef.current = false;

      let sdpOffer: string;
      try {
        closeTransport();
        iceCallIdRef.current = "";
        const tempTransport = buildTransport({
          path: "path1",
          iceServers: [],
          onPath1Timeout: onPath1TimeoutHandler,
        });
        sdpOffer = await tempTransport.startOffer();
        transportRef.current = tempTransport;
        syncMicAvailable();
        if (!tempTransport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        webrtcCallTrace("ui:offer-ready", { sdpLen: sdpOffer.length });
      } catch (err) {
        webrtcCallWarn("ui:offer-failed", {
          error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        });
        console.warn("[useCallSession] failed to build WebRTC offer:", err);
        showToast(t("call:failed"), "error");
        closeTransport();
        return;
      }

      let callId: string | null;
      try {
        // Explicit `[]` signals Path 1 — home must not inject default STUN.
        callId = await nodeService.sendCallInvite(targetOwnerId, sdpOffer, []);
      } catch (err) {
        webrtcCallWarn("ui:send-invite-failed", {
          target: shortCallId(targetOwnerId),
          error: err instanceof Error ? err.message.slice(0, 120) : String(err),
        });
        console.warn("[useCallSession] sendCallInvite failed:", err);
        showToast(t("call:deliveryFailed"), "error");
        closeTransport();
        iceCallIdRef.current = "";
        return;
      }
      if (!callId) {
        webrtcCallWarn("ui:send-invite-no-call-id", { target: shortCallId(targetOwnerId) });
        showToast(t("call:deliveryFailed"), "error");
        closeTransport();
        iceCallIdRef.current = "";
        return;
      }

      iceCallIdRef.current = callId;
      activeCallIdRef.current = callId;
      activePeerRef.current = { ownerId: targetOwnerId, displayName: peerLabel };
      setActivePeerDisplayName(peerLabel);
      setCallingState(callId);
      setConnectionState("connecting");
      webrtcCallTrace("ui:invite-sent", { callId: shortCallId(callId), target: shortCallId(targetOwnerId) });
    },
    [nodeService, buildTransport, closeTransport, onPath1TimeoutHandler, showToast, t, syncMicAvailable, notifyMicUnavailable],
  );

  const cancelCall = useCallback(() => {
    if (!nodeService || !callingState) return;
    void nodeService.endCall(callingState);
    closeTransport();
    setCallingState(null);
    setActivePeerDisplayName(null);
    activeCallIdRef.current = null;
    path2FallbackSentRef.current = false;
    setConnectionState("disconnected");
  }, [nodeService, callingState, closeTransport]);

  cancelCallRef.current = cancelCall;

  return {
    activeCall,
    incomingCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    isMuted,
    isRemoteMuted,
    micAvailable,
    connectionState,
    dismissIncoming,
    callingState,
    activePeerDisplayName,
    startCall,
    cancelCall,
    remoteStream,
  };
}
