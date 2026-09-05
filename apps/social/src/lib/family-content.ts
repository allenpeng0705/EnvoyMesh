/**
 * EM-F3 — family-media content fetch for Social chat bubbles.
 *
 * Family attachments (sent by EnvoyGo family devices, EM-F1) are stored in
 * the home node's `family-media` area and are addressed by attachment `id`
 * through `readFamilyAttachment` — never through the owner-vault
 * `readLibraryItemContent` (family messages carry NO `vaultRelativePath` on
 * their attachment descriptors).
 *
 * The node clamps every `readFamilyAttachment` slice to 1 MiB
 * (`FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES`), so whole-file reads must page with
 * `offset` + `maxBytes`, exactly like the chunked EnvoyGo fetch. Inline image
 * previews are capped at ~5 MiB: larger family files render as the plain file
 * chip instead of an inline <img>.
 */

/**
 * Per-slice read ceiling (node cap: `FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES`
 * in apps/node/src/family-media.ts). Each RPC response stays small enough
 * for the desktop WebSocket envelope.
 */
export const FAMILY_ATTACHMENT_READ_CHUNK_BYTES = 1024 * 1024;

/**
 * Preview ceiling for inline family rendering (mirrors the mesh vault-image
 * preview cap and the EnvoyGo `maxFamilyAttachmentPreviewBytes`).
 */
export const FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

/** Structural shape of one `readFamilyAttachment` slice result. */
export interface FamilyAttachmentReadResultLike {
  contentBase64: string;
  sizeBytes: number;
  truncated: boolean;
}

/**
 * Loose reader signature — a nodeService object exposing `readFamilyAttachment`
 * (e.g. `(params) => nodeService.readFamilyAttachment(params)`) satisfies it.
 */
export type FamilyAttachmentReadFn = (params: {
  id: string;
  offset?: number;
  maxBytes?: number;
}) => Promise<FamilyAttachmentReadResultLike>;

export interface FetchFamilyAttachmentOptions {
  /** Whole-file cap. Defaults to the 5 MiB inline-preview ceiling. */
  maxBytes?: number;
  /** Per-slice size. Defaults to 1 MiB (node slice cap). */
  chunkBytes?: number;
}

export interface FetchFamilyAttachmentResult {
  /** Base64 of the fetched bytes (whole file for successful fetches). */
  contentBase64: string;
  /** Full stored size in bytes (from the last `sizeBytes` field seen). */
  sizeBytes: number;
  /** Parity with the node slice result. Under the `too-large:` throw below,
   * successful fetches always deliver the whole file, so this stays false. */
  truncated: boolean;
}

/** Decode each slice and re-encode the concatenation (base64 chunk padding
 * makes naive string concatenation invalid). */
function concatBase64Chunks(chunks: string[]): string {
  const parts = chunks.map((c) => {
    const bin = atob(c);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  });
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.byteLength;
  }
  let s = "";
  for (let i = 0; i < merged.length; i++) s += String.fromCharCode(merged[i]!);
  return btoa(s);
}

/**
 * Fetch stored family-media bytes by attachment `id`, auto-chunking through
 * `offset` + `maxBytes` slices.
 *
 * Stops when the node reports `truncated: false` (whole file delivered) or
 * after `maxBytes` have been fetched. When the node reports a stored size
 * above `maxBytes` the file is too large for the requested preview and the
 * call throws `too-large:` (mirrors the EnvoyGo family fetch) — inline image
 * callers should fall back to the plain file chip instead of rendering a
 * corrupt prefix.
 */
export async function fetchFamilyAttachmentBase64(
  read: FamilyAttachmentReadFn,
  id: string,
  options?: FetchFamilyAttachmentOptions,
): Promise<FetchFamilyAttachmentResult> {
  const maxBytes = options?.maxBytes ?? FAMILY_ATTACHMENT_PREVIEW_MAX_BYTES;
  const chunkBytes = Math.min(
    options?.chunkBytes ?? FAMILY_ATTACHMENT_READ_CHUNK_BYTES,
    FAMILY_ATTACHMENT_READ_CHUNK_BYTES,
  );

  const chunks: string[] = [];
  let offset = 0;
  let fetchedBytes = 0;
  let sizeBytes = 0;
  let truncated = false;

  while (fetchedBytes < maxBytes) {
    const sliceMax = Math.min(chunkBytes, maxBytes - fetchedBytes);
    const row = await read({ id, offset, maxBytes: sliceMax });
    sizeBytes = row.sizeBytes;
    if (sizeBytes > maxBytes) {
      throw new Error(
        `too-large: family attachment is ${sizeBytes} bytes (preview max ${maxBytes})`,
      );
    }
    const bin = row.contentBase64 ? atob(row.contentBase64) : "";
    if (bin.length > 0) chunks.push(row.contentBase64);
    fetchedBytes += bin.length;
    offset += bin.length;
    truncated = row.truncated;
    if (!truncated || fetchedBytes >= sizeBytes || bin.length === 0) break;
  }

  return {
    contentBase64: concatBase64Chunks(chunks),
    sizeBytes,
    truncated,
  };
}
