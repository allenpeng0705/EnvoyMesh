/**
 * Phase 45 — Web Content Browsing: Browser view.
 *
 * Phase 45A: address bar + Go + render dispatch + contentHash verify.
 * Phase 45B: back/forward/reload, bookmarks, autocomplete, range fetch,
 *            ETag revalidation on reload.
 *
 * Design: docs/web-content-browsing-design.md §4.7, §7.2.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import {
  parseEnvoyUrl,
  resolveEnvoyUrl,
  HandleRegistryNotImplementedError,
  InvalidEnvoyUrlError,
  isEnvoyContentUrl,
} from "@envoymesh/api";
import { Markdown } from "../Markdown.js";
import DOMPurify from "dompurify";
import {
  canGoBack,
  canGoForward,
  createEmptyNavStack,
  goBack,
  goForward,
  pushNav,
  recordBrowserRecent,
  suggestBrowserUrls,
  type BrowserNavStack,
} from "../../lib/browser-history-store.js";
import {
  isBookmarked,
  suggestBrowserBookmarks,
  toggleBrowserBookmark,
} from "../../lib/browser-bookmark-store.js";
import {
  fetchLibraryContent,
  type BrowserFetchCacheEntry,
} from "../../lib/library-read-fetch.js";
import { BrowserAuthorView } from "./BrowserAuthorView.js";
import type { PublishWebContentResult } from "@envoymesh/api";
import { takePendingBrowserUrl } from "../../lib/browser-nav.js";

type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; url: string }
  | {
      kind: "ok";
      url: string;
      mimeType: string;
      body: string;
      byteLength: number;
      isText: boolean;
      etag?: string;
      contentHash?: string;
      fromCache?: boolean;
    }
  | { kind: "error"; message: string };

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyContentHash(
  body: string,
  contentType: string,
  expectedHash: string | undefined,
): Promise<boolean> {
  if (!expectedHash) return true;
  if (typeof crypto === "undefined" || !crypto.subtle) return true;
  const isText = contentType.startsWith("text/") || contentType === "application/json";
  const bytes = isText ? new TextEncoder().encode(body) : base64ToBytes(body);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", ab);
  return bufferToHex(digest) === expectedHash.toLowerCase();
}

function titleFromBody(mimeType: string, body: string, url: string): string {
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    const m = /^#\s+(.+)$/m.exec(body);
    if (m?.[1]) return m[1].trim();
  }
  try {
    const path = parseEnvoyUrl(url).path;
    const seg = path.split("/").filter(Boolean).pop();
    if (seg) return seg;
  } catch {
    /* ignore */
  }
  return url;
}

export function BrowserView() {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile } = useNodeState();
  const ownerId = humanProfile?.ownerId?.trim() ?? "";

  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [nav, setNav] = useState<BrowserNavStack>(() => createEmptyNavStack());
  const [bookmarked, setBookmarked] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const cacheRef = useRef<Map<string, BrowserFetchCacheEntry>>(new Map());

  const parseError = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const parsed = parseEnvoyUrl(trimmed);
      if (parsed.ownerForm === "handle") {
        return "Handle URLs (envoy://@handle/...) are reserved for v2 — use envoy://envoy:owner:<base64>/...";
      }
      return null;
    } catch (e) {
      if (e instanceof InvalidEnvoyUrlError) return e.message;
      if (e instanceof HandleRegistryNotImplementedError) return e.message;
      return e instanceof Error ? e.message : String(e);
    }
  }, [url]);

  const isValid = url.trim().length > 0 && parseError === null && isEnvoyContentUrl(url);

  const suggestions = useMemo(() => {
    const q = url.trim();
    if (!ownerId) return [];
    const fromRecent = suggestBrowserUrls(ownerId, q, 6);
    const fromBookmarks = suggestBrowserBookmarks(ownerId, q, 6);
    const seen = new Set<string>();
    const merged: Array<{ url: string; title?: string; source: "recent" | "bookmark" }> = [];
    for (const b of fromBookmarks) {
      if (seen.has(b.url)) continue;
      seen.add(b.url);
      merged.push({ url: b.url, title: b.title, source: "bookmark" });
    }
    for (const r of fromRecent) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      merged.push({ url: r.url, title: r.title, source: "recent" });
    }
    return merged.slice(0, 8);
  }, [url, ownerId]);

  const navigateGenRef = useRef(0);

  const navigate = useCallback(
    async (target: string, opts?: { pushHistory?: boolean; revalidate?: boolean }) => {
      const pushHistory = opts?.pushHistory !== false;
      const revalidate = opts?.revalidate === true;
      const gen = ++navigateGenRef.current;
      setUrl(target);
      setSuggestionsOpen(false);
      setState({ kind: "loading", url: target });
      try {
        const parsed = parseEnvoyUrl(target);
        const { targetOwnerId, path } = resolveEnvoyUrl(parsed);
        const cache = cacheRef.current.get(target) ?? null;
        const result = await fetchLibraryContent(nodeService.libraryRead.bind(nodeService), {
          targetOwnerId,
          path,
          cache,
          revalidate,
        });
        if (gen !== navigateGenRef.current) return;

        if (result.status === "ok" && result.body !== undefined && result.contentType) {
          if (!result.fromCache) {
            const ok = await verifyContentHash(result.body, result.contentType, result.contentHash);
            if (gen !== navigateGenRef.current) return;
            if (!ok) {
              setState({ kind: "error", message: t("browser.statusHashMismatch") });
              return;
            }
          }
          if (result.etag && result.contentHash) {
            cacheRef.current.set(target, {
              body: result.body,
              contentType: result.contentType,
              contentHash: result.contentHash,
              etag: result.etag,
              byteLength: result.byteLength ?? 0,
              isText: result.isText ?? false,
            });
          }
          const title = titleFromBody(result.contentType, result.body, target);
          if (ownerId) recordBrowserRecent(ownerId, target, title);
          if (pushHistory) {
            setNav((prev) => pushNav(prev, target));
          }
          if (ownerId) setBookmarked(isBookmarked(ownerId, target));
          setState({
            kind: "ok",
            url: target,
            mimeType: result.contentType,
            body: result.body,
            byteLength: result.byteLength ?? 0,
            isText: Boolean(result.isText),
            etag: result.etag,
            contentHash: result.contentHash,
            fromCache: result.fromCache,
          });
        } else if (result.status === "not_found") {
          setState({ kind: "error", message: t("browser.statusNotFound") });
        } else if (result.status === "forbidden") {
          setState({ kind: "error", message: t("browser.statusAccessDenied") });
        } else {
          setState({
            kind: "error",
            message: t("browser.statusError", { message: result.error ?? result.status }),
          });
        }
      } catch (e) {
        if (gen !== navigateGenRef.current) return;
        setState({
          kind: "error",
          message: t("browser.statusError", {
            message: e instanceof Error ? e.message : String(e),
          }),
        });
      }
    },
    [nodeService, ownerId, t],
  );

  useEffect(() => {
    const pending = takePendingBrowserUrl();
    if (pending && isEnvoyContentUrl(pending)) {
      void navigate(pending);
      return;
    }
    setState({ kind: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isValid) void navigate(url);
  }

  function onBack() {
    const next = goBack(nav);
    if (!next) return;
    setNav(next.stack);
    void navigate(next.url, { pushHistory: false });
  }

  function onForward() {
    const next = goForward(nav);
    if (!next) return;
    setNav(next.stack);
    void navigate(next.url, { pushHistory: false });
  }

  function onReload() {
    const current = state.kind === "ok" ? state.url : url.trim();
    if (!current || !isEnvoyContentUrl(current)) return;
    void navigate(current, { pushHistory: false, revalidate: true });
  }

  function onToggleBookmark() {
    if (!ownerId || state.kind !== "ok") return;
    const title = titleFromBody(state.mimeType, state.body, state.url);
    const result = toggleBrowserBookmark(ownerId, state.url, title);
    setBookmarked(result.bookmarked);
  }

  function onPublished(result: PublishWebContentResult) {
    const target = result.listingUrl ?? result.url;
    setUrl(target);
    void navigate(target);
  }

  function onContentLinkClick(e: MouseEvent<HTMLElement>) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || !isEnvoyContentUrl(href)) return;
    e.preventDefault();
    void navigate(href);
  }

  const backEnabled = canGoBack(nav);
  const forwardEnabled = canGoForward(nav);
  const reloadEnabled =
    (state.kind === "ok" && Boolean(state.url)) ||
    (isValid && state.kind !== "loading");

  return (
    <div className="browser-view" data-testid="browser-view">
      <header className="browser-view__header">
        <h2>{t("browser.title")}</h2>
      </header>

      <div className="browser-view__toolbar">
        <button
          type="button"
          className="browser-view__nav-btn"
          data-testid="browser-back"
          aria-label={t("browser.back")}
          title={t("browser.back")}
          disabled={!backEnabled}
          onClick={onBack}
        >
          ←
        </button>
        <button
          type="button"
          className="browser-view__nav-btn"
          data-testid="browser-forward"
          aria-label={t("browser.forward")}
          title={t("browser.forward")}
          disabled={!forwardEnabled}
          onClick={onForward}
        >
          →
        </button>
        <button
          type="button"
          className="browser-view__nav-btn"
          data-testid="browser-reload"
          aria-label={t("browser.reload")}
          title={t("browser.reload")}
          disabled={!reloadEnabled}
          onClick={onReload}
        >
          ↻
        </button>

        <form className="browser-view__form" onSubmit={onSubmit}>
          <div className="browser-view__address-wrap">
            <input
              type="text"
              className="browser-view__address-bar"
              data-testid="browser-address-bar"
              placeholder={t("browser.addressBarPlaceholder", { owner: "<owner-id>" })}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setSuggestionsOpen(true);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => {
                // Delay so suggestion clicks register.
                window.setTimeout(() => setSuggestionsOpen(false), 150);
              }}
              aria-label={t("browser.go")}
              autoComplete="off"
            />
            {suggestionsOpen && suggestions.length > 0 && (
              <ul className="browser-view__suggestions" data-testid="browser-suggestions" role="listbox">
                {suggestions.map((s) => (
                  <li key={s.url}>
                    <button
                      type="button"
                      className="browser-view__suggestion"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void navigate(s.url)}
                    >
                      <span className="browser-view__suggestion-url">{s.url}</span>
                      {s.title && s.title !== s.url && (
                        <span className="browser-view__suggestion-title">{s.title}</span>
                      )}
                      <span className="browser-view__suggestion-source">
                        {s.source === "bookmark"
                          ? t("browser.suggestionBookmark", "Bookmark")
                          : t("browser.suggestionRecent", "Recent")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="submit"
            className="browser-view__go"
            data-testid="browser-go"
            disabled={!isValid}
          >
            {t("browser.go")}
          </button>
          <button
            type="button"
            className={`browser-view__bookmark${bookmarked ? " browser-view__bookmark--active" : ""}`}
            data-testid="browser-bookmark-star"
            aria-label={t("browser.bookmark")}
            title={t("browser.bookmark")}
            disabled={state.kind !== "ok" || !ownerId}
            onClick={onToggleBookmark}
          >
            {bookmarked ? "★" : "☆"}
          </button>
          <button
            type="button"
            className="browser-view__author-btn"
            data-testid="browser-author-open"
            disabled={!ownerId}
            onClick={() => setAuthorOpen((v) => !v)}
          >
            {authorOpen
              ? t("browser.author.close", "Close author")
              : t("browser.author.open", "New…")}
          </button>
        </form>
      </div>

      {authorOpen && (
        <div className="browser-view__author-panel" data-testid="browser-author-panel">
          <BrowserAuthorView
            onCancel={() => setAuthorOpen(false)}
            onPublished={(result) => {
              // Keep the panel open so the published confirmation (URL) is visible;
              // Done / Cancel closes via onCancel. Still navigate to the new listing.
              onPublished(result);
            }}
          />
        </div>
      )}

      {parseError !== null && (
        <p className="browser-view__parse-error" data-testid="browser-parse-error">
          {t("browser.invalidUrl", { message: parseError })}
        </p>
      )}

      <div className="browser-view__render" data-testid="browser-render-area">
        {state.kind === "loading" && (
          <div className="browser-view__loading" data-testid="browser-loading">
            <span className="browser-view__spinner" aria-hidden="true" />
            <p>{t("browser.loading")}</p>
          </div>
        )}
        {state.kind === "error" && (
          <p className="browser-view__error" data-testid="browser-error">
            {state.message}
          </p>
        )}
        {state.kind === "ok" && state.isText && (
          <RenderText mimeType={state.mimeType} body={state.body} onLinkClick={onContentLinkClick} />
        )}
        {state.kind === "ok" && !state.isText && (
          <RenderBinary mimeType={state.mimeType} body={state.body} url={state.url} t={t} />
        )}
        {state.kind === "idle" && (
          <p className="browser-view__idle">{t("browser.idleHint", "Enter an envoy:// URL to browse.")}</p>
        )}
      </div>

      {state.kind === "ok" && (
        <p className="browser-view__status" data-testid="browser-status">
          {state.fromCache
            ? t("browser.statusCached", "Cached — {mimeType}, {byteLength} bytes", {
                mimeType: state.mimeType,
                byteLength: state.byteLength,
              })
            : t("browser.statusOk", {
                mimeType: state.mimeType,
                byteLength: state.byteLength,
              })}
        </p>
      )}
    </div>
  );
}

function RenderText({
  mimeType,
  body,
  onLinkClick,
}: {
  mimeType: string;
  body: string;
  onLinkClick: (e: MouseEvent<HTMLElement>) => void;
}) {
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return (
      <article
        className="browser-view__markdown"
        data-testid="browser-markdown"
        onClick={onLinkClick}
      >
        <Markdown text={body} />
      </article>
    );
  }
  if (mimeType === "text/html") {
    // Defense in depth: sanitize with DOMPurify AND sandbox the iframe.
    // The sandbox="" attribute alone would prevent script execution,
    // but DOMPurify strips event handlers and other injection vectors
    // before the content reaches the iframe's parser. Design §6.
    const sanitized = DOMPurify.sanitize(body, { FORBID_TAGS: ["script", "iframe", "object", "embed"] });
    return (
      <iframe
        className="browser-view__html"
        data-testid="browser-html"
        srcDoc={sanitized}
        sandbox=""
        title="rendered-html"
      />
    );
  }
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
  t: ReturnType<typeof useT>;
}) {
  const bytes = base64ToBytes(body);
  const objectUrl = useMemo(() => {
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const blob = new Blob([ab], { type: mimeType });
    return URL.createObjectURL(blob);
  }, [body, mimeType]);

  useEffect(() => {
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  if (mimeType === "application/pdf") {
    return (
      <iframe
        className="browser-view__pdf"
        data-testid="browser-pdf"
        src={objectUrl}
        title={url}
      />
    );
  }
  if (mimeType.startsWith("image/")) {
    return (
      <img
        className="browser-view__image"
        data-testid="browser-image"
        src={objectUrl}
        alt={t("browser.openImage")}
      />
    );
  }
  if (mimeType.startsWith("audio/")) {
    return <audio className="browser-view__audio" data-testid="browser-audio" src={objectUrl} controls />;
  }
  if (mimeType.startsWith("video/")) {
    return <video className="browser-view__video" data-testid="browser-video" src={objectUrl} controls />;
  }
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
