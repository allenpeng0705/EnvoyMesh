/**
 * IncomingCallModal — full-screen incoming voice call overlay.
 *
 * @vitest-environment jsdom
 */

import React from "react";
import { useT } from "../context/I18nContext.js";

export interface IncomingCallModalProps {
  callerName: string;
  callerOwnerId: string;
  onAccept: () => void;
  onDecline: () => void;
}

function callerInitial(name: string, ownerId: string): string {
  const fromName = name.trim().charAt(0);
  if (fromName && !fromName.startsWith("envoy")) {
    return fromName.toUpperCase();
  }
  const tail = ownerId.split(":").pop() ?? ownerId;
  return (tail.charAt(0) || "?").toUpperCase();
}

function displayCallerName(name: string, ownerId: string): string {
  const trimmed = name.trim();
  if (trimmed && !trimmed.startsWith("envoy:") && !trimmed.startsWith("envoy_")) {
    return trimmed;
  }
  const short = ownerId.split(":").pop() ?? ownerId;
  return short.length > 16 ? `${short.slice(0, 12)}…` : short;
}

export function IncomingCallModal({
  callerName,
  callerOwnerId,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const t = useT();
  const label = displayCallerName(callerName, callerOwnerId);
  const initial = callerInitial(callerName, callerOwnerId);

  return (
    <div
      className="incoming-call-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("call:incoming", "Incoming call")}
    >
      <div className="incoming-call-backdrop" aria-hidden />
      <div className="incoming-call-sheet">
        <div className="incoming-call-hero">
          <div className="incoming-call-avatar-ring" aria-hidden />
          <div className="incoming-call-avatar" aria-hidden>
            {initial}
          </div>
        </div>

        <p className="incoming-call-eyebrow">{t("call:incoming", "Incoming call")}</p>
        <h2 className="incoming-call-name">{label}</h2>
        <p className="incoming-call-subtitle">
          {t("call:incomingSubtitle", "is calling you…")}
        </p>

        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-action incoming-call-action--decline"
            onClick={onDecline}
            aria-label={t("call:decline", "Decline")}
          >
            <span className="incoming-call-action-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </span>
            <span className="incoming-call-action-label">{t("call:decline", "Decline")}</span>
          </button>

          <button
            type="button"
            className="incoming-call-action incoming-call-action--accept"
            onClick={onAccept}
            aria-label={t("call:accept", "Accept")}
          >
            <span className="incoming-call-action-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </span>
            <span className="incoming-call-action-label">{t("call:accept", "Accept")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
