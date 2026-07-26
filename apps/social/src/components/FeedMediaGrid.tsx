/**
 * Lazy-load envoy:// feed images into a WeChat Moments-style mosaic (max 9).
 * Tap a tile → fullscreen lightbox with prev/next.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_FEED_POST_IMAGES, isEnvoyContentUrl, parseEnvoyUrl, resolveEnvoyUrl } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { fetchLibraryContent, type LibraryReadFn } from "../lib/library-read-fetch.js";

function base64ToBlobUrl(body: string, mimeType: string): string {
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  const ab = new ArrayBuffer(out.byteLength);
  new Uint8Array(ab).set(out);
  return URL.createObjectURL(new Blob([ab], { type: mimeType }));
}

/** Moments layout class for 1–9 photos. */
export function feedMediaGridClass(count: number): string {
  const n = Math.min(Math.max(count, 0), MAX_FEED_POST_IMAGES);
  if (n <= 0) return "feed-media";
  return `feed-media feed-media--${n}`;
}

export function FeedMediaGrid({
  urls,
  libraryRead,
}: {
  urls: string[];
  libraryRead: LibraryReadFn;
}) {
  const t = useT();
  const shown = urls.slice(0, MAX_FEED_POST_IMAGES);
  const key = useMemo(() => shown.join("\0"), [shown]);
  const [blobs, setBlobs] = useState<Record<string, string>>({});
  const blobsRef = useRef<Record<string, string>>({});
  const libraryReadRef = useRef(libraryRead);
  libraryReadRef.current = libraryRead;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(key ? key.split("\0").filter(Boolean) : []);
    for (const url of Object.keys(blobsRef.current)) {
      if (!wanted.has(url)) {
        URL.revokeObjectURL(blobsRef.current[url]!);
        delete blobsRef.current[url];
      }
    }
    setBlobs({ ...blobsRef.current });

    for (const url of wanted) {
      if (blobsRef.current[url]) continue;
      if (!isEnvoyContentUrl(url)) continue;
      void (async () => {
        try {
          const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(url));
          const result = await fetchLibraryContent(libraryReadRef.current, {
            targetOwnerId,
            path,
          });
          if (cancelled || result.status !== "ok" || !result.body) return;
          if (!result.contentType?.startsWith("image/")) return;
          const blobUrl = base64ToBlobUrl(result.body, result.contentType);
          blobsRef.current[url] = blobUrl;
          setBlobs((prev) => ({ ...prev, [url]: blobUrl }));
        } catch {
          /* leave tile empty */
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(blobsRef.current)) URL.revokeObjectURL(url);
      blobsRef.current = {};
    };
  }, []);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  const goPrev = useCallback(() => {
    setLightboxIndex((i) =>
      i === null || shown.length === 0 ? i : (i - 1 + shown.length) % shown.length,
    );
  }, [shown.length]);

  const goNext = useCallback(() => {
    setLightboxIndex((i) =>
      i === null || shown.length === 0 ? i : (i + 1) % shown.length,
    );
  }, [shown.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxIndex, closeLightbox, goPrev, goNext]);

  if (shown.length === 0) return null;

  const activeUrl = lightboxIndex !== null ? shown[lightboxIndex] : null;
  const activeSrc = activeUrl ? blobs[activeUrl] : undefined;

  const lightbox =
    lightboxIndex !== null && typeof document !== "undefined"
      ? createPortal(
          <div
            className="feed-media-lightbox"
            data-testid="feed-media-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={t("feed.photoViewer", "Photo")}
            onClick={closeLightbox}
          >
            <button
              type="button"
              className="feed-media-lightbox__close"
              aria-label={t("feed.closePhoto", "Close")}
              onClick={closeLightbox}
            >
              ×
            </button>
            {shown.length > 1 ? (
              <>
                <button
                  type="button"
                  className="feed-media-lightbox__nav feed-media-lightbox__nav--prev"
                  aria-label={t("feed.prevPhoto", "Previous photo")}
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="feed-media-lightbox__nav feed-media-lightbox__nav--next"
                  aria-label={t("feed.nextPhoto", "Next photo")}
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                >
                  ›
                </button>
                <div className="feed-media-lightbox__counter" aria-live="polite">
                  {lightboxIndex + 1}/{shown.length}
                </div>
              </>
            ) : null}
            <div
              className="feed-media-lightbox__body"
              onClick={(e) => e.stopPropagation()}
            >
              {activeSrc ? (
                <img
                  src={activeSrc}
                  alt=""
                  className="feed-media-lightbox__img"
                  data-testid="feed-media-lightbox-img"
                />
              ) : (
                <div className="feed-media__skeleton feed-media-lightbox__skeleton" />
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={feedMediaGridClass(shown.length)}
        data-testid="feed-media-grid"
        data-count={shown.length}
        role="list"
        aria-label={t("feed.photos", "Photos")}
      >
        {shown.map((url, i) => {
          const src = blobs[url];
          return (
            <button
              key={url}
              type="button"
              role="listitem"
              className={`feed-media__cell feed-media__cell--${i}`}
              data-testid="feed-media-tile"
              aria-label={t("feed.viewPhoto", "View photo {n}", { n: String(i + 1) })}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(i);
              }}
            >
              {src ? (
                <img src={src} alt="" loading="lazy" />
              ) : (
                <div className="feed-media__skeleton" />
              )}
            </button>
          );
        })}
      </div>
      {lightbox}
    </>
  );
}
