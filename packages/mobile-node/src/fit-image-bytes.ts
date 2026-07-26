/**
 * Browser/WebView image fit (Capacitor / Social). Shrinks until under maxBytes.
 * Bakes EXIF orientation into pixels (via createImageBitmap) before upload so
 * stripping metadata on the node does not leave photos rotated.
 */
export async function fitImageBytesToMaxBytes(
  bytes: Uint8Array,
  mimeType: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    if (bytes.byteLength > 0 && bytes.byteLength <= maxBytes) {
      return { bytes, mimeType };
    }
    throw new Error("Image could not be processed");
  }

  const srcMime = (mimeType || "image/jpeg").toLowerCase();
  const likelyHasOrientation = srcMime === "image/jpeg" || srcMime === "image/jpg";
  if (bytes.byteLength > 0 && bytes.byteLength <= maxBytes && !likelyHasOrientation) {
    return { bytes, mimeType };
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mimeType || "image/jpeg" });
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (!width || !height) throw new Error("Image could not be processed");

    const formats: Array<"image/jpeg" | "image/png" | "image/webp"> =
      srcMime === "image/png"
        ? ["image/png", "image/jpeg"]
        : srcMime === "image/webp"
          ? ["image/webp", "image/jpeg"]
          : ["image/jpeg"];

    const maxAttempts = bytes.byteLength <= maxBytes ? 1 : 10;
    for (const mime of formats) {
      let w = width;
      let h = height;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const scale = maxAttempts === 1 ? 1 : Math.max(0.12, 1 - attempt * 0.09);
        const tw = Math.max(32, Math.round(w * scale));
        const th = Math.max(32, Math.round(h * scale));
        const quality = Math.max(0.38, 0.92 - attempt * 0.05);
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Image could not be processed");
        ctx.drawImage(bitmap, 0, 0, tw, th);
        const outBlob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(
            (b) => resolve(b),
            mime,
            mime === "image/jpeg" || mime === "image/webp" ? quality : undefined,
          );
        });
        if (outBlob && outBlob.size <= maxBytes) {
          const buf = new Uint8Array(await outBlob.arrayBuffer());
          return { bytes: buf, mimeType: mime };
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
