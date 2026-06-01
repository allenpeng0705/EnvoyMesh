import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfilePhotoMime } from "@envoymesh/api";
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
  onConfirmGallery: (file: File) => void;
}

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
  const [crop, setCrop] = useState<ThumbnailCropState>(DEFAULT_THUMBNAIL_CROP);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setSourceFile(null);
    setImage(null);
    setCrop(DEFAULT_THUMBNAIL_CROP);
    setLoadError(null);
    dragRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handlePick = async (file: File) => {
    if (purpose === "gallery") {
      onConfirmGallery(file);
      reset();
      onClose();
      return;
    }
    setLoadError(null);
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
            : t("profilePhotos.photoPickerGalleryTitle")}
        </h3>
        <p className="photo-picker-lede muted small">
          {purpose === "thumbnail"
            ? t("profilePhotos.photoPickerThumbnailHint")
            : t("profilePhotos.photoPickerGalleryHint")}
        </p>

        {loadError ? (
          <p className="photo-picker-error" role="alert">
            {loadError}
          </p>
        ) : null}

        {!showCrop && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              capture={purpose === "thumbnail" ? "environment" : undefined}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePick(file);
                e.target.value = "";
              }}
            />
            <div className="photo-picker-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? t("profilePhotos.uploading") : t("profilePhotos.choosePhoto")}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
                {t("common.cancel")}
              </button>
            </div>
          </>
        )}

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
                  inputRef.current?.click();
                }}
              >
                {t("profilePhotos.pickDifferent")}
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePick(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
