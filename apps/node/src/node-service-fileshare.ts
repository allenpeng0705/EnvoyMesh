/**
 * File sharing runtime (File Sharing section, simple operations).
 *
 * Extracted from `node-service-impl.ts`. Owns the local file-sharing
 * operations that only need class fields (vault dir, profile dir,
 * node config). No mesh, no audit, no transport — those stay on
 * the class for now.
 *
 * Companion commits (13b, 13c) will add IPFS-audit operations and
 * the network-driven share / request-share operations.
 */
import {
  buildVaultIndex,
  assertPathInsideVault,
} from "@envoymesh/vault";
import type {
  LibraryItem,
  ListAllLocalFilesResult,
  ListLibraryItemsParams,
  NodeConfig,
  OpenLocalFileParams,
  ReadLibraryItemContentParams,
  ReadLibraryItemContentResult,
  ReadLocalFileContentParams,
} from "@envoymesh/api";
import {
  openPathWithDefaultApp,
} from "./vault-file-open.js";
import {
  assertPathInsideOpenClawWorkspace,
  listOpenClawWorkspaceFilesFromDir,
  readOpenClawWorkspaceFileFromDir,
  type WorkspaceFileItem,
} from "./openclaw-workspace-files.js";
import { openClawWorkspaceDir } from "./openclaw-workspace.js";
import { buildAllLocalFilesList } from "./local-files.js";
import { createPublishedLibraryStore } from "./published-library-store.js";

export interface FileShareContext {
  /** Local vault dir, or null if not initialised. */
  getVaultDir(): string | null;
  /** Local profile dir, or null if not initialised. */
  getProfileDir(): string | null;
  /** Local node config (for IPFS enablement, RAG, etc.). */
  getNodeConfig(): Promise<NodeConfig | undefined>;
}

/* ---------- list ---------- */

export async function listLibraryItemsViaRuntime(
  ctx: FileShareContext,
  params?: ListLibraryItemsParams,
): Promise<LibraryItem[]> {
  const vaultDir = ctx.getVaultDir();
  const profileDir = ctx.getProfileDir();
  if (!vaultDir || !profileDir) return [];
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const publishedIds = await createPublishedLibraryStore(profileDir).loadDocumentIds();
  const q = params?.query?.trim().toLowerCase();
  let docs = index.documents;
  if (q) {
    docs = docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.relativePath.toLowerCase().includes(q),
    );
  }
  return docs.map((d) => ({
    documentId: d.documentId,
    relativePath: d.relativePath,
    title: d.title,
    extension: d.extension,
    byteLength: d.byteLength,
    contentHash: d.contentHash,
    updatedAt: d.updatedAt,
    published: publishedIds.has(d.documentId),
  }));
}

export async function listOpenClawWorkspaceFilesViaRuntime(
  ctx: FileShareContext,
  params?: { query?: string },
): Promise<WorkspaceFileItem[]> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) return [];
  return listOpenClawWorkspaceFilesFromDir(openClawWorkspaceDir(profileDir), params?.query);
}

export async function listAllLocalFilesViaRuntime(
  ctx: FileShareContext,
  params?: { query?: string; include?: "vault" | "workspace" | "both" },
): Promise<ListAllLocalFilesResult> {
  const [vaultItems, workspaceItems] = await Promise.all([
    listLibraryItemsViaRuntime(ctx, params),
    listOpenClawWorkspaceFilesViaRuntime(ctx, params),
  ]);
  return buildAllLocalFilesList({ vaultItems, workspaceItems });
}

/* ---------- publish ---------- */

export async function setLibraryItemPublishedViaRuntime(
  ctx: FileShareContext,
  documentId: string,
  published: boolean,
): Promise<void> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) return;
  await createPublishedLibraryStore(profileDir).setPublished(documentId, published);
}

/* ---------- OpenClaw workspace helpers ---------- */

export async function resolveOpenClawWorkspacePathViaRuntime(
  ctx: FileShareContext,
  relativePath: string,
): Promise<{ absolutePath: string }> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) throw new Error("Node profile dir not initialised");
  const absolutePath = assertPathInsideOpenClawWorkspace(
    openClawWorkspaceDir(profileDir),
    relativePath,
  );
  return { absolutePath };
}

export async function readOpenClawWorkspaceFileViaRuntime(
  ctx: FileShareContext,
  params: ReadLibraryItemContentParams,
): Promise<ReadLibraryItemContentResult> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) {
    return {
      contentBase64: "",
      mimeType: "application/octet-stream",
      sizeBytes: 0,
      truncated: false,
    };
  }
  return readOpenClawWorkspaceFileFromDir(openClawWorkspaceDir(profileDir), params);
}

/* ---------- open / read dispatch ---------- */

export async function openLocalFileViaRuntime(
  ctx: FileShareContext,
  openVaultFile: (relativePath: string) => Promise<void>,
  params: OpenLocalFileParams,
): Promise<void> {
  if (params.source === "workspace") {
    const { absolutePath } = await resolveOpenClawWorkspacePathViaRuntime(
      ctx,
      params.relativePath,
    );
    await openPathWithDefaultApp(absolutePath);
    return;
  }
  await openVaultFile(params.relativePath);
}

export async function readLocalFileContentViaRuntime(
  ctx: FileShareContext,
  readFromVault: (
    params: ReadLibraryItemContentParams,
  ) => Promise<ReadLibraryItemContentResult>,
  readFromWorkspace: (
    params: ReadLibraryItemContentParams,
  ) => Promise<ReadLibraryItemContentResult>,
  listVault: () => Promise<LibraryItem[]>,
  params: ReadLocalFileContentParams,
): Promise<ReadLibraryItemContentResult> {
  if (params.source === "workspace") {
    return readFromWorkspace({
      relativePath: params.relativePath,
      maxBytes: params.maxBytes,
    });
  }
  let relativePath = params.relativePath.trim().replace(/^[\\/]+/, "");
  if (!relativePath && params.documentId?.trim()) {
    const items = await listVault();
    const match = items.find((item) => item.documentId === params.documentId!.trim());
    if (!match) throw new Error(`Document not found: ${params.documentId}`);
    relativePath = match.relativePath;
  }
  return readFromVault({ relativePath, maxBytes: params.maxBytes });
}