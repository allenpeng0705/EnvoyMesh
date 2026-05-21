/**
 * Vault document fingerprinting for mobile — must match listLibraryItems and export lookup.
 */

const _MOBILE_VAULT_CHUNK_TEXT_EXTENSIONS = new Set([".txt", ".md", ".json"]);

export function mobileVaultBasename(path: string): string {
  const s = path.replace(/^\/+/, "");
  const parts = s.split("/");
  return parts[parts.length - 1] ?? s;
}

export function mobileVaultRelativePath(absoluteVaultPath: string): string {
  return absoluteVaultPath.replace(/^\/+/, "");
}

export function mobileVaultTitle(path: string): string {
  const base = mobileVaultBasename(path);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(0, i) : base;
}

export function mobileVaultExtension(path: string): string {
  const base = mobileVaultBasename(path);
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

async function _sha256Base64Url(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function mobileVaultLibraryFingerprint(
  relativePath: string,
  content: Uint8Array,
  extWithDot: string,
): Promise<{ documentId: string; contentHash: string }> {
  const contentSha256Base64Url = await _sha256Base64Url(content);

  let documentKeyUtf8: string;
  let contentHash: string;

  if (_MOBILE_VAULT_CHUNK_TEXT_EXTENSIONS.has(extWithDot)) {
    const text = new TextDecoder().decode(content);
    documentKeyUtf8 = `${relativePath}\n${text}`;
    contentHash = await _sha256Base64Url(new TextEncoder().encode(text));
  } else {
    documentKeyUtf8 = `${relativePath}\nBINARY\n${contentSha256Base64Url}`;
    contentHash = contentSha256Base64Url;
  }

  const fingerprintDigestFull = await _sha256Base64Url(new TextEncoder().encode(documentKeyUtf8));
  return { documentId: `doc_${fingerprintDigestFull.slice(0, 24)}`, contentHash };
}
