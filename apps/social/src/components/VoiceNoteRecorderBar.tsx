import { useT } from "../context/I18nContext.js";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type VoiceNoteRecorderBarProps = {
  isCapturing: boolean;
  recordingSeconds: number;
  maxSeconds: number;
  sending?: boolean;
  onCancel: () => void;
  onSend: () => void;
};

export function VoiceNoteRecorderBar({
  isCapturing,
  recordingSeconds,
  maxSeconds,
  sending = false,
  onCancel,
  onSend,
}: VoiceNoteRecorderBarProps) {
  const t = useT();
  const nearLimit = recordingSeconds >= maxSeconds - 10;
  const canSend = !sending && (!isCapturing || recordingSeconds > 0);

  if (sending) {
    return (
      <div
        className="voice-note-recorder is-sending"
        role="status"
        aria-live="polite"
        aria-label={t("audioMessage.sendingLabel")}
      >
        <span className="voice-note-recorder-spinner" aria-hidden />
        <span className="voice-note-recorder-sending-text">{t("audioMessage.sendingLabel")}</span>
      </div>
    );
  }

  return (
    <div
      className={`voice-note-recorder${isCapturing ? " is-capturing" : " is-ready"}`}
      role="region"
      aria-label={t("audioMessage.recorderAria")}
    >
      <button
        type="button"
        className="voice-note-recorder-cancel"
        onClick={onCancel}
        aria-label={t("audioMessage.cancel")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span>{t("audioMessage.cancelShort")}</span>
      </button>

      <div className="voice-note-recorder-body">
        <span className="voice-note-recorder-dot" aria-hidden />
        <div className="voice-note-recorder-meta">
          <span className="voice-note-recorder-label">
            {isCapturing ? t("audioMessage.recordingLabel") : t("audioMessage.readyLabel")}
          </span>
          <span className={`voice-note-recorder-timer${nearLimit ? " near-limit" : ""}`}>
            {formatDuration(recordingSeconds)}
          </span>
        </div>
        <div className="voice-note-recorder-wave" aria-hidden>
          {Array.from({ length: 7 }).map((_, index) => (
            <span key={index} className="voice-note-recorder-wave-bar" style={{ animationDelay: `${index * 0.1}s` }} />
          ))}
        </div>
      </div>

      <button
        type="button"
        className="voice-note-recorder-send"
        onClick={onSend}
        disabled={!canSend}
        aria-label={t("audioMessage.send")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" />
        </svg>
        <span>{t("audioMessage.sendShort")}</span>
      </button>
    </div>
  );
}
