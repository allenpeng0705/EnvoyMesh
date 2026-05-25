export const VAULT_TEXT_CHUNK_EXTENSIONS = [".txt", ".md", ".json", ".csv"] as const;

export type VaultTextChunkExtension = (typeof VAULT_TEXT_CHUNK_EXTENSIONS)[number];

export const VAULT_EXTRACTABLE_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".xlsx",
  ".xls",
  ".html",
  ".htm",
  ".rtf",
] as const;

export type VaultExtractableExtension = (typeof VAULT_EXTRACTABLE_EXTENSIONS)[number];

export function isVaultTextChunkExtension(extension: string): boolean {
  const e = extension.toLowerCase();
  return (VAULT_TEXT_CHUNK_EXTENSIONS as readonly string[]).includes(e);
}

export function isVaultExtractableExtension(extension: string): boolean {
  const e = extension.toLowerCase();
  return (VAULT_EXTRACTABLE_EXTENSIONS as readonly string[]).includes(e);
}

export function isVaultSearchableExtension(extension: string): boolean {
  return isVaultTextChunkExtension(extension) || isVaultExtractableExtension(extension);
}
