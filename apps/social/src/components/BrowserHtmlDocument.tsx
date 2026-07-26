/**
 * Browser HTML renderer for mesh web content (Profile portal).
 *
 * Renders sanitized HTML in-page (not a sandboxed iframe) so `envoy://`
 * images can be rewritten to blob URLs and links can navigate in-app.
 */
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import DOMPurify from "dompurify";
import { isEnvoyContentUrl, parseEnvoyUrl, resolveEnvoyUrl } from "@envoymesh/api";
import {
  fetchLibraryContent,
  type LibraryReadFn,
} from "../lib/library-read-fetch.js";

const ENVOY_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data|envoy):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sanitizeBrowserHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_DATA_URI_TAGS: ["img"],
    ALLOWED_URI_REGEXP: ENVOY_URI_REGEXP,
    // Profile portal ships scoped CSS in <style>; keep it so the page is not bare text.
    ADD_TAGS: ["link", "style"],
    ADD_ATTR: ["target", "rel", "loading", "crossorigin", "href", "as", "style", "media"],
  });
}

/** Extract body inner HTML when a full document is served. */
export function extractBrowserHtmlBody(html: string): string {
  const trimmed = html.trim();
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(trimmed);
  if (bodyMatch?.[1]) {
    const headStyles = [...trimmed.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => `<style>${m[1]}</style>`)
      .join("");
    const headLinks = [...trimmed.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)]
      .map((m) => m[0])
      .join("");
    return `${headLinks}${headStyles}${bodyMatch[1]}`;
  }
  return trimmed;
}

export interface BrowserHtmlDocumentProps {
  html: string;
  libraryRead: LibraryReadFn;
  onLinkClick: (e: MouseEvent<HTMLElement>) => void;
  className?: string;
}

export function BrowserHtmlDocument({
  html,
  libraryRead,
  onLinkClick,
  className,
}: BrowserHtmlDocumentProps) {
  const safe = useMemo(
    () => sanitizeBrowserHtml(extractBrowserHtmlBody(html)),
    [html],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const libraryReadRef = useRef(libraryRead);
  libraryReadRef.current = libraryRead;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[src^="envoy://"]'));
    if (imgs.length === 0) return;

    let cancelled = false;
    const objectUrls: string[] = [];
    const inFlight = new Set<string>();

    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || !isEnvoyContentUrl(src) || inFlight.has(src)) continue;
      inFlight.add(src);
      void (async () => {
        try {
          const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(src));
          const result = await fetchLibraryContent(libraryReadRef.current, {
            targetOwnerId,
            path,
          });
          if (cancelled || result.status !== "ok" || !result.body || !result.contentType) return;
          if (!result.contentType.startsWith("image/")) return;
          const bytes = base64ToBytes(result.body);
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const blobUrl = URL.createObjectURL(new Blob([ab], { type: result.contentType }));
          objectUrls.push(blobUrl);
          if (!cancelled) {
            for (const node of Array.from(root.querySelectorAll("img"))) {
              if (node.getAttribute("src") === src) node.setAttribute("src", blobUrl);
            }
          }
        } catch {
          /* leave placeholder */
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [safe]);

  // Profile mosaic lightbox: click tile → fullscreen overlay using existing blob src.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onClick(e: Event) {
      const rootEl = rootRef.current;
      if (!rootEl) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const tile = target.closest("a.em-mosaic__tile");
      if (!tile || !rootEl.contains(tile)) return;
      const img = tile.querySelector("img");
      if (!img?.src || img.src.startsWith("envoy://")) return;
      e.preventDefault();
      e.stopPropagation();

      const overlay = document.createElement("div");
      overlay.className = "browser-photo-gallery__lightbox";
      overlay.setAttribute("data-testid", "browser-profile-lightbox");
      overlay.innerHTML = `
        <button type="button" class="browser-photo-gallery__lightbox-close" aria-label="Close">×</button>
        <div class="browser-photo-gallery__lightbox-body">
          <img class="browser-photo-gallery__lightbox-img" src="${img.src}" alt="" />
        </div>`;
      const close = () => overlay.remove();
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay || (ev.target as Element).closest(".browser-photo-gallery__lightbox-close")) {
          close();
        }
      });
      document.addEventListener("keydown", function onKey(ev) {
        if (ev.key === "Escape") {
          close();
          document.removeEventListener("keydown", onKey);
        }
      });
      document.body.appendChild(overlay);
    }

    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, [safe]);

  return (
    <div
      ref={rootRef}
      className={className}
      data-testid="browser-html-document"
      onClick={onLinkClick}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}
