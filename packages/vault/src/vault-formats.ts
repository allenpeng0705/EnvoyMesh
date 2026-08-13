export const VAULT_TEXT_CHUNK_EXTENSIONS = [".txt", ".md", ".json", ".csv"] as const;

export type VaultTextChunkExtension = (typeof VAULT_TEXT_CHUNK_EXTENSIONS)[number];

/**
 * Extractor pipeline id for RAG reindex invalidation.
 * Bump when extract behavior changes in a way that should rebuild vectors.
 */
export const VAULT_TEXT_EXTRACTOR_ID = "anydoc-v1+legacy-fallback";

/** Formats handled primarily by `@firecrawl/anydoc` (HTML stays legacy-only). */
export const VAULT_ANYDOC_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".docm",
  ".pptx",
  ".ppt",
  ".pptm",
  ".ppsx",
  ".ppsm",
  ".pps",
  ".pot",
  ".xlsx",
  ".xls",
  ".xlsm",
  ".xlsb",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".rtf",
] as const;

export type VaultAnydocExtension = (typeof VAULT_ANYDOC_EXTENSIONS)[number];

export const VAULT_EXTRACTABLE_EXTENSIONS = [
  ...VAULT_ANYDOC_EXTENSIONS,
  ".html",
  ".htm",
] as const;

export type VaultExtractableExtension = (typeof VAULT_EXTRACTABLE_EXTENSIONS)[number];

export function isVaultTextChunkExtension(extension: string): boolean {
  const e = extension.toLowerCase();
  return (VAULT_TEXT_CHUNK_EXTENSIONS as readonly string[]).includes(e);
}

export function isVaultAnydocExtension(extension: string): boolean {
  const e = extension.toLowerCase();
  return (VAULT_ANYDOC_EXTENSIONS as readonly string[]).includes(e);
}

export function isVaultExtractableExtension(extension: string): boolean {
  const e = extension.toLowerCase();
  return (VAULT_EXTRACTABLE_EXTENSIONS as readonly string[]).includes(e);
}

export function isVaultSearchableExtension(extension: string): boolean {
  return isVaultTextChunkExtension(extension) || isVaultExtractableExtension(extension);
}
