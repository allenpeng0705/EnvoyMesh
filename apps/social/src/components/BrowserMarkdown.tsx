/**
 * Browser markdown renderer for mesh web content.
 *
 * DOMPurify's default URI allowlist drops `envoy://` from `href`/`src`, which
 * made PhotoWall listings non-clickable and embedded photos invisible. This
 * component keeps `envoy:` links and rewrites image `src` to blob URLs via
 * `libraryRead`.
 */
import { useEffect, useMemo, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { isEnvoyContentUrl, parseEnvoyUrl, resolveEnvoyUrl } from "@envoymesh/api";
import {
  fetchLibraryContent,
  type LibraryReadFn,
} from "../lib/library-read-fetch.js";

marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Default DOMPurify scheme list + `envoy` for mesh content URLs. */
const ENVOY_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data|envoy):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sanitizeBrowserMarkdown(text: string): string {
  try {
    const raw = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ADD_DATA_URI_TAGS: ["img"],
      ALLOWED_URI_REGEXP: ENVOY_URI_REGEXP,
    });
  } catch {
    return DOMPurify.sanitize(text, { ALLOWED_URI_REGEXP: ENVOY_URI_REGEXP });
  }
}

export interface BrowserMarkdownProps {
  text: string;
  libraryRead: LibraryReadFn;
  className?: string;
}

export function BrowserMarkdown({ text, libraryRead, className }: BrowserMarkdownProps) {
  const html = useMemo(() => sanitizeBrowserMarkdown(text), [text]);
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

    for (const img of imgs) {
      const src = img.getAttribute("src");
      if (!src || !isEnvoyContentUrl(src)) continue;
      void (async () => {
        try {
          const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(src));
          const result = await fetchLibraryContent(libraryReadRef.current, { targetOwnerId, path });
          if (cancelled || result.status !== "ok" || !result.body || !result.contentType) return;
          if (!result.contentType.startsWith("image/")) return;
          const bytes = base64ToBytes(result.body);
          const ab = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(ab).set(bytes);
          const blobUrl = URL.createObjectURL(new Blob([ab], { type: result.contentType }));
          objectUrls.push(blobUrl);
          if (!cancelled) img.setAttribute("src", blobUrl);
        } catch {
          // Leave broken/placeholder img; page text and title links still work.
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [html]);

  return (
    <div
      ref={rootRef}
      className={className}
      data-testid="browser-markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
