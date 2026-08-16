import { useMemo, useState } from "react";
import type { RunMmxMediaCommandResult } from "@envoymesh/api";
import { formatMmxMediaResult } from "../lib/ext-agent-slash-commands.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";

export interface MmxMediaResultBlockProps {
  result: RunMmxMediaCommandResult;
}

function isImageMime(mime: string | undefined): boolean {
  return Boolean(mime?.toLowerCase().startsWith("image/"));
}

function isAudioMime(mime: string | undefined): boolean {
  return Boolean(mime?.toLowerCase().startsWith("audio/"));
}

/** Inline preview + path copy / reveal for MiniMax media slash results. */
export function MmxMediaResultBlock({ result }: MmxMediaResultBlockProps) {
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const caption = useMemo(() => formatMmxMediaResult(result), [result]);
  const dataUrl =
    result.ok && result.contentBase64 && result.mimeType
      ? `data:${result.mimeType};base64,${result.contentBase64}`
      : null;

  const copyPath = async () => {
    if (!result.path) return;
    try {
      await navigator.clipboard.writeText(result.path);
      setCopied(true);
      showToast("Path copied", "success");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Could not copy path", "error");
    }
  };

  const revealPath = async () => {
    if (!result.path) return;
    setRevealBusy(true);
    try {
      const out = await nodeService.revealHomeFsPath({ path: result.path });
      if (!out.ok) {
        showToast(out.error ?? "Could not reveal path", "error");
        return;
      }
      showToast("Opened in file manager", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRevealBusy(false);
    }
  };

  return (
    <div className="mmx-media-result">
      <pre className="mmx-media-result-text">{caption}</pre>
      {dataUrl && isImageMime(result.mimeType) ? (
        <img
          className="mmx-media-result-preview"
          src={dataUrl}
          alt={result.path ?? "MiniMax image"}
          loading="lazy"
        />
      ) : null}
      {dataUrl && isAudioMime(result.mimeType) ? (
        <audio className="mmx-media-result-audio" controls src={dataUrl} preload="metadata" />
      ) : null}
      {result.path ? (
        <div className="mmx-media-result-actions">
          <button type="button" className="secondary" onClick={() => void copyPath()}>
            {copied ? "Copied" : "Copy path"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={revealBusy}
            onClick={() => void revealPath()}
          >
            {revealBusy ? "Opening…" : "Reveal in folder"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
