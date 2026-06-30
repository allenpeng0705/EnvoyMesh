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
import { createPublishedExternalStore } from "./published-external-store.js";
import { exportVaultDocumentToIpfs } from "./vault-ipfs-export-service.js";
import { verifyVaultDocumentIpfsGateway } from "./vault-ipfs-gateway-verify.js";
import { isSafeVaultPath } from "./share-inbound.js";
import {
  getIpfsEngineStatus as getIpfsEngineStatusRouter,
  resolveIpfsExportEngineSelection,
} from "./ipfs-export-router.js";
import { revealPathInFileManager } from "./vault-file-open.js";
import { createAgentShareProposalStore } from "./agent-share-proposal-store.js";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_RAG_INDEX_STATUS,
  MAX_LIBRARY_ITEM_PREVIEW_BYTES,
  pinCidToProvider,
  type AgentShareProposal,
  type ExportLibraryItemToIpfsResult,
  type ImportToLibraryParams,
  type ImportToLibraryResult,
  type IpfsEngineStatus,
  type PinLibraryItemExternalResult,
  type RagIndexStatus,
  type SubmitAgentShareProposalParams,
  type VerifyLibraryItemIpfsGatewayParams,
  type VerifyLibraryItemIpfsGatewayResult,
} from "@envoymesh/api";

export interface FileShareContext {
  /** Local vault dir, or null if not initialised. */
  getVaultDir(): string | null;
  /** Local profile dir, or null if not initialised. */
  getProfileDir(): string | null;
  /** Local node config (for IPFS enablement, RAG, etc.). */
  getNodeConfig(): Promise<NodeConfig | undefined>;
  /** Get the local task store (or undefined if not initialised). */
  getTaskStore(): unknown;
  /** Get the RAG service (or null if not wired). */
  getRagService(): Promise<{ getIndexStatus(): import("@envoymesh/api").RagIndexStatus } | null>;
  /** Record owner activity for the activity log. */
  recordOwnerActivity(): void;
  /** Append an audit event to the task store (no-op when absent). */
  appendAuditEvent?(event: AuditEvent): Promise<void>;
  /** Emit an event (matches the class's EventEmitter signature). */
  emit(event: string, payload: unknown): void;
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

/* ---------- IPFS engine status + RAG index status ---------- */

export async function getIpfsEngineStatusViaRuntime(
  ctx: FileShareContext,
): Promise<IpfsEngineStatus> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) {
    return {
      available: false,
      running: false,
      managed: false,
    } as IpfsEngineStatus;
  }
  const config = await ctx.getNodeConfig();
  return getIpfsEngineStatusRouter({
    profileDir,
    selection: resolveIpfsExportEngineSelection({
      externalPublish: config?.externalPublish,
    }),
  });
}

export async function getRagIndexStatusViaRuntime(
  ctx: FileShareContext,
): Promise<RagIndexStatus> {
  const rag = await ctx.getRagService();
  return rag?.getIndexStatus() ?? DEFAULT_RAG_INDEX_STATUS;
}

/* ---------- IPFS export + pin + gateway (audit-event integrations) ---------- */

export async function exportLibraryItemToIpfsViaRuntime(
  ctx: FileShareContext,
  documentId: string,
): Promise<ExportLibraryItemToIpfsResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  const profileDir = ctx.getProfileDir();
  if (!vaultDir || !profileDir || !ctx.getTaskStore()) {
    throw new Error("Task store not initialized — node is not fully wired");
  }
  const config = await ctx.getNodeConfig();
  const allowIpfs = config?.externalPublish?.allowIpfs ?? false;
  return exportVaultDocumentToIpfs({
    vaultDir,
    profileDir,
    documentId,
    allowIpfs,
    externalPublish: config?.externalPublish,
    appendAudit: async (event) => {
      if (ctx.appendAuditEvent) await ctx.appendAuditEvent(event);
    },
  });
}

export async function pinLibraryItemExternalViaRuntime(
  ctx: FileShareContext,
  documentId: string,
): Promise<PinLibraryItemExternalResult> {
  ctx.recordOwnerActivity();
  const profileDir = ctx.getProfileDir();
  if (!profileDir) return { ok: false, error: "Profile dir not initialised" };
  const config = await ctx.getNodeConfig();
  if (!config?.externalPublish?.allowIpfs) {
    return { ok: false, error: "IPFS export is disabled" };
  }
  if (!config.externalPublish.pinningEnabled) {
    return { ok: false, error: "External pinning is disabled in node settings" };
  }
  const store = createPublishedExternalStore(profileDir);
  const record = await store.get(documentId.trim());
  if (!record?.cid?.trim()) {
    return { ok: false, error: "Document has no exported CID — export to IPFS first" };
  }
  const outcome = await pinCidToProvider({
    cid: record.cid,
    name: documentId,
    provider: config.externalPublish.pinningProvider ?? "pinata",
  });
  if (!outcome.ok) {
    return { ok: false, error: outcome.error };
  }
  if (ctx.appendAuditEvent) {
    const event = createAuditEvent({
      type: "vault.ipfs_pin.completed",
      outcome: "record",
      summary: `Pinned CID via ${outcome.provider}`,
      createdAt: new Date().toISOString(),
    });
    await ctx.appendAuditEvent(event);
  }
  return {
    ok: true,
    cid: record.cid,
    provider: outcome.provider,
    pinId: outcome.pinId,
  };
}

export async function verifyLibraryItemIpfsGatewayViaRuntime(
  ctx: FileShareContext,
  params: VerifyLibraryItemIpfsGatewayParams,
): Promise<VerifyLibraryItemIpfsGatewayResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  const profileDir = ctx.getProfileDir();
  if (!vaultDir || !profileDir || !ctx.getTaskStore()) {
    throw new Error("Task store not initialized — node is not fully wired");
  }
  const config = await ctx.getNodeConfig();
  return verifyVaultDocumentIpfsGateway({
    vaultDir,
    profileDir,
    documentId: params.documentId,
    allowIpfs: config?.externalPublish?.allowIpfs ?? false,
    gatewayAllowlist: config?.externalPublish?.gatewayAllowlist,
    gatewayUrl: params.gatewayUrl,
    appendAudit: async (event) => {
      if (ctx.appendAuditEvent) await ctx.appendAuditEvent(event);
    },
  });
}

/* ---------- library import / path resolution / open / reveal ---------- */

export async function importToLibraryViaRuntime(
  ctx: FileShareContext,
  params: ImportToLibraryParams,
): Promise<ImportToLibraryResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) throw new Error("Vault dir not initialised");
  const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
  if (!norm || norm.includes("..") || norm.includes("~")) {
    throw new Error("Invalid vault path");
  }
  const abs = resolve(vaultDir, norm);
  assertPathInsideVault(vaultDir, abs);
  const bytes = Buffer.from(params.contentBase64, "base64");
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { mode: 0o600 });
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const doc = index.documents.find((d) => d.relativePath === norm);
  if (!doc) throw new Error(`Imported file not indexed: ${norm}`);
  return {
    documentId: doc.documentId,
    relativePath: doc.relativePath,
    sizeBytes: doc.byteLength,
  };
}

export async function resolveLibraryItemPathViaRuntime(
  ctx: FileShareContext,
  relativePath: string,
): Promise<{ vaultRelativePath: string; absolutePath: string }> {
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) throw new Error("Vault dir not initialised");
  const norm = relativePath.trim().replace(/^[\\/]+/, "");
  if (!isSafeVaultPath(vaultDir, norm)) throw new Error("Invalid vault path");
  const absolutePath = resolve(vaultDir, norm);
  assertPathInsideVault(vaultDir, absolutePath);
  await stat(absolutePath).catch(() => {
    throw new Error("File not found in vault");
  });
  return { vaultRelativePath: norm, absolutePath };
}

export async function readLibraryItemContentViaRuntime(
  ctx: FileShareContext,
  params: ReadLibraryItemContentParams,
): Promise<ReadLibraryItemContentResult> {
  const maxBytes = Math.min(
    params.maxBytes ?? MAX_LIBRARY_ITEM_PREVIEW_BYTES,
    MAX_LIBRARY_ITEM_PREVIEW_BYTES,
  );
  const { absolutePath, vaultRelativePath } = await resolveLibraryItemPathViaRuntime(
    ctx,
    params.relativePath,
  );
  const st = await stat(absolutePath);
  if (st.size > maxBytes) {
    throw new Error(`File too large for preview (${st.size} bytes, max ${maxBytes})`);
  }
  const content = await readFile(absolutePath);
  const ext = basename(vaultRelativePath).toLowerCase();
  return {
    contentBase64: content.toString("base64"),
    mimeType: mimeTypeForFilename(ext),
    sizeBytes: st.size,
    truncated: false,
  };
}

export async function openLibraryItemViaRuntime(
  ctx: FileShareContext,
  relativePath: string,
): Promise<void> {
  const { absolutePath } = await resolveLibraryItemPathViaRuntime(ctx, relativePath);
  await openPathWithDefaultApp(absolutePath);
}

export async function revealLibraryItemInFileManagerViaRuntime(
  ctx: FileShareContext,
  relativePath: string,
): Promise<void> {
  const { absolutePath } = await resolveLibraryItemPathViaRuntime(ctx, relativePath);
  await revealPathInFileManager(absolutePath);
}

/* ---------- agent-share proposals ---------- */

export async function listAgentShareProposalsViaRuntime(
  ctx: FileShareContext,
): Promise<AgentShareProposal[]> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) return [];
  return createAgentShareProposalStore(profileDir).list();
}

export async function dismissAgentShareProposalViaRuntime(
  ctx: FileShareContext,
  proposalId: string,
): Promise<void> {
  const profileDir = ctx.getProfileDir();
  if (!profileDir) return;
  await createAgentShareProposalStore(profileDir).remove(proposalId);
}

export async function submitAgentShareProposalViaRuntime(
  ctx: FileShareContext,
  params: SubmitAgentShareProposalParams,
): Promise<AgentShareProposal> {
  const proposal: AgentShareProposal = {
    proposalId: randomUUID(),
    createdAt: new Date().toISOString(),
    targetOwnerId: params.targetOwnerId.trim(),
    vaultRelativePath: params.vaultRelativePath.replace(/^[\\/]+/, ""),
    sensitivity: params.sensitivity,
    summary: params.summary?.trim() || undefined,
  };
  const profileDir = ctx.getProfileDir();
  if (profileDir) {
    await createAgentShareProposalStore(profileDir).upsert(proposal);
  }
  ctx.emit("share:agent-proposed", proposal);
  return proposal;
}

/* ---------- mime type lookup (inline copy — see openclaw-workspace-files.ts) ---------- */

const MIME_BY_EXT: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".ts": "application/typescript",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

function mimeTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = filename.slice(dot);
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}