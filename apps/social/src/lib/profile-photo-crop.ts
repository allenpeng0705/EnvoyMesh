import type { ProfilePhotoMime } from "@envoymesh/api";

export interface ThumbnailCropState {
  /** Cover scale: image drawn so min dimension * scale fills the square viewport. */
  scale: number;
  /** Pan offset in viewport pixels (positive moves image right/down). */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_THUMBNAIL_CROP: ThumbnailCropState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

/** Minimum scale so the image covers a square viewport (center crop baseline). */
export function minCoverScale(imgW: number, imgH: number, viewport: number): number {
  return Math.max(viewport / imgW, viewport / imgH);
}

export function clampCropPan(
  crop: ThumbnailCropState,
  imgW: number,
  imgH: number,
  viewport: number,
): ThumbnailCropState {
  const cover = minCoverScale(imgW, imgH, viewport);
  const scale = Math.max(cover, crop.scale);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const maxX = Math.max(0, (drawW - viewport) / 2);
  const maxY = Math.max(0, (drawH - viewport) / 2);
  return {
    scale,
    offsetX: Math.min(maxX, Math.max(-maxX, crop.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, crop.offsetY)),
  };
}

export function exportSquareThumbnail(
  image: HTMLImageElement,
  crop: ThumbnailCropState,
  outputSize: number,
  mime: ProfilePhotoMime,
): Promise<Blob> {
  const viewport = 280;
  const clamped = clampCropPan(crop, image.naturalWidth, image.naturalHeight, viewport);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas not available"));

  const scale = clamped.scale;
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  const x = (viewport - drawW) / 2 + clamped.offsetX;
  const y = (viewport - drawH) / 2 + clamped.offsetY;
  const ratio = outputSize / viewport;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, x * ratio, y * ratio, drawW * ratio, drawH * ratio);

  const quality = mime === "image/jpeg" ? 0.92 : undefined;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export image"));
      },
      mime,
      quality,
    );
  });
}
