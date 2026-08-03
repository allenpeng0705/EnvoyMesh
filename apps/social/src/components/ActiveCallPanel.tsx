/**
 * ActiveCallPanel — in-call voice/video UI (bottom dock).
 *
 * @vitest-environment jsdom
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import type { CallMediaType } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { webrtcCallTrace, webrtcCallWarn } from "../lib/webrtc-call-trace.js";

export interface ActiveCallPanelProps {
  peerDisplayName: string;
  peerOwnerId: string;
  callType: CallMediaType;
  isMuted: boolean;
  isRemoteMuted: boolean;
  micAvailable: boolean;
  cameraAvailable: boolean;
  connectionState: string;
  remoteStream?: MediaStream | null;
  localStream?: MediaStream | null;
  onToggleMute: () => void;
  onEndCall: () => void;
}

function peerInitial(name: string, ownerId: string): string {
  const fromName = name.trim().charAt(0);
  if (fromName && !fromName.startsWith("envoy")) {
    return fromName.toUpperCase();
  }
  const tail = ownerId.split(":").pop() ?? ownerId;
  return (tail.charAt(0) || "?").toUpperCase();
}

function displayPeerName(name: string, ownerId: string): string {
  const trimmed = name.trim();
  if (trimmed && !trimmed.startsWith("envoy:") && !trimmed.startsWith("envoy_")) {
    return trimmed;
  }
  const short = ownerId.split(":").pop() ?? ownerId;
  return short.length > 16 ? `${short.slice(0, 12)}…` : short;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function connectionDotClass(state: string): string {
  switch (state) {
    case "connected":
      return "active-call-dot--connected";
    case "ringing":
    case "connecting":
      return "active-call-dot--connecting";
    case "disconnected":
    case "failed":
      return "active-call-dot--disconnected";
    default:
      return "active-call-dot--idle";
  }
}

export function ActiveCallPanel({
  peerDisplayName,
  peerOwnerId,
  callType,
  isMuted,
  isRemoteMuted,
  micAvailable,
  cameraAvailable,
  connectionState,
  remoteStream,
  localStream,
  onToggleMute,
  onEndCall,
}: ActiveCallPanelProps) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const label = displayPeerName(peerDisplayName, peerOwnerId);
  const initial = peerInitial(peerDisplayName, peerOwnerId);
  const isConnected = connectionState === "connected";
  const isVideoCall = callType === "video";
  const hasRemoteVideo = Boolean(remoteStream?.getVideoTracks().some((track) => track.readyState === "live"));

  const statusLabel = (() => {
    if (connectionState === "ringing") return t("call:ringing", "Ringing…");
    if (connectionState === "connecting") return t("call:connecting", "Connecting…");
    if (connectionState === "connected") return t("call:connected", "Connected");
    if (connectionState === "disconnected" || connectionState === "failed") {
      return t("call:connectionLost", "Connection lost");
    }
    return t("call:connecting", "Connecting…");
  })();

  const playRemoteAudio = useCallback(async () => {
    const audio = remoteAudioRef.current;
    if (!audio || !remoteStream) return;

    audio.srcObject = remoteStream;
    audio.volume = 1;
    audio.muted = false;

    try {
      await audio.play();
      webrtcCallTrace("ui:remote-audio-play", {
        trackCount: remoteStream.getAudioTracks().length,
      });
    } catch (err) {
      webrtcCallWarn("ui:remote-audio-play-failed", {
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
    }
  }, [remoteStream]);

  useEffect(() => {
    void playRemoteAudio();
  }, [remoteStream, connectionState, playRemoteAudio]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video || !isVideoCall) return;
    if (remoteStream && hasRemoteVideo) {
      video.srcObject = remoteStream;
      void video.play().catch(() => undefined);
    } else {
      video.srcObject = null;
    }
  }, [remoteStream, isVideoCall, hasRemoteVideo, connectionState]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !isVideoCall) return;
    if (localStream && cameraAvailable && localStream.getVideoTracks().length > 0) {
      video.srcObject = localStream;
      void video.play().catch(() => undefined);
    } else {
      video.srcObject = null;
    }
  }, [localStream, cameraAvailable, isVideoCall]);

  useEffect(() => {
    if (!isConnected) {
      setElapsed(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isConnected]);

  return (
    <div
      className={`active-call-panel${isVideoCall ? " active-call-panel--video" : ""}`}
      role="region"
      aria-label={
        isVideoCall
          ? t("call:activeVideoCall", "Active video call")
          : t("call:activeCall", "Active call")
      }
    >
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        aria-hidden
        className="active-call-remote-audio"
      />

      {isVideoCall ? (
        <div className="active-call-video-stage" aria-hidden={!hasRemoteVideo}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="active-call-remote-video"
          />
          {!hasRemoteVideo ? (
            <div className="active-call-video-placeholder">
              <span className="active-call-video-placeholder-initial">{initial}</span>
            </div>
          ) : null}
          {localStream && cameraAvailable ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="active-call-local-video"
            />
          ) : null}
        </div>
      ) : null}

      <div className="active-call-main">
        {!isVideoCall ? (
          <div className="active-call-avatar" aria-hidden>
            {initial}
          </div>
        ) : null}

        <div className="active-call-info">
          <h3 className="active-call-name">{label}</h3>
          <div className="active-call-status">
            <span
              className={`active-call-dot ${connectionDotClass(connectionState)}`}
              aria-hidden
            />
            <span className="active-call-status-text">{statusLabel}</span>
            {isConnected ? (
              <span className="active-call-duration">{formatDuration(elapsed)}</span>
            ) : null}
          </div>
          {!micAvailable ? (
            <p className="active-call-hint">{t("call:micUnavailable", "No microphone — listen only")}</p>
          ) : isRemoteMuted ? (
            <p className="active-call-hint">{t("call:remoteMuted", "They are muted")}</p>
          ) : isVideoCall && !cameraAvailable ? (
            <p className="active-call-hint">{t("call:cameraUnavailable", "No camera — audio only")}</p>
          ) : null}
        </div>
      </div>

      <div className="active-call-controls">
        <button
          type="button"
          className={`active-call-control active-call-control--mute${isMuted ? " active-call-control--muted" : ""}${!micAvailable ? " active-call-control--disabled" : ""}`}
          onClick={onToggleMute}
          disabled={!micAvailable}
          aria-label={
            !micAvailable
              ? t("call:micUnavailable", "No microphone — listen only")
              : isMuted
                ? t("call:unmute", "Unmute")
                : t("call:mute", "Mute")
          }
          title={
            !micAvailable
              ? t("call:micUnavailable", "No microphone — listen only")
              : isMuted
                ? t("call:unmute", "Unmute")
                : t("call:mute", "Mute")
          }
        >
          {!micAvailable ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : isMuted ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          <span className="active-call-control-label">
            {!micAvailable
              ? t("call:micOff", "Mic off")
              : isMuted
                ? t("call:unmute", "Unmute")
                : t("call:mute", "Mute")}
          </span>
        </button>

        <button
          type="button"
          className="active-call-control active-call-control--end"
          onClick={onEndCall}
          aria-label={t("call:end", "End call")}
          title={t("call:end", "End call")}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
          <span className="active-call-control-label">{t("call:end", "End call")}</span>
        </button>
      </div>
    </div>
  );
}
