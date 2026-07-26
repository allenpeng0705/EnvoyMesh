/**
 * PhotoWall gallery grid + lightbox for Browser.
 *
 * Loads each `envoy://` image once via libraryRead, caches blob URLs, and opens
 * a fullscreen lightbox on click — no markdown img rewriting (that caused flash).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isEnvoyContentUrl, parseEnvoyUrl, resolveEnvoyUrl } from "@envoymesh/api";
import type { ProfileGalleryPhotoVisibility } from "@envoymesh/api";
import {
  fetchLibraryContent,
  type LibraryReadFn,
} from "../lib/library-read-fetch.js";
import type { PhotoWallItem } from "../lib/parse-photo-wall-markdown.js";
import { useT } from "../context/I18nContext.js";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToBlobUrl(body: string, mimeType: string): string {
  const bytes = base64ToBytes(body);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return URL.createObjectURL(new Blob([ab], { type: mimeType }));
}

export interface BrowserPhotoGalleryOwnerMeta {
  vaultRelativePath: string;
  visibility: ProfileGalleryPhotoVisibility;
}

export interface BrowserPhotoGalleryProps {
  title?: string;
  photos: readonly PhotoWallItem[];
  libraryRead: LibraryReadFn;
  /** When set (Profile owner), lightbox can change each photo’s visibility. */
  ownerByUrl?: Readonly<Record<string, BrowserPhotoGalleryOwnerMeta>>;
  onOwnerVisibilityChange?: (
    vaultRelativePath: string,
    visibility: ProfileGalleryPhotoVisibility,
  ) => void;
  ownerBusy?: boolean;
  /** Extra grid tile to add another photo (Profile PhotoWall). */
  onAddPhoto?: () => void;
  addDisabled?: boolean;
  /** Owner-only: delete the photo open in the lightbox. */
  onOwnerDelete?: (vaultRelativePath: string) => void;
}

export function BrowserPhotoGallery({
  title,
  photos,
  libraryRead,
  ownerByUrl,
  onOwnerVisibilityChange,
  ownerBusy,
  onAddPhoto,
  addDisabled,
  onOwnerDelete,
}: BrowserPhotoGalleryProps) {
  const t = useT();
  const libraryReadRef = useRef(libraryRead);
  libraryReadRef.current = libraryRead;

  const photoKey = useMemo(() => photos.map((p) => p.url).join("\0"), [photos]);

  const [blobByUrl, setBlobByUrl] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const blobByUrlRef = useRef<Record<string, string>>({});
  const inFlightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const wanted = new Set(photoKey ? photoKey.split("\0") : []);

    for (const url of Object.keys(blobByUrlRef.current)) {
      if (!wanted.has(url)) {
        URL.revokeObjectURL(blobByUrlRef.current[url]!);
        delete blobByUrlRef.current[url];
      }
    }
    setBlobByUrl({ ...blobByUrlRef.current });
    setFailed((prev) => {
      const next: Record<string, true> = {};
      for (const url of Object.keys(prev)) {
        if (wanted.has(url)) next[url] = true;
      }
      return next;
    });
    for (const url of [...failedRef.current]) {
      if (!wanted.has(url)) failedRef.current.delete(url);
    }

    for (const photo of photos) {
      const { url } = photo;
      if (blobByUrlRef.current[url] || inFlightRef.current.has(url) || failedRef.current.has(url)) {
        continue;
      }
      if (!isEnvoyContentUrl(url)) {
        failedRef.current.add(url);
        setFailed((prev) => ({ ...prev, [url]: true }));
        continue;
      }
      inFlightRef.current.add(url);
      void (async () => {
        try {
          const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(url));
          const result = await fetchLibraryContent(libraryReadRef.current, {
            targetOwnerId,
            path,
          });
          if (cancelled) return;
          if (result.status !== "ok" || !result.body || !result.contentType?.startsWith("image/")) {
            failedRef.current.add(url);
            setFailed((prev) => ({ ...prev, [url]: true }));
            return;
          }
          const blobUrl = base64ToBlobUrl(result.body, result.contentType);
          blobByUrlRef.current[url] = blobUrl;
          setBlobByUrl((prev) => ({ ...prev, [url]: blobUrl }));
        } catch {
          if (!cancelled) {
            failedRef.current.add(url);
            setFailed((prev) => ({ ...prev, [url]: true }));
          }
        } finally {
          inFlightRef.current.delete(url);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
    // photos listed via photoKey; photos array used only for titles/order in render
    // eslint-disable-next-line react-hooks/exhaustive-deps -- photoKey is the stable identity
  }, [photoKey]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(blobByUrlRef.current)) {
        URL.revokeObjectURL(url);
      }
      blobByUrlRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    if (photos.length === 0) {
      setLightboxIndex(null);
      return;
    }
    if (lightboxIndex >= photos.length) {
      setLightboxIndex(photos.length - 1);
    }
  }, [photos.length, lightboxIndex]);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeLightbox();
        return;
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % photos.length));
      }
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + photos.length) % photos.length,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, photos.length, closeLightbox]);

  const active = lightboxIndex !== null ? photos[lightboxIndex] : null;
  const activeBlob = active ? blobByUrl[active.url] : undefined;
  const activeOwner = active && ownerByUrl ? ownerByUrl[active.url] : undefined;
  const lightboxLabel = active?.caption?.trim() || undefined;

  const requestDelete = () => {
    if (!activeOwner || !onOwnerDelete || ownerBusy) return;
    const ok = window.confirm(
      `${t("profilePhotos.removeConfirm")}\n${t("profilePhotos.removeConfirmMessage")}`,
    );
    if (!ok) return;
    onOwnerDelete(activeOwner.vaultRelativePath);
  };

  return (
    <div className="browser-photo-gallery" data-testid="browser-photo-gallery">
      {title ? <h1 className="browser-photo-gallery__title">{title}</h1> : null}
      <div className="browser-photo-gallery__grid" role="list">
        {photos.map((photo, index) => {
          const src = blobByUrl[photo.url];
          const caption = photo.caption?.trim() || undefined;
          const a11yLabel =
            caption || t("profilePhotos.defaultPhotoLabel", "Photo");
          return (
            <button
              key={photo.url}
              type="button"
              className="browser-photo-gallery__tile"
              role="listitem"
              data-testid="browser-photo-tile"
              aria-label={t("browser.gallery.openPhoto", "View {title}", { title: a11yLabel })}
              onClick={() => setLightboxIndex(index)}
            >
              {src ? (
                <img src={src} alt="" className="browser-photo-gallery__thumb" loading="lazy" />
              ) : failed[photo.url] ? (
                <span className="browser-photo-gallery__placeholder" aria-hidden="true" />
              ) : (
                <span className="browser-photo-gallery__spinner" aria-hidden="true" />
              )}
              {caption ? (
                <span className="browser-photo-gallery__tile-caption">{caption}</span>
              ) : null}
            </button>
          );
        })}
        {onAddPhoto ? (
          <button
            type="button"
            className="browser-photo-gallery__tile browser-photo-gallery__tile--add"
            role="listitem"
            data-testid="browser-photo-add"
            disabled={addDisabled}
            aria-label={t("profilePhotos.addPhotoBtn", "Add photo")}
            onClick={onAddPhoto}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {active && lightboxIndex !== null && (
        <div
          className={`browser-photo-gallery__lightbox${activeOwner ? " browser-photo-gallery__lightbox--owner" : ""}`}
          data-testid="browser-photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxLabel || title || t("profilePhotos.defaultPhotoLabel", "Photo")}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="browser-photo-gallery__lightbox-close"
            aria-label={t("browser.gallery.close", "Close")}
            onClick={closeLightbox}
          >
            ×
          </button>
          {activeOwner && onOwnerDelete ? (
            <button
              type="button"
              className="browser-photo-gallery__lightbox-delete"
              data-testid="browser-photo-lightbox-delete"
              aria-label={t("profilePhotos.removeBtn", "Remove")}
              disabled={ownerBusy}
              onClick={(e) => {
                e.stopPropagation();
                requestDelete();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 7h14M10 11v6M14 11v6M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="browser-photo-gallery__lightbox-nav browser-photo-gallery__lightbox-nav--prev"
                aria-label={t("browser.gallery.prev", "Previous photo")}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) =>
                    i === null ? i : (i - 1 + photos.length) % photos.length,
                  );
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="browser-photo-gallery__lightbox-nav browser-photo-gallery__lightbox-nav--next"
                aria-label={t("browser.gallery.next", "Next photo")}
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((i) => (i === null ? i : (i + 1) % photos.length));
                }}
              >
                ›
              </button>
            </>
          )}
          <div
            className="browser-photo-gallery__lightbox-body"
            onClick={(e) => e.stopPropagation()}
          >
            {activeBlob ? (
              <img
                src={activeBlob}
                alt={lightboxLabel || ""}
                className="browser-photo-gallery__lightbox-img"
                data-testid="browser-photo-lightbox-img"
              />
            ) : (
              <span className="browser-photo-gallery__spinner" aria-hidden="true" />
            )}
            {lightboxLabel ? (
              <p
                className="browser-photo-gallery__lightbox-caption"
                data-testid="browser-photo-lightbox-caption"
              >
                {lightboxLabel}
              </p>
            ) : null}
          </div>
          {activeOwner && onOwnerVisibilityChange ? (
            <div
              className="browser-photo-gallery__lightbox-footer"
              onClick={(e) => e.stopPropagation()}
            >
              <label
                className="browser-photo-gallery__lightbox-visibility"
                htmlFor="browser-photo-lightbox-visibility"
              >
                <span>{t("profilePhotos.visibilityLabel")}</span>
                <select
                  id="browser-photo-lightbox-visibility"
                  data-testid="browser-photo-lightbox-visibility"
                  value={activeOwner.visibility}
                  disabled={ownerBusy}
                  onChange={(e) => {
                    onOwnerVisibilityChange(
                      activeOwner.vaultRelativePath,
                      e.target.value as ProfileGalleryPhotoVisibility,
                    );
                  }}
                >
                  <option value="public">{t("profilePhotos.visibilityEveryone")}</option>
                  <option value="referred">{t("profilePhotos.visibilityReferred")}</option>
                  <option value="direct">{t("profilePhotos.visibilityDirect")}</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
