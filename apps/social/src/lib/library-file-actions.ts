import type { LocalFileSource, NodeService } from "@envoymesh/api";
import type { LocalFileOpenNodeService } from "./local-file-display.js";

export function normalizeVaultRelativePath(relativePath: string): string {
  return relativePath.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

export function vaultFilenameFromRelativePath(relativePath: string): string {
  const norm = normalizeVaultRelativePath(relativePath);
  const slash = norm.lastIndexOf("/");
  return slash >= 0 ? norm.slice(slash + 1) : norm || "file";
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** MIME types the browser can usually display inline in a new tab. */
export function isBrowserInlineViewableMime(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (
    normalized.startsWith("image/") ||
    normalized.startsWith("text/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/")
  ) {
    return true;
  }
  if (
    normalized === "application/pdf" ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/javascript"
  ) {
    return true;
  }
  return normalized.endsWith("+json") || normalized.endsWith("+xml");
}

/** Ensure text-like MIME types declare UTF-8 so Blob preview tabs don't mojibake. */
export function withUtf8Charset(mimeType: string): string {
  const raw = mimeType.trim();
  if (!raw) return "application/octet-stream";
  const lower = raw.toLowerCase();
  if (lower.includes("charset=")) return raw;
  if (
    lower.startsWith("text/") ||
    lower === "application/json" ||
    lower === "application/javascript" ||
    lower === "application/xml" ||
    lower.endsWith("+json") ||
    lower.endsWith("+xml")
  ) {
    return `${raw}; charset=utf-8`;
  }
  return raw;
}

export function openContentInBrowser(params: {
  contentBase64: string;
  mimeType: string;
  filename: string;
}): void {
  const bytes = base64ToBytes(params.contentBase64);
  const mimeType = withUtf8Charset(params.mimeType || "application/octet-stream");
  const blob = new Blob([bytes.slice()], { type: mimeType });
  const url = URL.createObjectURL(blob);
  try {
    if (isBrowserInlineViewableMime(params.mimeType)) {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        triggerBrowserDownload(url, params.filename);
        URL.revokeObjectURL(url);
        return;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    triggerBrowserDownload(url, params.filename);
    URL.revokeObjectURL(url);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function triggerBrowserDownload(url: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "download";
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function isFileTooLargeError(message: string): boolean {
  return /too large/i.test(message);
}

/**
 * Open a local file (vault or workspace) in the browser, with node fallback for large files.
 */
export async function openLocalFile(
  nodeService: LocalFileOpenNodeService,
  params: { source: LocalFileSource; relativePath: string; documentId?: string },
): Promise<void> {
  const norm = normalizeVaultRelativePath(params.relativePath);
  try {
    const result = await nodeService.readLocalFileContent({
      source: params.source,
      relativePath: norm,
      documentId: params.documentId,
    });
    openContentInBrowser({
      contentBase64: result.contentBase64,
      mimeType: result.mimeType,
      filename: vaultFilenameFromRelativePath(norm),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isFileTooLargeError(message)) {
      await nodeService.openLocalFile({ source: params.source, relativePath: norm });
      return;
    }
    throw err;
  }
}

/** @deprecated Use {@link openLocalFile} with source vault */
export async function openVaultLibraryFile(
  nodeService: LocalFileOpenNodeService,
  relativePath: string,
): Promise<void> {
  await openLocalFile(nodeService, { source: "vault", relativePath });
}

export async function revealVaultLibraryFile(
  nodeService: Pick<NodeService, "revealLibraryItemInFileManager">,
  relativePath: string,
): Promise<void> {
  await nodeService.revealLibraryItemInFileManager(normalizeVaultRelativePath(relativePath));
}

export function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
