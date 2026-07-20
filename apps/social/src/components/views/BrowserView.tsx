/**
 * Phase 45 — Web Content Browsing: Browser view.
 *
 * The in-app "browser" for content served by bonded contacts over the
 * mesh via the `library.read` intent. Supports Markdown, images, PDFs,
 * audio, video, and raw file downloads. Mirrors the design from
 * docs/web-content-browsing-design.md §4.7.
 *
 * Usage: open via the "browser" ViewName, type an envoy:// URL in the
 * address bar, or click a "Browse Site" button on a contact profile
 * (added in 45D).
 */
import { useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { parseEnvoyUrl, resolveEnvoyUrl, HandleRegistryNotImplementedError, InvalidEnvoyUrlError, isEnvoyContentUrl } from "@envoymesh/api";
import { Markdown } from "../Markdown.js";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; url: string }
  | { kind: "ok"; url: string; mimeType: string; body: string; byteLength: number; isText: boolean }
  | { kind: "error"; message: string };

/** Decode a base64 string to a Uint8Array without going through a string intermediary. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode Uint8Array to a base64 string (browser-safe). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function BrowserView() {
  const t = useT();
  const nodeService = useNodeService();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  const parseError = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      parseEnvoyUrl(trimmed);
      return null;
    } catch (e) {
      if (e instanceof InvalidEnvoyUrlError) return e.message;
      if (e instanceof HandleRegistryNotImplementedError) return e.message;
      return e instanceof Error ? e.message : String(e);
    }
  }, [url]);

  const isValid = url.trim().length > 0 && parseError === null && isEnvoyContentUrl(url);

  async function navigate(target: string) {
    setUrl(target);
    setState({ kind: "loading", url: target });
    try {
      const parsed = parseEnvoyUrl(target);
      const { targetOwnerId, path } = resolveEnvoyUrl(parsed);
      const result = await nodeService.libraryRead({ targetOwnerId, path });
      if (result.status === "ok" && result.body !== undefined && result.contentType) {
        setState({
          kind: "ok",
          url: target,
          mimeType: result.contentType,
          body: result.body,
          byteLength: result.byteLength ?? 0,
          isText: result.contentType.startsWith("text/") || result.contentType === "application/json",
        });
      } else if (result.status === "not_found") {
        setState({ kind: "error", message: t("browser.statusNotFound") });
      } else if (result.status === "forbidden") {
        setState({ kind: "error", message: t("browser.statusAccessDenied") });
      } else if (result.status === "too_large") {
        setState({ kind: "error", message: t("browser.statusTooLarge") });
      } else {
        setState({ kind: "error", message: `${result.status}: ${result.error ?? ""}` });
      }
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Reset to idle on mount so stale state from a previous view doesn't leak.
  useEffect(() => {
    setState({ kind: "idle" });
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isValid) void navigate(url);
  }

  return (
    <div className="browser-view" data-testid="browser-view">
      <header className="browser-view__header">
        <h2>{t("browser.title")}</h2>
      </header>
      <form className="browser-view__form" onSubmit={onSubmit}>
        <input
          type="text"
          className="browser-view__address-bar"
          data-testid="browser-address-bar"
          placeholder={t("browser.addressBarPlaceholder", { owner: "<owner-id>" })}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label={t("browser.go")}
        />
        <button
          type="submit"
          className="browser-view__go"
          data-testid="browser-go"
          disabled={!isValid}
        >
          {t("browser.go")}
        </button>
      </form>
      {parseError !== null && (
        <p className="browser-view__parse-error" data-testid="browser-parse-error">
          {t("browser.invalidUrl", { message: parseError })}
        </p>
      )}

      <div className="browser-view__render" data-testid="browser-render-area">
        {state.kind === "loading" && <p className="browser-view__loading">{t("browser.loading")}</p>}
        {state.kind === "error" && (
          <p className="browser-view__error" data-testid="browser-error">
            {state.message}
          </p>
        )}
        {state.kind === "ok" && state.isText && (
          <RenderText mimeType={state.mimeType} body={state.body} />
        )}
        {state.kind === "ok" && !state.isText && (
          <RenderBinary
            mimeType={state.mimeType}
            body={state.body}
            url={state.url}
            t={t}
          />
        )}
      </div>

      {state.kind === "ok" && (
        <p className="browser-view__status" data-testid="browser-status">
          {t("browser.statusOk", { mimeType: state.mimeType, byteLength: state.byteLength })}
        </p>
      )}
    </div>
  );
}

function RenderText({ mimeType, body }: { mimeType: string; body: string }) {
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return (
      <article className="browser-view__markdown" data-testid="browser-markdown">
        <Markdown text={body} />
      </article>
    );
  }
  if (mimeType === "text/html") {
    // Sandboxed iframe — same pattern as existing rendered HTML content.
    // We display the raw HTML inside an iframe with sandbox attributes.
    // Content is delivered over the mesh (signed envelope) so we trust
    // the source, but the sandbox limits what scripts can do.
    return (
      <iframe
        className="browser-view__html"
        data-testid="browser-html"
        srcDoc={body}
        sandbox=""
        title="rendered-html"
      />
    );
  }
  // Default: render raw text in a <pre> for code/plain text.
  return (
    <pre className="browser-view__text" data-testid="browser-text">
      {body}
    </pre>
  );
}

function RenderBinary({
  mimeType,
  body,
  url,
  t,
}: {
  mimeType: string;
  body: string;
  url: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const bytes = useMemo(() => base64ToBytes(body), [body]);
  const objectUrl = useMemo(() => {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
    // Cast bytes to a fresh ArrayBuffer to satisfy the strict Blob
    // type (Uint8Array<ArrayBufferLike> -> ArrayBuffer).
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const blob = new Blob([arrayBuffer], { type: mimeType });
    return URL.createObjectURL(blob);
  }, [bytes, mimeType]);

  // Revoke the object URL when the component unmounts or the body changes.
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  if (mimeType === "application/pdf" && objectUrl) {
    return (
      <iframe
        className="browser-view__pdf"
        data-testid="browser-pdf"
        src={objectUrl}
        title="rendered-pdf"
      />
    );
  }
  if (mimeType.startsWith("image/") && objectUrl) {
    return (
      <img
        className="browser-view__image"
        data-testid="browser-image"
        src={objectUrl}
        alt={url}
      />
    );
  }
  if (mimeType.startsWith("audio/") && objectUrl) {
    return <audio className="browser-view__audio" data-testid="browser-audio" src={objectUrl} controls />;
  }
  if (mimeType.startsWith("video/") && objectUrl) {
    return <video className="browser-view__video" data-testid="browser-video" src={objectUrl} controls />;
  }
  // Fallback: download link.
  if (objectUrl) {
    const filename = url.split("/").pop() || "download";
    return (
      <a
        className="browser-view__download"
        data-testid="browser-download"
        href={objectUrl}
        download={filename}
      >
        {t("browser.download", { filename })}
      </a>
    );
  }
  // SSR / no-URL fallback.
  return <pre className="browser-view__text">{`(${mimeType} — ${bytes.byteLength} bytes)`}</pre>;
}
