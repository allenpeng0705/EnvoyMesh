/**
 * Browser helper: shrink a File/Blob so encoded bytes fit a storage budget.
 * Used so Social can accept large camera photos without showing size-limit errors.
 *
 * Always decodes with `imageOrientation: "from-image"` so EXIF Orientation is
 * baked into pixels before the node strips metadata (otherwise phone photos
 * that store sideways pixels appear rotated after upload).
 */
export async function fitImageFileToMaxBytes(
  file: Blob,
  maxBytes: number,
  preferredMime?: string,
): Promise<{ blob: Blob; mimeType: string }> {
  const srcMime = (preferredMime || file.type || "image/jpeg").toLowerCase();
  const formats: Array<"image/jpeg" | "image/png" | "image/webp"> =
    srcMime === "image/png"
      ? ["image/png", "image/jpeg"]
      : srcMime === "image/webp"
        ? ["image/webp", "image/jpeg"]
        : ["image/jpeg"];

  // Under budget: still re-encode JPEGs so Orientation is baked in.
  // PNG/WebP without typical EXIF orientation can pass through unchanged.
  const likelyHasOrientation = srcMime === "image/jpeg" || srcMime === "image/jpg";
  if (file.size > 0 && file.size <= maxBytes && !likelyHasOrientation) {
    return { blob: file, mimeType: preferredMime || file.type || "image/jpeg" };
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (!width || !height) throw new Error("Image could not be processed");

    for (const mime of formats) {
      let w = width;
      let h = height;
      const maxAttempts = file.size <= maxBytes ? 1 : 10;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const scale = maxAttempts === 1 ? 1 : Math.max(0.12, 1 - attempt * 0.09);
        const tw = Math.max(32, Math.round(w * scale));
        const th = Math.max(32, Math.round(h * scale));
        const quality = Math.max(0.38, 0.92 - attempt * 0.05);
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not available");
        ctx.drawImage(bitmap, 0, 0, tw, th);
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(
            (b) => resolve(b),
            mime,
            mime === "image/jpeg" || mime === "image/webp" ? quality : undefined,
          );
        });
        if (blob && blob.size <= maxBytes) {
          return { blob, mimeType: mime };
        }
        if (maxAttempts === 1) break;
        w = tw;
        h = th;
      }
    }
    throw new Error("Image could not be processed");
  } finally {
    bitmap.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("file_read_failed"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.readAsDataURL(blob);
  });
}
