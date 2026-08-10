/**
 * ChatAudioAttachment — audio message player (Phase 37).
 *
 * Fetches vault bytes and plays via a Blob object URL. Prefer WAV from
 * EnvoyGo (`audio/wav`) for reliable Mac Safari/Chrome playback; AAC/m4a
 * still normalized to `audio/mp4`. Blob URLs beat data: URIs for duration.
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

function readFiniteDurationSec(el: HTMLAudioElement): number | null {
  const d = el.duration;
  if (!isFinite(d) || d <= 0) return null;
  return Math.max(1, Math.round(d));
}

export function ChatAudioAttachment({ attachment, transcription }: ChatAudioAttachmentProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState("audio/mp4");
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

  const applyDuration = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const sec = readFiniteDurationSec(el);
    if (sec != null) setDurationSec(sec);
  }, []);

  const loadAudio = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    setError(false);
    revokeObjectUrl();
    setAudioUrl(null);
    setDurationSec(null);
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
      // Fresh ArrayBuffer-backed view for BlobPart (TS 5.7+ / lib.dom).
      const blob = new Blob([bytes.slice()], { type: mime });
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setAudioMime(mime);
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

  // AAC/MP4 sometimes reports duration only after `durationchange`, not
  // `loadedmetadata` (or reports Infinity until more bytes are buffered).
  useEffect(() => {
    if (!audioUrl) return;
    const el = audioRef.current;
    if (!el) return;
    const onMeta = () => applyDuration();
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("loadeddata", onMeta);
    // Force metadata probe once the blob URL is attached.
    try {
      el.load();
    } catch {
      /* ignore */
    }
    return () => {
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("loadeddata", onMeta);
    };
  }, [audioUrl, applyDuration]);

  return (
    <div className="chat-audio-attachment">
      {!vaultPath ? (
        <span className="chat-audio-loading">{t("chat.audioMessage.loading", "Loading audio…")}</span>
      ) : loading ? (
        <span className="chat-audio-loading">{t("chat.audioMessage.loading", "Loading audio…")}</span>
      ) : error || !audioUrl ? (
        <span className="chat-audio-error">{t("chat.audioMessage.error", "Audio unavailable")}</span>
      ) : (
        <audio
          ref={audioRef}
          className="chat-audio-player"
          controls
          preload="auto"
          onError={() => {
            // One soft retry: some WebViews fire a transient error before
            // the blob is ready; only mark unavailable on a second failure.
            const el = audioRef.current;
            if (el && el.dataset.retry !== "1") {
              el.dataset.retry = "1";
              try {
                el.load();
              } catch {
                setError(true);
              }
              return;
            }
            setError(true);
          }}
        >
          <source src={audioUrl} type={audioMime} />
          {audioMime === "audio/mp4" ? (
            <source src={audioUrl} type="audio/aac" />
          ) : null}
          {t("chat.audioMessage.unsupported", "Your browser does not support audio playback.")}
        </audio>
      )}
      {transcription ? (
        <p className="chat-audio-transcription">{transcription}</p>
      ) : null}
      {(durationSec != null && durationSec > 0) ? (
        <span className="chat-audio-duration">
          {t("chat.audioMessage.duration", { seconds: durationSec })}
        </span>
      ) : null}
    </div>
  );
}
