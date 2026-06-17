/**
 * IncomingCallModal — Phase 38 incoming call notification.
 *
 * Shown when a bonded peer initiates a voice call. Displays the
 * caller's name, accept/decline buttons, and an animated ring pulse.
 *
 * @vitest-environment jsdom
 */

import React from "react";
import { useT } from "../context/I18nContext.js";

export interface IncomingCallModalProps {
  /** Caller's display name. */
  callerName: string;
  /** Caller's owner ID. */
  callerOwnerId: string;
  /** Called when the user accepts the call. */
  onAccept: () => void;
  /** Called when the user declines the call. */
  onDecline: () => void;
}

export function IncomingCallModal({
  callerName,
  callerOwnerId,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const t = useT();

  return (
    <div className="incoming-call-overlay" role="dialog" aria-label={t("call:incoming", "Incoming call")}>
      <div className="incoming-call-modal">
        <div className="incoming-call-ring-pulse" aria-hidden>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </div>
        <h2 className="incoming-call-title">
          {callerName || callerOwnerId}
        </h2>
        <p className="incoming-call-subtitle">
          {t("call:incomingSubtitle", "is calling you…")}
        </p>
        <div className="incoming-call-actions">
          <button
            type="button"
            className="primary incoming-call-accept"
            onClick={onAccept}
            aria-label={t("call:accept", "Accept")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t("call:accept", "Accept")}
          </button>
          <button
            type="button"
            className="secondary incoming-call-decline"
            onClick={onDecline}
            aria-label={t("call:decline", "Decline")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            {t("call:decline", "Decline")}
          </button>
        </div>
      </div>
    </div>
  );
}
