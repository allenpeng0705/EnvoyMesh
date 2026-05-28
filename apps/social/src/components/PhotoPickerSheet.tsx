import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfilePhotoMime } from "@envoymesh/api";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<ThumbnailCropState>(DEFAULT_THUMBNAIL_CROP);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setSourceFile(null);
    setImage(null);
    setCrop(DEFAULT_THUMBNAIL_CROP);
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
    setSourceFile(file);
    const img = await loadImageFromFile(file);
    setImage(img);
    const cover = minCoverScale(img.naturalWidth, img.naturalHeight, 280);
    setCrop({ scale: cover, offsetX: 0, offsetY: 0 });
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
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: crop.offsetX, oy: crop.offsetY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !image) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setCrop((prev) =>
      clampCropPan(
        { ...prev, offsetX: dragRef.current!.ox + dx, offsetY: dragRef.current!.oy + dy },
        image.naturalWidth,
        image.naturalHeight,
        280,
      ),
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
          {purpose === "thumbnail" ? "Profile thumbnail" : "Add gallery photo"}
        </h3>
        <p className="photo-picker-lede muted small">
          {purpose === "thumbnail"
            ? "Drag to reposition. We crop to a square and remove location metadata on upload."
            : "New gallery photos default to public metadata on your profile. Discover shows your thumbnail; use Share to send image files."}
        </p>

        {!showCrop && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
                {busy ? "Uploading…" : purpose === "thumbnail" ? "Choose photo" : "Choose photo"}
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={onClose}>
                Cancel
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
            <p className="muted small photo-crop-hint">Drag the photo to adjust framing</p>
            <div className="photo-picker-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => void confirmThumbnail()}>
                {busy ? "Uploading…" : "Use this thumbnail"}
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
                Pick different photo
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
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
