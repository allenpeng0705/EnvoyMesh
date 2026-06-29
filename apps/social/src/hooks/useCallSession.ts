/**
 * useCallSession — React hook for Phase 38/42 voice call state.
 *
 * Keeps a live WebRtcCallTransport through the call, applies remote answer
 * SDP, forwards trickle ICE, and wires end/decline/mute to the home node.
 *
 * Outbound calls use STUN/TURN (Path 2) from the first offer so cross-NAT
 * peers (e.g. Mac ↔ Windows) can establish media. Path 1 libp2p-webrtc is
 * not wired yet; a timed reinvite still retries with fresh ICE if needed.
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
import {
  resolveCallIceServers,
  isPath2Call,
  type CallIceServerConfig,
} from "../lib/call-ice-servers.js";
import type { CallSession, CallEvent, CallMediaType } from "@envoymesh/api";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "../lib/webrtc-call-trace.js";

type IceServerConfig = CallIceServerConfig;

const CALLER_RINGBACK_TIMEOUT_MS = 30_000;

export interface UseCallSessionResult {
  activeCall: CallSession | null;
  incomingCall: {
    callId: string;
    peerOwnerId: string;
    peerDisplayName: string;
    callType: CallMediaType;
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
  cameraAvailable: boolean;
  connectionState: string;
  dismissIncoming: () => void;
  callingState: string | null;
  activePeerDisplayName: string | null;
  startCall: (targetOwnerId: string, displayName?: string, callType?: CallMediaType) => Promise<void>;
  cancelCall: () => void;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
}

function isPath2Invite(iceServers?: IceServerConfig[]): boolean {
  return isPath2Call(iceServers);
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
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [connectionState, setConnectionState] = useState("disconnected");
  const [pendingSdpOffer, setPendingSdpOffer] = useState<string | undefined>(undefined);
  const [callingState, setCallingState] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [activePeerDisplayName, setActivePeerDisplayName] = useState<string | null>(null);

  const transportRef = useRef<WebRtcCallTransport | null>(null);
  const activeCallIdRef = useRef<string | null>(null);
  const iceCallIdRef = useRef<string>("");
  const activePeerRef = useRef<{ ownerId: string; displayName: string; callType: CallMediaType } | null>(null);
  const mediaTypeRef = useRef<CallMediaType>("audio");
  const pendingInviteIceServersRef = useRef<IceServerConfig[] | undefined>(undefined);
  const path2FallbackSentRef = useRef(false);
  const pendingIceCandidatesRef = useRef<Parameters<typeof nodeService.sendIceCandidate>[1][]>([]);
  const pendingOutboundIceRef = useRef<Parameters<typeof nodeService.sendIceCandidate>[1][]>([]);

  const flushPendingOutboundIce = useCallback(
    (callId: string) => {
      if (pendingOutboundIceRef.current.length === 0) return;
      const queued = pendingOutboundIceRef.current.splice(0);
      webrtcCallTrace("ui:ice-candidate-flush-outbound", { count: queued.length, callId: shortCallId(callId) });
      for (const candidate of queued) {
        void nodeService.sendIceCandidate(callId, candidate).catch((err) => {
          console.warn("[useCallSession] sendIceCandidate failed:", err);
        });
      }
    },
    [nodeService],
  );

  const flushPendingIceCandidates = useCallback(() => {
    const transport = transportRef.current;
    if (!transport || pendingIceCandidatesRef.current.length === 0) return;
    const queued = pendingIceCandidatesRef.current.splice(0);
    for (const candidate of queued) {
      void transport.addIceCandidate(candidate);
    }
  }, []);

  const closeTransport = useCallback(() => {
    transportRef.current?.close();
    transportRef.current = null;
    setRemoteStream(null);
    setLocalStream(null);
    setMicAvailable(true);
    setCameraAvailable(true);
    pendingIceCandidatesRef.current = [];
    pendingOutboundIceRef.current = [];
  }, []);

  const syncMediaAvailability = useCallback(() => {
    setMicAvailable(transportRef.current?.isMicAvailable() ?? true);
    setCameraAvailable(transportRef.current?.isCameraAvailable() ?? true);
  }, []);

  const notifyMicUnavailable = useCallback(() => {
    showToast(t("call:micListenOnly"), "info");
  }, [showToast, t]);

  const sendIceCandidate = useCallback(
    (candidate: Parameters<typeof nodeService.sendIceCandidate>[1]) => {
      const callId = iceCallIdRef.current;
      if (!callId) {
        pendingOutboundIceRef.current.push(candidate);
        webrtcCallTrace("ui:ice-candidate-queued-outbound", {
          pending: pendingOutboundIceRef.current.length,
        });
        return;
      }
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
      mediaType?: CallMediaType;
      onPath1Timeout?: () => void;
    }) =>
      createWebRtcCallTransport({
        path: options.path,
        mediaType: options.mediaType ?? mediaTypeRef.current,
        iceServers: options.iceServers,
        onRemoteStream: (stream) => {
          webrtcCallTrace("ui:remote-stream", {
            audioTracks: stream.getAudioTracks().length,
            videoTracks: stream.getVideoTracks().length,
            live: stream.getTracks().some((track) => track.readyState === "live"),
          });
          setRemoteStream(stream);
        },
        onLocalStream: (stream) => {
          setLocalStream(stream);
        },
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
      const configIce = resolveCallIceServers(undefined, nodeConfig?.iceServers);

      try {
        iceCallIdRef.current = callId;
        const transport = buildTransport({
          path: "path2",
          iceServers: configIce,
          mediaType: mediaTypeRef.current,
        });
        transportRef.current = transport;
        const sdpOffer = await transport.startOffer();
        syncMediaAvailability();
        if (!transport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        flushPendingIceCandidates();
        const sent = await nodeService.sendCallReinvite(
          callId,
          sdpOffer,
          configIce as IceServerConfig[],
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
    [nodeService, buildTransport, closeTransport, syncMediaAvailability, notifyMicUnavailable, flushPendingIceCandidates],
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
        const rtcIce = resolveCallIceServers(iceServers);
        const transport = buildTransport({
          path: "path2",
          iceServers: rtcIce,
          mediaType: mediaTypeRef.current,
        });
        transportRef.current = transport;
        const sdpAnswer = await transport.startAnswer(remoteSdp);
        syncMediaAvailability();
        if (!transport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        flushPendingIceCandidates();
        await nodeService.acceptCallInvite(callId, sdpAnswer, rtcIce as IceServerConfig[]);
      } catch (err) {
        console.warn("[useCallSession] callee Path 2 renegotiation failed:", err);
        closeTransport();
        setConnectionState("disconnected");
      }
    },
    [nodeService, buildTransport, closeTransport, syncMediaAvailability, notifyMicUnavailable, flushPendingIceCandidates],
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
          mediaTypeRef.current = event.callType;
          setIncomingCall({
            callId: event.callId,
            peerOwnerId: event.peerOwnerId,
            peerDisplayName: event.peerDisplayName,
            callType: event.callType,
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
          if (!event.sdpAnswer) {
            // Callee-side local ack from acceptInboundCall — transport already running via acceptCall().
            if (activeCallIdRef.current === event.callId && transportRef.current) {
              webrtcCallTrace("ui:call-answered-local-ack", { callId: shortCallId(event.callId) });
              break;
            }
          }
          setIncomingCall(null);
          setPendingSdpOffer(undefined);
          setCallingState(null);
          setConnectionState("connecting");
          if (event.sdpAnswer && transportRef.current) {
            void transportRef.current
              .applyRemoteAnswer(event.sdpAnswer)
              .then(() => flushPendingIceCandidates())
              .catch((err) => {
                webrtcCallWarn("ui:apply-remote-answer-failed", {
                  callId: shortCallId(event.callId),
                  error: err instanceof Error ? err.message.slice(0, 120) : String(err),
                });
                console.warn("[useCallSession] applyRemoteAnswer failed:", err);
                setConnectionState("failed");
                showToast(t("call:failed"), "error");
              });
          } else if (!event.sdpAnswer) {
            webrtcCallWarn("ui:call-answered-no-sdp", { callId: shortCallId(event.callId) });
            setConnectionState("failed");
            showToast(t("call:failed"), "error");
          }
          setActiveCall({
            callId: event.callId,
            peerOwnerId: activePeerRef.current?.ownerId ?? "",
            callType: activePeerRef.current?.callType ?? "audio",
            status: "active",
            muted: false,
          });
          activeCallIdRef.current = event.callId;
          break;
        case "call:ice-candidate":
          if (
            event.callId === activeCallIdRef.current ||
            event.callId === iceCallIdRef.current
          ) {
            if (transportRef.current) {
              void transportRef.current.addIceCandidate(event.candidate);
            } else {
              pendingIceCandidatesRef.current.push(event.candidate);
            }
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
  }, [nodeService, closeTransport, renegotiateCalleePath2, showToast, t, flushPendingIceCandidates]);

  const cancelCallRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!callingState || activeCall) return;
    const timer = setTimeout(() => {
      showToast(t("call:noAnswer"), "info");
      cancelCallRef.current();
    }, CALLER_RINGBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [callingState, activeCall, showToast, t]);

  useEffect(() => {
    if (!activeCall) return;
    const timer = setTimeout(() => {
      setConnectionState((state) => {
        if (state !== "connecting") return state;
        webrtcCallWarn("ui:connection-timeout", { callId: shortCallId(activeCall.callId) });
        showToast(t("call:connectionLost"), "error");
        return "failed";
      });
    }, 45_000);
    return () => clearTimeout(timer);
  }, [activeCall?.callId, showToast, t]);

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
      callType: incomingCall.callType,
    };
    mediaTypeRef.current = incomingCall.callType;
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
      callType: incomingCall.callType,
      status: "active",
      muted: false,
    });

    const inviteIce =
      pendingInviteIceServersRef.current ?? incomingCall.iceServers;
    const nodeConfig = await nodeService.getNodeConfig();
    const pathIceServers = resolveCallIceServers(inviteIce, nodeConfig?.iceServers);

    try {
      closeTransport();
      iceCallIdRef.current = callId;
      const transport = buildTransport({
        path: "path2",
        iceServers: pathIceServers,
        mediaType: incomingCall.callType,
      });
      transportRef.current = transport;
      const sdpAnswer = await transport.startAnswer(remoteSdp);
      syncMediaAvailability();
      if (!transport.isMicAvailable()) {
        notifyMicUnavailable();
      }
      flushPendingIceCandidates();
      const accepted = await nodeService.acceptCallInvite(
        callId,
        sdpAnswer,
        pathIceServers as IceServerConfig[],
      );
      if (!accepted) {
        throw new Error("call.accept delivery failed");
      }
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
    syncMediaAvailability,
    notifyMicUnavailable,
    flushPendingIceCandidates,
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
    async (targetOwnerId: string, displayName?: string, callType: CallMediaType = "audio") => {
      if (!nodeService) return;
      const peerLabel = displayName?.trim() || targetOwnerId;
      mediaTypeRef.current = callType;
      webrtcCallTrace("ui:start-call", { target: shortCallId(targetOwnerId), callType });

      // Show "Calling…" banner immediately — don't wait for invite to complete.
      setActivePeerDisplayName(peerLabel);
      setCallingState("connecting");
      setConnectionState("connecting");

      path2FallbackSentRef.current = false;

      const nodeConfig = await nodeService.getNodeConfig();
      const pathIceServers = resolveCallIceServers(undefined, nodeConfig?.iceServers);

      let sdpOffer: string;
      try {
        closeTransport();
        iceCallIdRef.current = "";
        const tempTransport = buildTransport({
          path: "path2",
          iceServers: pathIceServers,
          mediaType: callType,
          onPath1Timeout: onPath1TimeoutHandler,
        });
        sdpOffer = await tempTransport.startOffer();
        transportRef.current = tempTransport;
        syncMediaAvailability();
        if (!tempTransport.isMicAvailable()) {
          notifyMicUnavailable();
        }
        flushPendingIceCandidates();
        webrtcCallTrace("ui:offer-ready", {
          sdpLen: sdpOffer.length,
          iceServers: pathIceServers.length,
        });
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
        // Omit iceServers so the home ships STUN defaults in the invite payload.
        callId = await nodeService.sendCallInvite(targetOwnerId, sdpOffer, undefined, callType);
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
      activePeerRef.current = { ownerId: targetOwnerId, displayName: peerLabel, callType };
      setActivePeerDisplayName(peerLabel);
      setCallingState(callId);
      setConnectionState("connecting");
      flushPendingOutboundIce(callId);
      webrtcCallTrace("ui:invite-sent", { callId: shortCallId(callId), target: shortCallId(targetOwnerId) });
    },
    [nodeService, buildTransport, closeTransport, onPath1TimeoutHandler, showToast, t, syncMediaAvailability, notifyMicUnavailable, flushPendingIceCandidates, flushPendingOutboundIce],
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
    cameraAvailable,
    connectionState,
    dismissIncoming,
    callingState,
    activePeerDisplayName,
    startCall,
    cancelCall,
    remoteStream,
    localStream,
  };
}
