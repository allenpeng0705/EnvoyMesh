/**
 * ChatAudioAttachment — audio message player (Phase 37).
 *
 * Renders an HTML5 <audio> element with playback controls for voice notes
 * sent via chat. Fetches the raw audio bytes from the vault and renders
 * them as a data: URI. If a transcription is available (passed via the
 * optional `transcription` prop), it is shown as captions below the player.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { isAudioPlaceholderChatText, type ChatAttachment } from "@envoymesh/api";

export interface ChatAudioAttachmentProps {
  attachment: ChatAttachment;
  /** Transcription text, if available (e.g. from Web Speech API). */
  transcription?: string;
}

export function ChatAudioAttachment({ attachment, transcription }: ChatAudioAttachmentProps) {
  const t = useT();
  const nodeService = useNodeService();
  const caption =
    transcription && !isAudioPlaceholderChatText(transcription) ? transcription : undefined;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null); // I3: actual duration from loadedmetadata
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vaultPath = attachment.vaultRelativePath?.replace(/^[\\/]+/, "");

  const loadAudio = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    setError(false);
    try {
      const result = await nodeService.readLibraryItemContent({ relativePath: vaultPath });
      setAudioUrl(`data:${result.mimeType};base64,${result.contentBase64}`);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [nodeService, vaultPath]);

  useEffect(() => {
    void loadAudio();
  }, [loadAudio]);

  return (
    <div className="chat-audio-attachment">
      {!vaultPath ? (
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
          {t("audioMessage.duration", { seconds: durationSec })}
        </span>
      ) : null}
    </div>
  );
}
