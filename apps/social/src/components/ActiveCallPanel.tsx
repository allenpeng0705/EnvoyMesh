/**
 * ActiveCallPanel — Phase 38 active voice call UI.
 *
 * Shown during an active call. Displays the peer's name, call
 * duration, mute toggle, and end-call button with connection
 * quality indicator.
 *
 * @vitest-environment jsdom
 */

import React, { useState, useEffect, useRef } from "react";
import { useT } from "../context/I18nContext.js";

export interface ActiveCallPanelProps {
  /** Remote peer's display name. */
  peerDisplayName: string;
  /** Whether the local microphone is muted. */
  isMuted: boolean;
  /** WebRTC connection state. */
  connectionState: string;
  /** Called when the user toggles mute. */
  onToggleMute: () => void;
  /** Called when the user ends the call. */
  onEndCall: () => void;
}

/** Format seconds as MM:SS. */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function connectionColor(state: string): string {
  switch (state) {
    case "connected": return "#4caf50";
    case "connecting": return "#ff9800";
    case "disconnected": return "#f44336";
    default: return "#9e9e9e";
  }
}

export function ActiveCallPanel({
  peerDisplayName,
  isMuted,
  connectionState,
  onToggleMute,
  onEndCall,
}: ActiveCallPanelProps) {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stateColor = connectionColor(connectionState);

  return (
    <div className="active-call-panel" role="region" aria-label={t("call:activeCall", "Active call")}>
      <div className="active-call-header">
        <div className="active-call-avatar" aria-hidden>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div className="active-call-info">
          <h3 className="active-call-name">{peerDisplayName}</h3>
          <div className="active-call-status">
            <span
              className="active-call-dot"
              style={{ backgroundColor: stateColor }}
              aria-hidden
            />
            <span className="active-call-duration">{formatDuration(elapsed)}</span>
          </div>
        </div>
      </div>

      <div className="active-call-controls">
        <button
          type="button"
          className={`secondary active-call-mute-btn${isMuted ? " muted" : ""}`}
          onClick={onToggleMute}
          aria-label={isMuted ? t("call:unmute", "Unmute") : t("call:mute", "Mute")}
          title={isMuted ? t("call:unmute", "Unmute") : t("call:mute", "Mute")}
        >
          {isMuted ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="primary active-call-end-btn"
          onClick={onEndCall}
          aria-label={t("call:end", "End call")}
          title={t("call:end", "End call")}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="23" y1="1" x2="1" y2="23" />
          </svg>
        </button>
      </div>
    </div>
  );
}
