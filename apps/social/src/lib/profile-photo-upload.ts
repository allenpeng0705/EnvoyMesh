import type { ProfilePhotoMime } from "@envoymesh/api";

export async function fileToBase64(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function mimeFromFile(file: File): ProfilePhotoMime {
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

export function blobToFile(blob: Blob, name: string, mime: string): File {
  return new File([blob], name, { type: mime });
}
