import { useEffect, useRef, useState, useCallback } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { isAudioPlaceholderChatText, type ChatAttachment } from "@envoymesh/api";

export interface ChatAudioAttachmentProps {
  attachment: ChatAttachment;
  /** Transcription text, if available (e.g. from Web Speech API). */
  transcription?: string;
  /** When set, reload audio after this attachment transfer completes. */
  messageId?: string;
}

export function ChatAudioAttachment({ attachment, transcription, messageId }: ChatAudioAttachmentProps) {
  const t = useT();
  const nodeService = useNodeService();
  const caption =
    transcription && !isAudioPlaceholderChatText(transcription) ? transcription : undefined;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [transferPending, setTransferPending] = useState(!attachment.vaultRelativePath);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vaultPath = attachment.vaultRelativePath?.replace(/^[\\/]+/, "");

  const loadAudio = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    setError(false);
    try {
      const result = await nodeService.readLibraryItemContent({ relativePath: vaultPath });
      setAudioUrl(`data:${result.mimeType};base64,${result.contentBase64}`);
      setTransferPending(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [nodeService, vaultPath]);

  useEffect(() => {
    if (vaultPath) {
      void loadAudio();
    }
  }, [loadAudio, vaultPath]);

  useEffect(() => {
    if (!messageId || !attachment.id) {
      return;
    }
    const unsub = nodeService.on?.("chat:attachment-transfer", (raw) => {
      const event = raw as {
        messageId?: string;
        attachmentId?: string;
        status?: string;
        stage?: string;
      };
      if (event.messageId !== messageId || event.attachmentId !== attachment.id) {
        return;
      }
      if (event.status === "started") {
        setTransferPending(true);
      }
      if (event.status === "completed" && (event.stage === "share" || event.stage === "data")) {
        setTransferPending(false);
        void loadAudio();
      }
      if (event.status === "failed") {
        setTransferPending(false);
        setError(true);
      }
    });
    return () => unsub?.();
  }, [attachment.id, loadAudio, messageId, nodeService]);

  return (
    <div className="chat-audio-attachment">
      {!vaultPath || transferPending ? (
        <span className="chat-audio-loading">{t("audioMessage.loading", "Loading audio…")}</span>
      ) : loading ? (
        <span className="chat-audio-loading">{t("audioMessage.loading", "Loading audio…")}</span>
      ) : error || !audioUrl ? (
        <span className="chat-audio-error">{t("audioMessage.error", "Audio unavailable")}</span>
      ) : (
        <audio
          ref={audioRef}
          className="chat-audio-player"
          controls
          preload="metadata"
          src={audioUrl}
          onLoadedMetadata={() => {
            const el = audioRef.current;
            if (el && isFinite(el.duration) && el.duration > 0) {
              setDurationSec(Math.round(el.duration));
            }
          }}
        >
          {t("audioMessage.unsupported", "Your browser does not support audio playback.")}
        </audio>
      )}
      {caption ? (
        <p className="chat-audio-transcription">{caption}</p>
      ) : null}
      {(durationSec != null && durationSec > 0) ? (
        <span className="chat-audio-duration">
          {t("audioMessage.durationSec", { seconds: durationSec })}
        </span>
      ) : null}
    </div>
  );
}
