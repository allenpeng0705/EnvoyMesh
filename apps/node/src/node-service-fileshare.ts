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
  resolveImportDestinationPath,
  isVaultExtractableExtension,
} from "@envoymesh/vault";
import {
  bondTrustRank,
  DEFAULT_RAG_INDEX_STATUS,
  MAX_LIBRARY_ITEM_PREVIEW_BYTES,
  pinCidToProvider,
  type AgentShareProposal,
  type BondLevel,
  type ConvertLibraryItemToMarkdownParams,
  type ConvertLibraryItemToMarkdownResult,
  type CreateNoteParams,
  type CreateNoteResult,
  type DeleteVaultItemParams,
  type DiscoverPublishedLibraryParams,
  type DiscoverPublishedLibraryPeerResult,
  type ExportLibraryItemToIpfsResult,
  type ImportToLibraryParams,
  type ImportToLibraryResult,
  type IpfsEngineStatus,
  type LibraryItem,
  type LibraryReadParams,
  type LibraryReadResult,
  type ListAllLocalFilesResult,
  type ListLibraryItemsParams,
  type NodeConfig,
  type NodeProfile,
  type OpenLocalFileParams,
  type PinLibraryItemExternalResult,
  type PublishedLibraryFileHit,
  type RagIndexStatus,
  type ReadLibraryItemContentParams,
  type ReadLibraryItemContentResult,
  type ReadLocalFileContentParams,
  type SubmitAgentShareProposalParams,
  type VerifyLibraryItemIpfsGatewayParams,
  type VerifyLibraryItemIpfsGatewayResult,
} from "@envoymesh/api";
import {
  collectLooseMarkdownIntoNotes,
  materializeBlogPostToNotes,
  materializeOfficeDocumentToNotes,
} from "./vault-markdown-corpus.js";
import { listBlogPosts as listBlogPostsAuthor } from "./web-content-author.js";
import {
  openPathWithDefaultApp,
  revealPathInFileManager,
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
import { createAgentShareProposalStore } from "./agent-share-proposal-store.js";
import {
  createAuditEvent,
  type AuditEvent,
  createSensitivityOverrideStore,
  type VaultItemSensitivity,
} from "@envoymesh/local-store";
import { mkdir, open, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createDiscoveryRequestPayload,
  createLibraryReadPayload,
  createShareRequestPayload,
  createUnsignedEnvelope,
  parseDiscoveryResponsePayload,
  parseLibraryReadResponsePayload,
  type LibraryReadResponsePayload,
} from "@envoymesh/protocol";
import type { EnvoyMesh } from "@envoymesh/network";
import { PUBLISHED_LIB_CAPABILITY } from "./discovery-inbound.js";
import { sendExpectReplyWithRetry } from "./chat-outbound-deliver.js";

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
  /** Phase 44C — get the plugin registry (or undefined if not wired). */
  getPluginRegistry?(): import("./kb-plugin-registry.js").PluginRegistry | undefined;
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

  // Phase 44C — metadata bridge: collect plugin-enriched metadata.
  let pluginMeta: Map<string, Array<{ pluginId: string; key: string; value: string }>> | undefined;
  const registry = ctx.getPluginRegistry?.();
  if (registry) {
    try {
      pluginMeta = await registry.runEnrichMetadata(
        docs.map((d) => ({
          documentId: d.documentId,
          relativePath: d.relativePath,
          title: d.title,
          extension: d.extension,
          byteLength: d.byteLength,
        })),
      );
    } catch {
      // Graceful degradation — proceed without plugin metadata.
    }
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
    ...(pluginMeta?.has(d.documentId)
      ? { pluginMetadata: pluginMeta.get(d.documentId) }
      : {}),
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
  // Periodically mirror Content → Blog into notes/imports/blog/ for Knowledge Browse.
  await maybeSyncBlogPostsToKnowledge(ctx);

  const [vaultItems, workspaceItems, linkedObsidianItems] = await Promise.all([
    listLibraryItemsViaRuntime(ctx, params),
    listOpenClawWorkspaceFilesViaRuntime(ctx, params),
    listLinkedObsidianItemsViaRuntime(ctx),
  ]);
  return buildAllLocalFilesList({ vaultItems, workspaceItems, linkedObsidianItems });
}

async function listLinkedObsidianItemsViaRuntime(
  ctx: FileShareContext,
): Promise<import("@envoymesh/api").LocalFileItem[]> {
  try {
    const config = await ctx.getNodeConfig();
    const paths = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
    if (!paths.length) return [];
    const { listLinkedObsidianMarkdownFiles } = await import("./linked-obsidian-files.js");
    return listLinkedObsidianMarkdownFiles(paths);
  } catch {
    return [];
  }
}

let lastBlogKnowledgeSyncAt = 0;
const BLOG_KNOWLEDGE_SYNC_INTERVAL_MS = 60_000;

async function maybeSyncBlogPostsToKnowledge(ctx: FileShareContext): Promise<void> {
  const now = Date.now();
  if (now - lastBlogKnowledgeSyncAt < BLOG_KNOWLEDGE_SYNC_INTERVAL_MS) return;
  lastBlogKnowledgeSyncAt = now;
  try {
    await syncBlogPostsToKnowledgeViaRuntime(ctx);
  } catch {
    // Best-effort — Browse still lists existing vault files.
  }
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
  await writeSensitivityOverride(ctx, documentId, published ? "public" : false);

  // 57C: when Obsidian is active, mirror Library Published into note frontmatter.
  await syncPublishedToObsidianFrontmatter(ctx, documentId, published);
}

/**
 * Write `published: true/false` into a Markdown note's YAML frontmatter when
 * the Obsidian KB plugin is active. Best-effort; never fails the Library toggle.
 */
async function syncPublishedToObsidianFrontmatter(
  ctx: FileShareContext,
  documentId: string,
  published: boolean,
): Promise<void> {
  try {
    const registry = ctx.getPluginRegistry?.();
    if (registry?.getPluginInfo("obsidian")?.status !== "active") return;

    const vaultDir = ctx.getVaultDir();
    if (!vaultDir) return;

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents.find((d) => d.documentId === documentId);
    if (!doc || doc.extension !== ".md") return;

    const absolutePath = resolve(vaultDir, doc.relativePath);
    assertPathInsideVault(vaultDir, absolutePath);
    const raw = await readFile(absolutePath, "utf8");
    const { setFrontmatterBoolean } = await import("@envoymesh/kb-obsidian");
    const next = setFrontmatterBoolean(raw, "published", published);
    if (next === raw) return;
    await writeFile(absolutePath, next, { mode: 0o600 });
  } catch {
    // Best-effort: published-library + sensitivity already updated.
  }
}

/**
 * Phase 44A1: persist per-item sensitivity override alongside published state.
 * Published items get sensitivity "public"; unpublished items have their override
 * removed (reverting to path heuristic). Uses SensitivityOverrideStore for
 * atomic writes. Stored in `{profileDir}/vault-sensitivity-overrides.json`
 * (outside the vault root to avoid polluting the vault index).
 */
async function writeSensitivityOverride(
  ctx: FileShareContext,
  documentId: string,
  sensitivity: VaultItemSensitivity | false,
): Promise<void> {
  try {
    const profileDir = ctx.getProfileDir();
    if (!profileDir) return;
    const store = createSensitivityOverrideStore(profileDir);
    if (sensitivity === false) {
      await store.delete(documentId);
    } else {
      await store.set(documentId, sensitivity);
    }
  } catch {
    // Best-effort: published-library.json write already succeeded.
    // Real FS operations may fail in test environments with mock paths.
  }
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
  if (params.source === "linked-obsidian") {
    const config = await ctx.getNodeConfig();
    const roots = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
    const { resolveLinkedObsidianAbsolutePath } = await import("./linked-obsidian-files.js");
    const absolutePath = await resolveLinkedObsidianAbsolutePath(roots, params.relativePath);
    if (!absolutePath) throw new Error("Linked Obsidian file not found");
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
      offset: params.offset,
    });
  }
  let relativePath = params.relativePath.trim().replace(/^[\\/]+/, "");
  if (!relativePath && params.documentId?.trim()) {
    const items = await listVault();
    const match = items.find((item) => item.documentId === params.documentId!.trim());
    if (!match) throw new Error(`Document not found: ${params.documentId}`);
    relativePath = match.relativePath;
  }
  return readFromVault({
    relativePath,
    maxBytes: params.maxBytes,
    offset: params.offset,
  });
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

  const norm = resolveImportDestinationPath(params.relativePath);
  const abs = resolve(vaultDir, norm);
  assertPathInsideVault(vaultDir, abs);
  const bytes = Buffer.from(params.contentBase64, "base64");
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes, { mode: 0o600 });

  let markdownRelativePath: string | undefined;
  const ext = extname(norm).toLowerCase();
  if (isVaultExtractableExtension(ext)) {
    const materialized = await materializeOfficeDocumentToNotes(vaultDir, norm, {
      profileDir: ctx.getProfileDir(),
      sensitivity: "private",
    });
    if (materialized.ok && materialized.markdownRelativePath) {
      markdownRelativePath = materialized.markdownRelativePath;
    }
  }

  const index = await buildVaultIndex({ rootDir: vaultDir });
  const doc = index.documents.find((d) => d.relativePath === norm);
  if (!doc) throw new Error(`Imported file not indexed: ${norm}`);
  return {
    documentId: doc.documentId,
    relativePath: doc.relativePath,
    sizeBytes: doc.byteLength,
    ...(markdownRelativePath ? { markdownRelativePath } : {}),
  };
}

export async function convertLibraryItemToMarkdownViaRuntime(
  ctx: FileShareContext,
  params: ConvertLibraryItemToMarkdownParams,
): Promise<ConvertLibraryItemToMarkdownResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) return { ok: false, reason: "vault_unavailable" };

  let relativePath = params.relativePath?.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
  if (!relativePath && params.documentId?.trim()) {
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents.find((d) => d.documentId === params.documentId!.trim());
    relativePath = doc?.relativePath;
  }
  if (!relativePath) return { ok: false, reason: "not_found" };

  return materializeOfficeDocumentToNotes(vaultDir, relativePath, {
    profileDir: ctx.getProfileDir(),
    sensitivity: "private",
  });
}

/** Collect loose Markdown into `notes/` then (optionally) used by Obsidian sync. */
export async function collectVaultMarkdownIntoNotesViaRuntime(
  ctx: FileShareContext,
): Promise<{ moved: Array<{ from: string; to: string }> }> {
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) return { moved: [] };
  return collectLooseMarkdownIntoNotes(vaultDir);
}

/* ---------- native notes (Phase 44A2) ---------- */

export async function createNoteViaRuntime(
  ctx: FileShareContext,
  params: CreateNoteParams,
): Promise<CreateNoteResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) throw new Error("Vault dir not initialised");

  // Validate filename — must end with .md and be path-safe.
  const filename = params.filename.trim().replace(/^[\\/]+/, "");
  if (!filename || !filename.endsWith(".md") || filename.includes("/") || filename.includes("\\") || filename.includes("..") || filename.includes("~")) {
    throw new Error("Invalid note filename — must be a simple .md basename");
  }

  const safeSubfolder = params.subfolder
    ? params.subfolder.trim().replace(/^[\\/]+/, "").replace(/[\\/]+$/, "")
    : "";
  if (safeSubfolder && (safeSubfolder.includes("..") || safeSubfolder.includes("~"))) {
    throw new Error("Invalid subfolder name");
  }

  const relativePath = safeSubfolder
    ? `notes/${safeSubfolder}/${filename}`
    : `notes/${filename}`;

  const abs = resolve(vaultDir, relativePath);
  assertPathInsideVault(vaultDir, abs);

  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, params.content, { encoding: "utf8", mode: 0o600 });

  const index = await buildVaultIndex({ rootDir: vaultDir });
  const doc = index.documents.find((d) => d.relativePath === relativePath);
  if (!doc) throw new Error(`Created note not indexed: ${relativePath}`);

  // Persist per-item sensitivity override when sensitivity is explicitly set.
  if (params.sensitivity) {
    await writeSensitivityOverride(ctx, doc.documentId, params.sensitivity);
  }

  return {
    documentId: doc.documentId,
    relativePath: doc.relativePath,
    sizeBytes: doc.byteLength,
  };
}

/**
 * Mirror all web blog posts into `notes/imports/blog/` for Knowledge Browse / RAG.
 * Idempotent overwrite per slug. Best-effort; skips unreadable posts.
 */
export async function syncBlogPostsToKnowledgeViaRuntime(
  ctx: FileShareContext,
  ownerId?: string,
): Promise<{ written: number; failed: number }> {
  const vaultDir = ctx.getVaultDir();
  const profileDir = ctx.getProfileDir();
  if (!vaultDir || !profileDir) return { written: 0, failed: 0 };

  const oid = ownerId?.trim() || "local";
  let posts: Awaited<ReturnType<typeof listBlogPostsAuthor>> = [];
  try {
    posts = await listBlogPostsAuthor(profileDir, oid);
  } catch {
    return { written: 0, failed: 0 };
  }

  const webDir = join(profileDir, "web");
  let written = 0;
  let failed = 0;
  for (const post of posts) {
    try {
      const markdown = await readFile(join(webDir, post.path), "utf8");
      const result = await materializeBlogPostToNotes(vaultDir, {
        webRelativePath: post.path,
        title: post.title,
        markdown,
        profileDir,
        sensitivity: "private",
      });
      if (result.ok) written += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  return { written, failed };
}

export async function deleteVaultItemViaRuntime(
  ctx: FileShareContext,
  params: DeleteVaultItemParams,
): Promise<void> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) throw new Error("Vault dir not initialised");

  const norm = params.relativePath.trim().replace(/^[\\/]+/, "");
  if (!norm || norm.includes("..") || norm.includes("~")) {
    throw new Error("Invalid vault path");
  }
  const abs = resolve(vaultDir, norm);
  assertPathInsideVault(vaultDir, abs);
  await unlink(abs);
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
  const rangeMode = params.offset !== undefined && params.offset !== null;
  const offset = rangeMode ? Math.max(0, Math.floor(Number(params.offset) || 0)) : 0;
  const { absolutePath, vaultRelativePath } = await resolveLibraryItemPathViaRuntime(
    ctx,
    params.relativePath,
  );
  const st = await stat(absolutePath);
  const ext = basename(vaultRelativePath).toLowerCase();
  const mimeType = mimeTypeForFilename(ext);
  if (!rangeMode) {
    if (st.size > maxBytes) {
      throw new Error(`File too large for preview (${st.size} bytes, max ${maxBytes})`);
    }
    const content = await readFile(absolutePath);
    return {
      contentBase64: content.toString("base64"),
      mimeType,
      sizeBytes: st.size,
      truncated: false,
    };
  }
  if (offset >= st.size) {
    return {
      contentBase64: "",
      mimeType,
      sizeBytes: st.size,
      truncated: false,
    };
  }
  const length = Math.min(maxBytes, st.size - offset);
  const fh = await open(absolutePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, offset);
    const slice = buf.subarray(0, bytesRead);
    return {
      contentBase64: slice.toString("base64"),
      mimeType,
      sizeBytes: st.size,
      truncated: offset + bytesRead < st.size,
    };
  } finally {
    await fh.close();
  }
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


/* ---------- network-driven file sharing (Step 13c) ---------- */

export interface FileShareNetworkContext extends FileShareContext {
  /** Throw if the node isn't connected to the mesh. */
  assertOnline(): void;
  /** Return the connected mesh instance (throws if absent). */
  requireMesh(): EnvoyMesh;
  /** Return the local node profile (throws if absent). */
  requireProfile(): NodeProfile;
  /** Resolve a peer's transport (peer-id + listen addrs). */
  resolvePeerTransportForOwner(ownerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string;
    listenAddrs: string[];
  }>;
  /** Compute dial hints for a peer. */
  dialHintsForChat(peerId: string, listenAddrs: string[]): Promise<string[]>;
  /** Load all bonds. */
  getBonds(): Promise<Array<{ peerOwnerId: string; displayName?: string; level: string; libp2pPeerId?: string }>>;
  /** Deliver a signed envelope to a peer (call/deliver pipeline). */
  deliverCallEnvelope(
    targetPeerId: string,
    envelope: unknown,
    dialHints: string[],
    listenAddrs: string[],
  ): Promise<void>;
  /** Record a pending push-share entry (envelope.messageId -> info). */
  setPendingPushShare(messageId: string, info: {
    relativePath: string;
    toPeerId: string;
    deliveryChannel: string;
  }): void;
  /** Record a pending pull-share entry (envelope.messageId -> info). */
  setPendingPullShare(messageId: string, info: {
    peerRelativePath: string;
    targetOwnerId: string;
    toPeerId: string;
    sensitivity: string;
  }): void;
  /** Record a correlation-id lookup by envelope.messageId. */
  setCorrelationByRequestMsgId(messageId: string, correlationId: string): void;
  /** Insert/update a transfer-status row in the task store. */
  upsertTransferStatus(status: {
    correlationId: string;
    phase: string;
    remotePeerOwnerId: string;
    remotePeerId: string;
    vaultRelativePath: string;
    updatedAt: string;
  }): void;
  /** Check that a vault path is safe + file exists. */
  assertVaultFileExists?(absolutePath: string): Promise<void>;
  /** Check that a relative path is safe for the vault. */
  isVaultPathSafe?(relativePath: string): boolean;
}

/**
 * `discoverPublishedLibrary` runtime.
 *
 * For each bonded peer (excluding blocked), resolves the transport,
 * computes dial hints, sends a `discovery.request` envelope, and
 * parses the reply. Failures per peer become result rows with `error`.
 */
export async function discoverPublishedLibraryViaRuntime(
  ctx: FileShareNetworkContext,
  params?: DiscoverPublishedLibraryParams,
): Promise<DiscoverPublishedLibraryPeerResult[]> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const mesh = ctx.requireMesh();
  const profile = ctx.requireProfile();

  const bonds = (await ctx.getBonds()).filter((b) => b.level !== "blocked");
  let targets = bonds;
  if (params?.targetOwnerIds && params.targetOwnerIds.length > 0) {
    const allow = new Set(params.targetOwnerIds);
    targets = bonds.filter((b) => allow.has(b.peerOwnerId));
  }
  targets = [...targets].sort((a, b) => bondTrustRank(a.level as BondLevel) - bondTrustRank(b.level as BondLevel));

  const results: DiscoverPublishedLibraryPeerResult[] = [];
  const maxResults = params?.maxResultsPerPeer ?? 5;
  const timeoutMs = params?.timeoutMsPerPeer ?? 15_000;
  const overallTimeoutMs = params?.overallTimeoutMs ?? 25_000;
  const deadline = Date.now() + overallTimeoutMs;
  let skippedForBudget = 0;

  for (const bond of targets) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      skippedForBudget = targets.length - results.length;
      break;
    }
    const peerTimeoutMs = Math.min(timeoutMs, remaining);
    if (peerTimeoutMs < 50) {
      skippedForBudget = targets.length - results.length;
      break;
    }
    const started = Date.now();
    try {
      const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
        await ctx.resolvePeerTransportForOwner(bond.peerOwnerId);
      const dialHints = await Promise.race([
        ctx.dialHintsForChat(transportPeerId, listenAddrs),
        new Promise<string[]>((r) => setTimeout(() => r([]), Math.min(8_000, peerTimeoutMs))),
      ]);
      const unsigned = createUnsignedEnvelope({
        senderPeerId: derivePeerId(profile.device.publicKeyPem),
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: recipientEnvelopePeerId,
        recipientRole: "human",
        intent: "discovery.request",
        payload: createDiscoveryRequestPayload({
          requesterOwnerId: profile.owner.ownerId,
          requestedTagHashes: [],
          requestedCapabilities: [PUBLISHED_LIB_CAPABILITY],
          maxResults,
          requestedSensitivity: "public",
          fileTitleQuery: params?.fileTitleQuery,
          requestedContentHashPrefixes: params?.contentHashPrefix ? [params.contentHashPrefix] : undefined,
        }),
        correlationId: randomUUID(),
      });
      const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
      const reply = await sendExpectReplyWithRetry({
        mesh: mesh as never,
        transportPeerId,
        envelope,
        dialHints,
        timeoutMs: peerTimeoutMs,
      });
      const latencyMs = Date.now() - started;
      if ((reply as { intent?: string }).intent !== "discovery.response") {
        results.push({
          peerOwnerId: bond.peerOwnerId,
          displayName: bond.displayName,
          libp2pPeerId: transportPeerId,
          bondLevel: bond.level as BondLevel,
          bondRank: bondTrustRank(bond.level as BondLevel),
          files: [],
          latencyMs,
          error: `unexpected reply intent ${(reply as { intent?: string }).intent ?? "unknown"}`,
        });
        continue;
      }
      const resp = parseDiscoveryResponsePayload(
        (reply as { payload: unknown }).payload,
      );
      const files: PublishedLibraryFileHit[] = resp.matches.flatMap((m) =>
        (m.libraryMatches ?? []).map((f) => ({
          documentId: f.documentId,
          title: f.title,
          relativePath: f.relativePath,
          contentHash: f.contentHash,
          byteLength: f.byteLength,
          cid: f.cid,
        })),
      );
      results.push({
        peerOwnerId: bond.peerOwnerId,
        displayName: bond.displayName,
        libp2pPeerId: transportPeerId,
        bondLevel: bond.level as BondLevel,
        bondRank: bondTrustRank(bond.level as BondLevel),
        files,
        latencyMs,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({
        peerOwnerId: bond.peerOwnerId,
        displayName: bond.displayName,
        libp2pPeerId: bond.libp2pPeerId ?? "",
        bondLevel: bond.level as BondLevel,
        bondRank: bondTrustRank(bond.level as BondLevel),
        files: [],
        latencyMs: Date.now() - started,
        error: msg,
      });
    }
  }

  if (skippedForBudget > 0 && results.length === 0) {
    throw new Error(
      `Timed out before any contact replied (${skippedForBudget} contact(s) not reached). They may be offline — try again when they are online.`,
    );
  }

  return results;
}

/**
 * Phase 45 — `libraryRead` runtime (requester side).
 *
 * Sends a signed `library.read` envelope to a bonded contact and awaits
 * the `library.read.response` reply. Mirrors `discoverPublishedLibraryViaRuntime`
 * but for a single target + single reply (not a fanout).
 *
 * Design: docs/web-content-browsing-design.md §4.4, §4.6.
 */
export async function libraryReadViaRuntime(
  ctx: FileShareNetworkContext,
  params: LibraryReadParams,
): Promise<LibraryReadResult> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const mesh = ctx.requireMesh();
  const profile = ctx.requireProfile();

  const started = Date.now();
  const timeoutMs = params.timeoutMs ?? 30_000;

  try {
    const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
      await ctx.resolvePeerTransportForOwner(params.targetOwnerId);
    const dialHints = await Promise.race([
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      new Promise<string[]>((r) => setTimeout(() => r([]), 30_000)),
    ]);

    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      senderRole: "human",
      recipientPeerId: recipientEnvelopePeerId,
      recipientRole: "human",
      intent: "library.read",
      payload: createLibraryReadPayload({
        requesterOwnerId: profile.owner.ownerId,
        targetOwnerId: params.targetOwnerId,
        path: params.path,
        range: params.range,
        ifNoneMatch: params.ifNoneMatch,
      }),
      correlationId: randomUUID(),
    });
    const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
    // Pass listen addrs + rebuild like profile.request — library.read uses the
    // message protocol (not chat), so prepareOutboundPeerConnection must get
    // the same same-LAN / overlay dial hints or expect-reply fails while chat works.
    const reply = await sendExpectReplyWithRetry({
      mesh: mesh as never,
      transportPeerId,
      envelope,
      dialHints,
      peerListenAddrs: listenAddrs,
      timeoutMs,
      rebuildDialHints: () => ctx.dialHintsForChat(transportPeerId, listenAddrs),
    });
    const latencyMs = Date.now() - started;

    if ((reply as { intent?: string }).intent !== "library.read.response") {
      return {
        peerOwnerId: params.targetOwnerId,
        libp2pPeerId: transportPeerId,
        status: "error" as const,
        latencyMs,
        error: `unexpected reply intent ${(reply as { intent?: string }).intent ?? "unknown"}`,
      };
    }

    const resp: LibraryReadResponsePayload = parseLibraryReadResponsePayload(
      (reply as { payload: unknown }).payload,
    );

    return {
      peerOwnerId: params.targetOwnerId,
      libp2pPeerId: transportPeerId,
      status: resp.status,
      body: resp.body,
      contentType: resp.contentType,
      contentHash: resp.contentHash,
      byteLength: resp.byteLength,
      etag: resp.etag,
      range: resp.range,
      publicRedirection: resp.publicRedirection,
      latencyMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      peerOwnerId: params.targetOwnerId,
      libp2pPeerId: "",
      status: "error" as const,
      latencyMs: Date.now() - started,
      error: msg,
    };
  }
}

/**
 * `shareFile` runtime (sender side: local vault -> remote).
 *
 * Validates the vault path, resolves the peer transport, sends a
 * `share.request` envelope with `fileOrigin: "sender"`, and records
 * the pending-share + transfer-status entries.
 */
export async function shareFileViaRuntime(
  ctx: FileShareNetworkContext,
  targetOwnerId: string,
  file: {
    path: string;
    sensitivity: "public" | "friends" | "private";
    deliveryChannel?: "inbox" | "chat" | "agent";
    chatRoomId?: string;
    chatMessageId?: string;
    chatAttachmentId?: string;
  },
): Promise<{ shareRequestMessageId: string }> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const profile = ctx.requireProfile();

  const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
    await ctx.resolvePeerTransportForOwner(targetOwnerId);

  const norm = file.path.replace(/^[\\/]+/, "");
  if (!ctx.isVaultPathSafe?.(norm)) {
    throw new Error("Invalid vault path");
  }
  if (ctx.assertVaultFileExists) {
    // Caller is responsible for the actual `stat`; the context method
    // throws "File not found in vault" if the file is missing.
    const absolutePath = join(ctx.getVaultDir() ?? "", norm);
    await ctx.assertVaultFileExists(absolutePath);
  } else {
    await stat(join(ctx.getVaultDir() ?? "", norm)).catch(() => {
      throw new Error("File not found in vault");
    });
  }

  const mesh = ctx.requireMesh();
  const conn = (mesh as unknown as { getPeerConnectionInfo(p: string): { connected: boolean } })
    .getPeerConnectionInfo(transportPeerId);
  let dialHints: string[];
  if (conn.connected || (mesh as unknown as { getConnectedPeerIds(): string[] }).getConnectedPeerIds().includes(transportPeerId)) {
    dialHints = [];
  } else {
    dialHints = await Promise.race([
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      new Promise<string[]>((r) => setTimeout(() => r([]), 10_000)),
    ]);
  }

  const correlationId = randomUUID();
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientEnvelopePeerId,
    recipientRole: "human",
    intent: "share.request",
    payload: createShareRequestPayload({
      requestType: "file",
      relativePath: norm,
      requestedSensitivity: file.sensitivity,
      fileOrigin: "sender",
      deliveryChannel: file.deliveryChannel ?? "inbox",
      chatRoomId: file.chatRoomId,
      chatMessageId: file.chatMessageId,
      chatAttachmentId: file.chatAttachmentId,
    }),
    correlationId,
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
  await ctx.deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs);
  ctx.setPendingPushShare(envelope.messageId, {
    relativePath: norm,
    toPeerId: transportPeerId,
    deliveryChannel: file.deliveryChannel ?? "inbox",
  });
  ctx.setCorrelationByRequestMsgId(envelope.messageId, correlationId);
  ctx.upsertTransferStatus({
    correlationId,
    phase: "negotiating",
    remotePeerOwnerId: targetOwnerId,
    remotePeerId: transportPeerId,
    vaultRelativePath: norm,
    updatedAt: new Date().toISOString(),
  });
  return { shareRequestMessageId: envelope.messageId };
}

/**
 * `requestShareFromLibrary` runtime (pull side: ask remote for a file).
 */
export async function requestShareFromLibraryViaRuntime(
  ctx: FileShareNetworkContext,
  targetOwnerId: string,
  file: {
    relativePath: string;
    sensitivity: "public" | "friends" | "private";
    correlationId?: string;
  },
): Promise<{ shareRequestMessageId: string }> {
  ctx.assertOnline();
  ctx.recordOwnerActivity();
  const profile = ctx.requireProfile();

  const { transportPeerId, recipientEnvelopePeerId, listenAddrs } =
    await ctx.resolvePeerTransportForOwner(targetOwnerId);
  const peerPath = file.relativePath.replace(/^[\\/]+/, "");

  const mesh = ctx.requireMesh();
  const conn = (mesh as unknown as { getPeerConnectionInfo(p: string): { connected: boolean } })
    .getPeerConnectionInfo(transportPeerId);
  let dialHints: string[];
  if (conn.connected || (mesh as unknown as { getConnectedPeerIds(): string[] }).getConnectedPeerIds().includes(transportPeerId)) {
    dialHints = [];
  } else {
    dialHints = await Promise.race([
      ctx.dialHintsForChat(transportPeerId, listenAddrs),
      new Promise<string[]>((r) => setTimeout(() => r([]), 10_000)),
    ]);
  }

  const correlationId = file.correlationId ?? randomUUID();
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(profile.device.publicKeyPem),
    senderPublicKey: profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientEnvelopePeerId,
    recipientRole: "human",
    intent: "share.request",
    payload: createShareRequestPayload({
      requestType: "file",
      relativePath: peerPath,
      requestedSensitivity: file.sensitivity,
      fileOrigin: "responder",
      deliveryChannel: "inbox",
      correlationId,
    }),
    correlationId,
  });
  const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
  ctx.setPendingPullShare(envelope.messageId, {
    peerRelativePath: peerPath,
    targetOwnerId,
    toPeerId: transportPeerId,
    sensitivity: file.sensitivity,
  });
  ctx.setCorrelationByRequestMsgId(envelope.messageId, correlationId);
  await ctx.deliverCallEnvelope(transportPeerId, envelope, dialHints, listenAddrs);
  ctx.upsertTransferStatus({
    correlationId,
    phase: "negotiating",
    remotePeerOwnerId: targetOwnerId,
    remotePeerId: transportPeerId,
    vaultRelativePath: peerPath,
    updatedAt: new Date().toISOString(),
  });
  return { shareRequestMessageId: envelope.messageId };
}


/* ---------- mime type lookup (inline copy — see openclaw-workspace-files.ts) ---------- */

const MIME_BY_EXT: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".ts": "application/typescript",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".csv": "text/csv",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".zip": "application/zip",
};

export function mimeTypeForFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = filename.slice(dot);
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/typescript" ||
    mime === "application/xml" ||
    mime.endsWith("+xml")
  ) {
    return `${mime}; charset=utf-8`;
  }
  return mime;
}