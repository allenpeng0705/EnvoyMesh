/**
 * ChatAudioAttachment — audio message player (Phase 37).
 *
 * Renders an HTML5 <audio> element with playback controls for voice notes
 * sent via chat. Fetches the raw audio bytes from the vault and plays them
 * via a Blob object URL (data: URIs often leave AAC/M4A controls grayed out
 * in Chrome / desktop WebViews — EnvoyGo records AAC-LC `.m4a`).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import type { ChatAttachment } from "@envoymesh/api";

export interface ChatAudioAttachmentProps {
  attachment: ChatAttachment;
  /** Transcription text, if available (e.g. from Web Speech API). */
  transcription?: string;
}

/** Normalize MIME so browsers can decode iOS/EnvoyGo AAC voice notes. */
export function normalizeChatAudioMime(
  mimeType: string | undefined,
  filename?: string,
): string {
  const raw = (mimeType ?? "").trim().toLowerCase();
  const base = raw.split(";")[0]?.trim() ?? "";
  const name = (filename ?? "").toLowerCase();
  if (
    base === "audio/mp4" ||
    base === "audio/x-m4a" ||
    base === "audio/m4a" ||
    base === "audio/aac" ||
    name.endsWith(".m4a") ||
    name.endsWith(".aac")
  ) {
    return "audio/mp4";
  }
  if (base.startsWith("audio/")) return base;
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".ogg") || name.endsWith(".oga")) return "audio/ogg";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  return base || "application/octet-stream";
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function ChatAudioAttachment({ attachment, transcription }: ChatAudioAttachmentProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const vaultPath = attachment.vaultRelativePath?.replace(/^[\\/]+/, "");

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const loadAudio = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    setError(false);
    revokeObjectUrl();
    setAudioUrl(null);
    try {
      const result = await nodeService.readLibraryItemContent({ relativePath: vaultPath });
      const mime = normalizeChatAudioMime(
        attachment.mimeType || result.mimeType,
        attachment.filename,
      );
      const bytes = base64ToUint8Array(result.contentBase64);
      if (bytes.byteLength === 0) {
        throw new Error("empty audio");
      }
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioUrl(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [
    nodeService,
    vaultPath,
    attachment.mimeType,
    attachment.filename,
    revokeObjectUrl,
  ]);

  useEffect(() => {
    void loadAudio();
    return () => {
      revokeObjectUrl();
    };
  }, [loadAudio, revokeObjectUrl]);

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
          onError={() => setError(true)}
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
      {transcription ? (
        <p className="chat-audio-transcription">{transcription}</p>
      ) : null}
      {(durationSec != null && durationSec > 0) ? (
        <span className="chat-audio-duration">
          {t("audioMessage.duration", { seconds: durationSec })}
        </span>
      ) : null}
    </div>
  );
}
