/**
 * In-app Profile portal renderer (React).
 *
 * Published `index.html` is parsed into structured fields so we are not
 * dependent on DOMPurify keeping <style> tags — Social CSS styles this view.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isEnvoyContentUrl, parseEnvoyUrl, resolveEnvoyUrl } from "@envoymesh/api";
import {
  fetchLibraryContent,
  type LibraryReadFn,
} from "../lib/library-read-fetch.js";
import type { ParsedProfilePortal } from "../lib/parse-profile-portal-html.js";
import { useT } from "../context/I18nContext.js";

function base64ToBlobUrl(body: string, mimeType: string): string {
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return URL.createObjectURL(new Blob([ab], { type: mimeType }));
}

export interface BrowserProfilePortalProps {
  portal: ParsedProfilePortal;
  libraryRead: LibraryReadFn;
}

export function BrowserProfilePortal({ portal, libraryRead }: BrowserProfilePortalProps) {
  const t = useT();
  const libraryReadRef = useRef(libraryRead);
  libraryReadRef.current = libraryRead;

  const [blobByUrl, setBlobByUrl] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const blobRef = useRef<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());

  const urls = [
    ...(portal.avatarUrl ? [portal.avatarUrl] : []),
    ...portal.photos.map((p) => p.url),
  ];

  useEffect(() => {
    let cancelled = false;
    for (const url of urls) {
      if (!isEnvoyContentUrl(url) || blobRef.current[url] || inFlight.current.has(url)) continue;
      inFlight.current.add(url);
      void (async () => {
        try {
          const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(url));
          const result = await fetchLibraryContent(libraryReadRef.current, {
            targetOwnerId,
            path,
          });
          if (cancelled) return;
          if (result.status !== "ok" || !result.body || !result.contentType?.startsWith("image/")) {
            return;
          }
          const blobUrl = base64ToBlobUrl(result.body, result.contentType);
          blobRef.current[url] = blobUrl;
          setBlobByUrl((prev) => ({ ...prev, [url]: blobUrl }));
        } finally {
          inFlight.current.delete(url);
        }
      })();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urls joined
  }, [urls.join("\0")]);

  useEffect(() => {
    return () => {
      for (const u of Object.values(blobRef.current)) URL.revokeObjectURL(u);
      blobRef.current = {};
    };
  }, []);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight" && portal.photos.length > 0) {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % portal.photos.length));
      }
      if (e.key === "ArrowLeft" && portal.photos.length > 0) {
        setLightboxIndex((i) =>
          i === null ? i : (i - 1 + portal.photos.length) % portal.photos.length,
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, portal.photos.length, closeLightbox]);

  const avatarSrc = portal.avatarUrl ? blobByUrl[portal.avatarUrl] : undefined;
  const initial = (portal.displayName.trim()[0] ?? "?").toUpperCase();
  const active = lightboxIndex !== null ? portal.photos[lightboxIndex] : null;

  function chipSection(label: string, items: string[]) {
    if (items.length === 0) return null;
    return (
      <section className="browser-profile-portal__section">
        <h2>{label}</h2>
        <div className="browser-profile-portal__chips">
          {items.map((item) => (
            <span key={`${label}-${item}`} className="browser-profile-portal__chip">
              {item}
            </span>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="browser-profile-portal" data-testid="browser-profile-portal">
      <header className="browser-profile-portal__hero">
        <div className="browser-profile-portal__hero-inner">
          {avatarSrc ? (
            <img className="browser-profile-portal__avatar" src={avatarSrc} alt="" />
          ) : (
            <div className="browser-profile-portal__avatar browser-profile-portal__avatar--fallback" aria-hidden>
              {initial}
            </div>
          )}
          <div>
            <h1>{portal.displayName}</h1>
            {portal.username ? <p className="browser-profile-portal__username">@{portal.username}</p> : null}
            {portal.bio ? <p className="browser-profile-portal__bio">{portal.bio}</p> : null}
          </div>
        </div>
      </header>

      <div className="browser-profile-portal__body">
        {chipSection(t("profile.interests", "Interests"), portal.interests)}
        {chipSection(t("profile.knowledge", "Knowledge"), portal.knowledge)}
        {chipSection(t("profile.capabilities", "Capabilities"), portal.capabilities)}

        <section className="browser-profile-portal__section">
          <h2>{t("profilePhotos.gallery", "Photos")}</h2>
          {portal.photos.length === 0 ? (
            <p className="browser-profile-portal__empty">{t("browser.gallery.empty", "No photos yet.")}</p>
          ) : (
            <div className="browser-profile-portal__mosaic" role="list">
              {portal.photos.map((photo, index) => {
                const src = blobByUrl[photo.url];
                return (
                  <button
                    key={photo.url}
                    type="button"
                    className="browser-profile-portal__tile"
                    role="listitem"
                    data-testid="browser-profile-photo-tile"
                    aria-label={t("browser.gallery.openPhoto", "View {title}", { title: photo.title })}
                    onClick={() => setLightboxIndex(index)}
                  >
                    {src ? (
                      <img src={src} alt="" />
                    ) : (
                      <span className="browser-photo-gallery__spinner" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {active && lightboxIndex !== null && (
        <div
          className="browser-photo-gallery__lightbox"
          data-testid="browser-profile-lightbox"
          role="dialog"
          aria-modal="true"
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
          <div className="browser-photo-gallery__lightbox-body" onClick={(e) => e.stopPropagation()}>
            {blobByUrl[active.url] ? (
              <img
                className="browser-photo-gallery__lightbox-img"
                src={blobByUrl[active.url]}
                alt={active.title?.trim() && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(active.title) ? active.title : ""}
              />
            ) : (
              <span className="browser-photo-gallery__spinner" aria-hidden="true" />
            )}
            {active.title?.trim() &&
            active.title.trim() !== "Photo" &&
            !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(active.title) ? (
              <p className="browser-photo-gallery__lightbox-caption">{active.title}</p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
