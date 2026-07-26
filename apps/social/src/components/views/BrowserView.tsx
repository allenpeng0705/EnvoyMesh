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
import type { HelloProfile } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToastOptional } from "../../hooks/useToast.js";
import {
  parseEnvoyUrl,
  resolveEnvoyUrl,
  HandleRegistryNotImplementedError,
  InvalidEnvoyUrlError,
  isEnvoyContentUrl,
  defaultWebSurfaceForPath,
} from "@envoymesh/api";
import { BrowserMarkdown } from "../BrowserMarkdown.js";
import { BrowserPhotoGallery } from "../BrowserPhotoGallery.js";
import { BrowserHtmlDocument } from "../BrowserHtmlDocument.js";
import { BrowserProfilePortal } from "../BrowserProfilePortal.js";
import { parsePhotoWallMarkdown } from "../../lib/parse-photo-wall-markdown.js";
import { parseProfilePortalHtml } from "../../lib/parse-profile-portal-html.js";
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
  type LibraryReadFn,
} from "../../lib/library-read-fetch.js";
import {
  loadOutboundHellos,
  markOutboundHello,
  resolvePeerHelloState,
} from "../../lib/discover-peer-state.js";
import { BrowserAuthorView } from "./BrowserAuthorView.js";
import type { PublishWebContentResult } from "@envoymesh/api";
import {
  takePendingBrowserUrl,
  takePendingAuthorTemplate,
  OPEN_BROWSER_EVENT,
  notifyWebSectionsChanged,
} from "../../lib/browser-nav.js";
import { BrowserBazaarView } from "./BrowserBazaarView.js";
import type { AuthorTemplate } from "./BrowserAuthorView.js";

type BrowserMode = "browse" | "bazaar";

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
  | { kind: "error"; message: string; code?: "not_found" | "forbidden" | "other"; remote?: boolean };

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

export function BrowserView({ initialMode }: { initialMode?: BrowserMode } = {}) {
  const t = useT();
  const nodeService = useNodeService();
  const { humanProfile, bonds, sendHello } = useNodeState();
  const { showToast } = useToastOptional() ?? { showToast: undefined };
  const ownerId = humanProfile?.ownerId?.trim() ?? "";

  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [nav, setNav] = useState<BrowserNavStack>(() => createEmptyNavStack());
  const [bookmarked, setBookmarked] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);
  const [authorTemplate, setAuthorTemplate] = useState<AuthorTemplate | undefined>(undefined);
  const authorPanelRef = useRef<HTMLDivElement>(null);
  const [outboundHellos, setOutboundHellos] = useState(() => loadOutboundHellos());
  const [helloBusy, setHelloBusy] = useState(false);

  // Author panel becomes the page content while open — scroll it to the top
  // of the (single) Browser scrollport so long forms stay reachable.
  useEffect(() => {
    if (authorOpen && authorPanelRef.current) {
      authorPanelRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [authorOpen]);

  const [mode, setMode] = useState<BrowserMode>(initialMode ?? "bazaar");
  const cacheRef = useRef<Map<string, BrowserFetchCacheEntry>>(new Map());
  const libraryRead = useCallback(
    (params: Parameters<LibraryReadFn>[0]) => nodeService.libraryRead(params),
    [nodeService],
  );

  const parseError = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    try {
      const parsed = parseEnvoyUrl(trimmed);
      if (parsed.ownerForm === "handle") {
        return t(
          "browser.handleUrlReserved",
          "Handle URLs (envoy://@handle/...) are reserved for v2 — use envoy://envoy:owner:<base64>/...",
        );
      }
      return null;
    } catch (e) {
      if (e instanceof InvalidEnvoyUrlError) return e.message;
      if (e instanceof HandleRegistryNotImplementedError) return e.message;
      return e instanceof Error ? e.message : String(e);
    }
  }, [url, t]);

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
  /** Max time to wait for library.read before showing an error (avoids infinite spinner). */
  const LIBRARY_FETCH_TIMEOUT_MS = 45_000;

  const goHome = useCallback(() => {
    navigateGenRef.current += 1;
    setNav(createEmptyNavStack());
    setUrl("");
    setBookmarked(false);
    setSuggestionsOpen(false);
    setState({ kind: "idle" });
  }, []);

  const navigate = useCallback(
    async (target: string, opts?: { pushHistory?: boolean; revalidate?: boolean }) => {
      const pushHistory = opts?.pushHistory !== false;
      const revalidate = opts?.revalidate === true;
      const gen = ++navigateGenRef.current;
      setUrl(target);
      setSuggestionsOpen(false);
      // Push history immediately so Back works during loading / on error,
      // and so the first page can return to Browser home (idle).
      if (pushHistory) {
        setNav((prev) => pushNav(prev, target));
      }
      setState({ kind: "loading", url: target });
      try {
        const parsed = parseEnvoyUrl(target);
        const { targetOwnerId, path } = resolveEnvoyUrl(parsed);
        // Own Profile/Blog/PhotoWall shells are seeded async; wait so the first
        // open of an "empty" site does not race a missing index.md.
        if (
          ownerId &&
          targetOwnerId === ownerId &&
          typeof nodeService.ensureDefaultWebSite === "function"
        ) {
          await nodeService.ensureDefaultWebSite().catch((err) => {
            console.warn("[Browser] ensureDefaultWebSite before navigate failed:", err);
          });
          if (gen !== navigateGenRef.current) return;
        }
        const cache = cacheRef.current.get(target) ?? null;
        let timeoutId: number | undefined;
        const result = await Promise.race([
          fetchLibraryContent(libraryRead, {
            targetOwnerId,
            path,
            cache,
            revalidate,
          }),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error(`library.read timed out after ${LIBRARY_FETCH_TIMEOUT_MS}ms`)),
              LIBRARY_FETCH_TIMEOUT_MS,
            );
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
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
          const remote = Boolean(ownerId) && targetOwnerId !== ownerId;
          const surface = defaultWebSurfaceForPath(path);
          const message = remote
            ? surface
              ? t("browser.statusContactPageMissing", {
                  surface:
                    surface === "profile"
                      ? t("agentCard.openProfile", "Profile")
                      : surface === "blog"
                        ? t("agentCard.openBlog", "Blog")
                        : t("agentCard.openPhotoWall", "PhotoWall"),
                })
              : t("browser.statusContactContentMissing")
            : t("browser.statusNotFound");
          setState({ kind: "error", message, code: "not_found", remote });
        } else if (result.status === "forbidden") {
          setState({
            kind: "error",
            message: t("browser.statusAccessDenied"),
            code: "forbidden",
          });
        } else {
          setState({
            kind: "error",
            message: t("browser.statusError", { message: result.error ?? result.status }),
            code: "other",
          });
        }
      } catch (e) {
        if (gen !== navigateGenRef.current) return;
        setState({
          kind: "error",
          message: t("browser.statusError", {
            message: e instanceof Error ? e.message : String(e),
          }),
          code: "other",
        });
      }
    },
    [nodeService, ownerId, t, libraryRead],
  );

  useEffect(() => {
    if (!ownerId || !nodeService.ensureDefaultWebSite) return;
    void nodeService.ensureDefaultWebSite().catch((err) => {
      console.warn("[Browser] ensureDefaultWebSite failed:", err);
    });
  }, [ownerId, nodeService]);

  useEffect(() => {
    const pending = takePendingBrowserUrl();
    if (pending && isEnvoyContentUrl(pending)) {
      setMode("browse");
      void navigate(pending);
    } else {
      setState({ kind: "idle" });
    }
    const tmpl = takePendingAuthorTemplate();
    if (tmpl) {
      setMode("browse");
      setAuthorTemplate(tmpl as AuthorTemplate);
      setAuthorOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cold open only
  }, []);

  useEffect(() => {
    const onOpenBrowser = () => {
      const pending = takePendingBrowserUrl();
      if (pending && isEnvoyContentUrl(pending)) {
        setMode("browse");
        void navigate(pending);
      }
      const tmpl = takePendingAuthorTemplate();
      if (tmpl) {
        setMode("browse");
        setAuthorTemplate(tmpl as AuthorTemplate);
        setAuthorOpen(true);
      }
    };
    window.addEventListener(OPEN_BROWSER_EVENT, onOpenBrowser);
    return () => window.removeEventListener(OPEN_BROWSER_EVENT, onOpenBrowser);
  }, [navigate]);

  function openFromBazaar(target: string) {
    setMode("browse");
    void navigate(target);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isValid) void navigate(url);
  }

  function onBack() {
    const next = goBack(nav);
    if (!next) {
      // Loading with no history yet (should be rare after early push) — still escape.
      if (state.kind === "loading" || state.kind === "error") goHome();
      return;
    }
    setNav(next.stack);
    if (next.url === null) {
      goHome();
      return;
    }
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
    notifyWebSectionsChanged();
    const target = result.listingUrl ?? result.url;
    setUrl(target);
    void navigate(target, { revalidate: true });
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

  const pageOwnerId = useMemo(() => {
    if (state.kind !== "ok") return null;
    try {
      return resolveEnvoyUrl(parseEnvoyUrl(state.url)).targetOwnerId.trim() || null;
    } catch {
      return null;
    }
  }, [state]);

  const pageHelloState = useMemo(() => {
    if (!pageOwnerId || !ownerId || pageOwnerId === ownerId) return null;
    return resolvePeerHelloState(pageOwnerId, pageOwnerId, bonds ?? [], outboundHellos);
  }, [pageOwnerId, ownerId, bonds, outboundHellos]);

  async function onSayHelloToPageOwner() {
    if (!pageOwnerId || helloBusy || pageHelloState !== "none") return;
    setHelloBusy(true);
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(
        pageOwnerId,
        profile,
        t("inbox.defaultHello", "Hi — I'd like to connect on Envoy."),
      );
      markOutboundHello(pageOwnerId);
      setOutboundHellos(loadOutboundHellos());
      showToast?.(t("discover.hello.sentToast", "Hello sent"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast?.(message, "error");
    } finally {
      setHelloBusy(false);
    }
  }

  const backEnabled = canGoBack(nav);
  const forwardEnabled = canGoForward(nav);
  const reloadEnabled =
    (state.kind === "ok" && Boolean(state.url)) ||
    (isValid && state.kind !== "loading");

  return (
    <div
      className={`browser-view${authorOpen ? " browser-view--authoring" : ""}`}
      data-testid="browser-view"
    >
      <header className="browser-view__header">
        <h2>{t("browser.title")}</h2>
        <div className="browser-view__modes" role="tablist" aria-label={t("browser.modes", "Explore modes")}>
          <button
            type="button"
            role="tab"
            className={`browser-view__mode${mode === "bazaar" ? " is-active" : ""}`}
            data-testid="browser-mode-people"
            aria-selected={mode === "bazaar"}
            onClick={() => setMode("bazaar")}
          >
            {t("browser.modePeople", "People")}
          </button>
          <button
            type="button"
            role="tab"
            className={`browser-view__mode${mode === "browse" ? " is-active" : ""}`}
            data-testid="browser-mode-open"
            aria-selected={mode === "browse"}
            onClick={() => setMode("browse")}
          >
            {t("browser.modeOpen", "Open")}
          </button>
        </div>
      </header>

      {mode === "bazaar" ? (
        <BrowserBazaarView onOpenUrl={openFromBazaar} />
      ) : (
        <>
      <div className="browser-view__toolbar">
        <div className="browser-view__nav-group" role="group" aria-label={t("browser.navGroup", "Navigation")}>
          <button
            type="button"
            className="browser-view__nav-btn"
            data-testid="browser-back"
            aria-label={t("browser.back")}
            title={t("browser.back")}
            disabled={!backEnabled}
            onClick={onBack}
          >
            <BrowserIconChevron dir="back" />
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
            <BrowserIconChevron dir="forward" />
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
            <BrowserIconReload />
          </button>
        </div>

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
              aria-label={t("browser.addressLabel", "Address")}
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
            aria-pressed={bookmarked}
            disabled={state.kind !== "ok" || !ownerId}
            onClick={onToggleBookmark}
          >
            <BrowserIconStar filled={bookmarked} />
          </button>
        </form>
      </div>

      {parseError !== null && (
        <p className="browser-view__parse-error" data-testid="browser-parse-error">
          {t("browser.invalidUrl", { message: parseError })}
        </p>
      )}

      {/* While composing, hide browse/idle chrome so long pages cannot trap
          the editor above a nested scroll region. Close author to return. */}
      {!authorOpen ? (
      <div className="browser-view__render" data-testid="browser-render-area">
        {state.kind === "loading" && (
          <div className="browser-view__loading" data-testid="browser-loading">
            <span className="browser-view__spinner" aria-hidden="true" />
            <p>{t("browser.loading")}</p>
          </div>
        )}
        {state.kind === "error" && (
          <div
            className={`browser-view__empty${state.remote ? " browser-view__empty--remote" : ""}`}
            data-testid="browser-error"
          >
            <p className="browser-view__empty-title">
              {state.code === "not_found" && state.remote
                ? t("browser.emptyContactTitle", "Not published yet")
                : state.code === "forbidden"
                  ? t("browser.emptyDeniedTitle", "Access denied")
                  : t("browser.emptyErrorTitle", "Couldn’t open this page")}
            </p>
            <p className="browser-view__empty-body">{state.message}</p>
            {state.code === "not_found" && state.remote ? (
              <p className="browser-view__empty-hint">
                {t(
                  "browser.emptyContactHint",
                  "Default Profile, Blog, and PhotoWall pages are created on each person’s own node. This contact hasn’t published that page yet.",
                )}
              </p>
            ) : null}
          </div>
        )}
        {state.kind === "ok" && state.isText && (
          <RenderText
            mimeType={state.mimeType}
            body={state.body}
            onLinkClick={onContentLinkClick}
            libraryRead={libraryRead}
            t={t}
          />
        )}
        {state.kind === "ok" && !state.isText && (
          <RenderBinary mimeType={state.mimeType} body={state.body} url={state.url} t={t} />
        )}
        {state.kind === "idle" && (
          <div className="browser-view__idle" data-testid="browser-idle">
            <p className="browser-view__idle-title">
              {t(
                "browser.idleHint",
                "Paste a shared envoy:// link, or switch to People to discover public pages.",
              )}
            </p>
            <ul className="browser-view__idle-list">
              <li>{t("browser.idleHintPaste", "Paste a link someone shared with you, then press Go.")}</li>
              <li>
                {t(
                  "browser.idleHintContacts",
                  "From a contact’s chat header, open Profile, Blog, or PhotoWall without typing a URL.",
                )}
              </li>
              <li>
                {t(
                  "browser.idleHintBlog",
                  "Write your own posts under Content → Blog.",
                )}
              </li>
            </ul>
          </div>
        )}
      </div>
      ) : null}

      {state.kind === "ok" && !authorOpen && pageHelloState === "none" && (
        <div className="browser-view__hello-bar" data-testid="browser-open-hello">
          <p className="browser-view__hello-hint">
            {t(
              "browser.openHelloHint",
              "Not bonded yet — say hello to connect with this person.",
            )}
          </p>
          <button
            type="button"
            className="browser-view__hello-btn"
            data-testid="browser-open-say-hello"
            disabled={helloBusy}
            onClick={() => void onSayHelloToPageOwner()}
          >
            {t("common.sayHello", "Say Hello")}
          </button>
        </div>
      )}
      {state.kind === "ok" && !authorOpen && pageHelloState === "sent" && (
        <p className="browser-view__hello-status" data-testid="browser-open-hello-sent">
          {t("common.helloSentWaiting", "Hello sent")}
        </p>
      )}

      {state.kind === "ok" && !authorOpen && (
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

      {authorOpen && (
        <div className="browser-view__author-panel" data-testid="browser-author-panel" ref={authorPanelRef}>
          <BrowserAuthorView
            key={authorTemplate ?? "picker"}
            initialTemplate={authorTemplate}
            onCancel={() => {
              setAuthorOpen(false);
              setAuthorTemplate(undefined);
            }}
            onPublished={(result) => {
              // Keep the panel open so the published confirmation (URL) is visible;
              // Done / Cancel closes via onCancel. Still navigate to the new listing.
              onPublished(result);
            }}
          />
        </div>
      )}
      </>
      )}
    </div>
  );
}

function BrowserIconChevron({ dir }: { dir: "back" | "forward" }) {
  return (
    <svg className="browser-view__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {dir === "back" ? (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 6l-6 6 6 6"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 6l6 6-6 6"
        />
      )}
    </svg>
  );
}

function BrowserIconReload() {
  return (
    <svg className="browser-view__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5"
      />
    </svg>
  );
}

function BrowserIconStar({ filled }: { filled: boolean }) {
  return (
    <svg className="browser-view__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RenderText({
  mimeType,
  body,
  onLinkClick,
  libraryRead,
  t,
}: {
  mimeType: string;
  body: string;
  onLinkClick: (e: MouseEvent<HTMLElement>) => void;
  libraryRead: LibraryReadFn;
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string;
}) {
  const gallery = useMemo(() => {
    if (mimeType !== "text/markdown" && mimeType !== "text/x-markdown") return null;
    return parsePhotoWallMarkdown(body);
  }, [mimeType, body]);

  const profilePortal = useMemo(() => {
    if (mimeType !== "text/html") return null;
    return parseProfilePortalHtml(body);
  }, [mimeType, body]);

  if (profilePortal) {
    return <BrowserProfilePortal portal={profilePortal} libraryRead={libraryRead} />;
  }

  if (gallery) {
    return (
      <BrowserPhotoGallery
        title={gallery.title}
        photos={gallery.photos}
        libraryRead={libraryRead}
      />
    );
  }

  if (mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return (
      <article
        className="browser-view__markdown"
        data-testid="browser-markdown"
        onClick={onLinkClick}
      >
        <BrowserMarkdown text={body} libraryRead={libraryRead} />
      </article>
    );
  }
  if (mimeType === "text/html") {
    return (
      <BrowserHtmlDocument
        html={body}
        libraryRead={libraryRead}
        onLinkClick={onLinkClick}
        className="browser-view__html-doc"
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
