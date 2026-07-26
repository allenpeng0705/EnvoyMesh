import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileGalleryPhotoVisibility, ProfilePhotoMime } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import {
  DEFAULT_THUMBNAIL_CROP,
  exportSquareThumbnail,
  loadImageFromFile,
  minCoverScale,
  clampCropPan,
  type ThumbnailCropState,
} from "../lib/profile-photo-crop.js";
import { mimeFromFile } from "../lib/profile-photo-upload.js";

export type PhotoPickerPurpose = "thumbnail" | "gallery";

interface PhotoPickerSheetProps {
  open: boolean;
  purpose: PhotoPickerPurpose;
  busy?: boolean;
  onClose: () => void;
  onConfirmThumbnail: (file: File, blob: Blob, mime: ProfilePhotoMime) => void;
  onConfirmGallery: (
    file: File,
    visibility: ProfileGalleryPhotoVisibility,
    caption?: string,
  ) => void;
}

const GALLERY_CAPTION_MAX = 280;

export function PhotoPickerSheet({
  open,
  purpose,
  busy,
  onClose,
  onConfirmThumbnail,
  onConfirmGallery,
}: PhotoPickerSheetProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [galleryPreviewUrl, setGalleryPreviewUrl] = useState<string | null>(null);
  const [galleryVisibility, setGalleryVisibility] =
    useState<ProfileGalleryPhotoVisibility>("public");
  const [galleryCaption, setGalleryCaption] = useState("");
  const [crop, setCrop] = useState<ThumbnailCropState>(DEFAULT_THUMBNAIL_CROP);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setSourceFile(null);
    setImage(null);
    setCrop(DEFAULT_THUMBNAIL_CROP);
    setLoadError(null);
    dragRef.current = null;
    setGalleryVisibility("public");
    setGalleryCaption("");
    setGalleryPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const openFilePicker = () => inputRef.current?.click();

  const handlePick = async (file: File) => {
    setLoadError(null);
    if (purpose === "gallery") {
      setSourceFile(file);
      setGalleryPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      return;
    }
    setSourceFile(file);
    try {
      const img = await loadImageFromFile(file);
      setImage(img);
      const cover = minCoverScale(img.naturalWidth, img.naturalHeight, 280);
      setCrop({ scale: cover, offsetX: 0, offsetY: 0 });
    } catch (err) {
      setSourceFile(null);
      setImage(null);
      setLoadError(err instanceof Error ? err.message : t("profilePhotos.loadImageFailed"));
    }
  };

  const confirmThumbnail = async () => {
    if (!sourceFile || !image) return;
    const mime = mimeFromFile(sourceFile);
    const blob = await exportSquareThumbnail(image, crop, 512, mime);
    onConfirmThumbnail(sourceFile, blob, mime);
    reset();
    onClose();
  };

  const confirmGallery = () => {
    if (!sourceFile) return;
    const caption = galleryCaption.trim().slice(0, GALLERY_CAPTION_MAX);
    onConfirmGallery(sourceFile, galleryVisibility, caption || undefined);
    reset();
    onClose();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // jsdom and some browsers omit pointer capture
    }
    dragRef.current = { x: e.clientX, y: e.clientY, ox: crop.offsetX, oy: crop.offsetY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !image) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const { ox, oy } = drag;
    const imgW = image.naturalWidth;
    const imgH = image.naturalHeight;
    setCrop((prev) =>
      clampCropPan({ ...prev, offsetX: ox + dx, offsetY: oy + dy }, imgW, imgH, 280),
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!open) return null;

  const showCrop = purpose === "thumbnail" && image;
  const showGalleryConfirm = purpose === "gallery" && sourceFile && galleryPreviewUrl;
  const picking = !showCrop && !showGalleryConfirm;

  return (
    <div className="photo-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="photo-picker-sheet"
        role="dialog"
        aria-labelledby="photo-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="photo-picker-title" className="photo-picker-title">
          {purpose === "thumbnail"
            ? t("profilePhotos.photoPickerThumbnailTitle")
            : showGalleryConfirm
              ? t("profilePhotos.photoPickerGalleryReviewTitle", "Photo details")
              : t("profilePhotos.photoPickerGalleryTitle")}
        </h3>
        {purpose === "thumbnail" && picking ? (
          <p className="photo-picker-lede muted small">
            {t("profilePhotos.photoPickerThumbnailHint")}
          </p>
        ) : null}

        {loadError ? (
          <p className="photo-picker-error" role="alert">
            {loadError}
          </p>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          capture={purpose === "thumbnail" ? "environment" : undefined}
          className="sr-only visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handlePick(file);
            e.target.value = "";
          }}
        />

        {picking ? (
          <>
            <button
              type="button"
              className="photo-picker-dropzone"
              disabled={busy}
              data-testid="photo-picker-choose"
              onClick={openFilePicker}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span className="photo-picker-dropzone__label">
                {busy ? t("profilePhotos.uploading") : t("profilePhotos.choosePhoto")}
              </span>
              <span className="photo-picker-dropzone__hint muted small">
                {t("profilePhotos.photoPickerFormats", "JPEG, PNG, WebP, or HEIC")}
              </span>
            </button>
            <div className="photo-picker-actions">
              <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
                {t("common.cancel")}
              </button>
            </div>
          </>
        ) : null}

        {showGalleryConfirm && galleryPreviewUrl ? (
          <>
            <div className="photo-picker-gallery-preview">
              <img src={galleryPreviewUrl} alt="" />
            </div>
            <label className="photo-picker-caption" htmlFor="photo-picker-gallery-caption">
              <span>{t("profilePhotos.captionLabel", "Description (optional)")}</span>
              <textarea
                id="photo-picker-gallery-caption"
                data-testid="photo-picker-gallery-caption"
                rows={3}
                maxLength={GALLERY_CAPTION_MAX}
                value={galleryCaption}
                disabled={busy}
                placeholder={t(
                  "profilePhotos.captionPlaceholder",
                  "A short note under the photo…",
                )}
                onChange={(e) => setGalleryCaption(e.target.value.slice(0, GALLERY_CAPTION_MAX))}
              />
            </label>
            <label className="photo-picker-visibility" htmlFor="photo-picker-gallery-visibility">
              <span>{t("profilePhotos.visibilityLabel")}</span>
              <select
                id="photo-picker-gallery-visibility"
                data-testid="photo-picker-gallery-visibility"
                value={galleryVisibility}
                disabled={busy}
                onChange={(e) =>
                  setGalleryVisibility(e.target.value as ProfileGalleryPhotoVisibility)
                }
              >
                <option value="public">{t("profilePhotos.visibilityEveryone")}</option>
                <option value="referred">{t("profilePhotos.visibilityReferred")}</option>
                <option value="direct">{t("profilePhotos.visibilityDirect")}</option>
              </select>
            </label>
            <div className="photo-picker-actions">
              <button
                type="button"
                className="primary"
                data-testid="photo-picker-gallery-confirm"
                disabled={busy}
                onClick={confirmGallery}
              >
                {busy ? t("profilePhotos.uploading") : t("profilePhotos.addPhotoBtn")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  reset();
                  openFilePicker();
                }}
              >
                {t("profilePhotos.pickDifferent")}
              </button>
            </div>
          </>
        ) : null}

        {showCrop && image && (
          <>
            <div
              className="photo-crop-viewport"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={image.src}
                alt=""
                className="photo-crop-image"
                style={{
                  width: image.naturalWidth * crop.scale,
                  height: image.naturalHeight * crop.scale,
                  transform: `translate(calc(-50% + ${crop.offsetX}px), calc(-50% + ${crop.offsetY}px))`,
                }}
                draggable={false}
              />
            </div>
            <p className="muted small photo-crop-hint">{t("profilePhotos.cropHint")}</p>
            <div className="photo-picker-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void confirmThumbnail()}>
                {busy ? t("profilePhotos.uploading") : t("profilePhotos.useThumbnail")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  reset();
                  openFilePicker();
                }}
              >
                {t("profilePhotos.pickDifferent")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
