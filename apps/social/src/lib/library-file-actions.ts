import type { NodeService } from "@envoymesh/api";

export async function openVaultLibraryFile(
  nodeService: Pick<NodeService, "openLibraryItem">,
  relativePath: string,
): Promise<void> {
  await nodeService.openLibraryItem(relativePath.replace(/^[\\/]+/, ""));
}

export async function revealVaultLibraryFile(
  nodeService: Pick<NodeService, "revealLibraryItemInFileManager">,
  relativePath: string,
): Promise<void> {
  await nodeService.revealLibraryItemInFileManager(relativePath.replace(/^[\\/]+/, ""));
}

export function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
