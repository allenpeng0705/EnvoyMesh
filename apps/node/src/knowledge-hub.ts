/**
 * Knowledge hub: linked Obsidian import/export + MCP remote browse/import/export.
 * Envoy vault remains the center for Ask/Publish/mesh.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import type {
  ExportNotesToLinkedObsidianParams,
  ExportNotesToLinkedObsidianResult,
  ExportNotesToMcpParams,
  ExportNotesToMcpResult,
  ImportExternalMcpKnowledgeParams,
  ImportExternalMcpKnowledgeResult,
  ImportLinkedObsidianNotesParams,
  ImportLinkedObsidianNotesResult,
  ListExternalMcpKnowledgeParams,
  ListExternalMcpKnowledgeResult,
  LocalFileItem,
  ReadLibraryItemContentResult,
} from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import {
  formatMcpSnippetAsNote,
  mcpRemoteBrowsePath,
  searchExternalMcpKnowledge,
  writeExternalMcpKnowledge,
  type ExternalKnowledgeSnippet,
} from "@envoymesh/rag";
import {
  assertPathInsideVault,
  buildVaultIndex,
  notesImportsObsidianPathForLinked,
  wrapMaterializedMarkdown,
} from "@envoymesh/vault";
import {
  listLinkedObsidianMarkdownFiles,
  resolveLinkedObsidianAbsolutePath,
  resolveLinkedObsidianRootByLabel,
  assertPathInsideLinkedObsidianRoot,
  type LinkedObsidianRoot,
} from "./linked-obsidian-files.js";
/** Minimal ctx to avoid circular import with node-service-fileshare. */
export interface KnowledgeHubContext {
  getVaultDir: () => string | null | undefined;
  getNodeConfig: () => Promise<{
    aiSettings?: {
      knowledgeBase?: import("@envoymesh/api").AiKnowledgeBaseSettings;
    };
  } | null | undefined>;
  recordOwnerActivity: () => void;
}

/** In-memory cache of MCP remote cards (for preview/import by path).
 * Upserts on list — never wipe on refresh so concurrent open/import stays valid. */
const MCP_REMOTE_CACHE_MAX = 500;
const mcpRemoteCache = new Map<
  string,
  { snippet: ExternalKnowledgeSnippet; externalId: string; updatedAt: string }
>();

export function clearMcpRemoteCacheForTests(): void {
  mcpRemoteCache.clear();
}

/** Test helper: seed cache without going through MCP list. */
export function seedMcpRemoteCacheForTests(
  entries: Array<{ path: string; title: string; text: string; externalId?: string }>,
): void {
  upsertMcpRemoteCache(
    entries.map((e) => ({
      path: e.path,
      externalId: e.externalId ?? e.path,
      snippet: { title: e.title, source: "mcp", text: e.text },
    })),
  );
}


function upsertMcpRemoteCache(
  entries: Array<{ path: string; snippet: ExternalKnowledgeSnippet; externalId: string }>,
): void {
  const now = new Date().toISOString();
  for (const entry of entries) {
    mcpRemoteCache.set(entry.path, {
      snippet: entry.snippet,
      externalId: entry.externalId,
      updatedAt: now,
    });
  }
  if (mcpRemoteCache.size <= MCP_REMOTE_CACHE_MAX) return;
  const sorted = [...mcpRemoteCache.entries()].sort((a, b) =>
    a[1].updatedAt.localeCompare(b[1].updatedAt),
  );
  const excess = mcpRemoteCache.size - MCP_REMOTE_CACHE_MAX;
  for (let i = 0; i < excess; i++) {
    mcpRemoteCache.delete(sorted[i]![0]);
  }
}


function snippetExternalId(snippet: ExternalKnowledgeSnippet, index: number): string {
  const fromSnippet = (snippet as { id?: string }).id?.trim();
  if (fromSnippet) return fromSnippet;
  return (
    createHash("sha256").update(`${snippet.title}\n${snippet.text}`).digest("hex").slice(0, 16) ||
    `idx-${index}`
  );
}

function snippetToLocalFile(snippet: ExternalKnowledgeSnippet, index: number): LocalFileItem {
  const externalId = snippetExternalId(snippet, index);
  const relativePath = mcpRemoteBrowsePath(externalId, snippet.title);
  const updatedAt = new Date().toISOString();
  const bytes = Buffer.byteLength(snippet.text, "utf8");
  return {
    source: "mcp-remote",
    relativePath,
    title: snippet.title,
    extension: ".md",
    byteLength: bytes,
    updatedAt,
    externalId,
    snippetPreview: snippet.text.slice(0, 280),
  };
}

export async function listExternalMcpKnowledgeViaRuntime(
  ctx: KnowledgeHubContext,
  params?: ListExternalMcpKnowledgeParams,
): Promise<ListExternalMcpKnowledgeResult> {
  const config = await ctx.getNodeConfig();
  const kb = config?.aiSettings?.knowledgeBase;
  const query = params?.query?.trim() || "*";
  const { snippets, error } = await searchExternalMcpKnowledge({
    query,
    knowledgeBase: kb,
    limit: params?.limit,
  });
  // Not configured → silent skip for Browse (do not toast mcp_url_missing).
  if (error === "mcp_url_missing") {
    return { items: [] };
  }
  if (error && snippets.length === 0) {
    // Keep prior cache so an in-flight preview/import still resolves.
    return { items: [], error };
  }
  const items = snippets.map((s, i) => snippetToLocalFile(s, i));
  upsertMcpRemoteCache(
    items.map((item, i) => ({
      path: item.relativePath,
      snippet: snippets[i]!,
      externalId: item.externalId ?? snippetExternalId(snippets[i]!, i),
    })),
  );
  return { items, error };
}

export async function readMcpRemoteFileContent(
  relativePath: string,
  maxBytes: number,
): Promise<ReadLibraryItemContentResult> {
  const cached = mcpRemoteCache.get(relativePath.trim().replace(/^[\\/]+/, ""));
  if (!cached) {
    throw new Error("MCP remote card not found — refresh Browse and try again");
  }
  const body = [
    "---",
    `source: mcp-remote`,
    `title: ${JSON.stringify(cached.snippet.title)}`,
    "---",
    "",
    `# ${cached.snippet.title}`,
    "",
    cached.snippet.text,
  ].join("\n");
  const buf = Buffer.from(body, "utf8");
  if (buf.length > maxBytes) {
    throw new Error(`File too large for preview (${buf.length} bytes, max ${maxBytes})`);
  }
  return {
    contentBase64: buf.toString("base64"),
    mimeType: "text/markdown; charset=utf-8",
    sizeBytes: buf.length,
    truncated: false,
  };
}

export async function readLinkedObsidianFileContentViaRuntime(
  ctx: KnowledgeHubContext,
  relativePath: string,
  maxBytes: number,
  offset?: number,
): Promise<ReadLibraryItemContentResult> {
  const config = await ctx.getNodeConfig();
  const roots = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
  const absolutePath = await resolveLinkedObsidianAbsolutePath(roots, relativePath);
  if (!absolutePath) throw new Error("Linked Obsidian file not found");
  const { stat, open, readFile } = await import("node:fs/promises");
  const st = await stat(absolutePath);
  if (!st.isFile()) throw new Error("Linked Obsidian path is not a file");
  const mimeType = "text/markdown; charset=utf-8";
  const rangeMode = offset !== undefined && offset !== null;
  const start = rangeMode ? Math.max(0, Math.floor(Number(offset) || 0)) : 0;
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
  if (start >= st.size) {
    return { contentBase64: "", mimeType, sizeBytes: st.size, truncated: false };
  }
  const length = Math.min(maxBytes, st.size - start);
  const fh = await open(absolutePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return {
      contentBase64: buf.subarray(0, bytesRead).toString("base64"),
      mimeType,
      sizeBytes: st.size,
      truncated: start + bytesRead < st.size,
    };
  } finally {
    await fh.close();
  }
}

export async function importLinkedObsidianNotesViaRuntime(
  ctx: KnowledgeHubContext,
  params: ImportLinkedObsidianNotesParams,
): Promise<ImportLinkedObsidianNotesResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) return { ok: false, imported: [], skipped: 0, reason: "vault_missing" };

  const config = await ctx.getNodeConfig();
  const roots = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
  if (!roots.length) {
    return { ok: false, imported: [], skipped: 0, reason: "no_linked_vaults" };
  }

  let candidates: LocalFileItem[];
  if (params.all) {
    candidates = await listLinkedObsidianMarkdownFiles(roots);
  } else {
    const paths = (params.paths ?? []).map((p) => p.trim().replace(/^[\\/]+/, "")).filter(Boolean);
    if (!paths.length) {
      return { ok: false, imported: [], skipped: 0, reason: "no_paths" };
    }
    candidates = paths.map((relativePath) => ({
      source: "linked-obsidian" as const,
      relativePath,
      title: basename(relativePath, ".md"),
      extension: ".md",
      byteLength: 0,
      updatedAt: new Date().toISOString(),
    }));
  }

  const imported: ImportLinkedObsidianNotesResult["imported"] = [];
  let skipped = 0;
  const writtenRels: string[] = [];

  for (const item of candidates) {
    try {
      const abs = await resolveLinkedObsidianAbsolutePath(roots, item.relativePath);
      if (!abs) {
        skipped += 1;
        continue;
      }
      const raw = await readFile(abs, "utf8");
      const destRel = notesImportsObsidianPathForLinked(item.relativePath);
      const content = wrapMaterializedMarkdown(raw, {
        source: item.relativePath,
        title: item.title,
        extractor: "obsidian-linked",
        sensitivity: "private",
      });
      const destAbs = resolve(vaultDir, destRel);
      assertPathInsideVault(vaultDir, destAbs);
      await mkdir(dirname(destAbs), { recursive: true });
      await writeFile(destAbs, content, { encoding: "utf8", mode: 0o600 });
      writtenRels.push(destRel);
      imported.push({ from: item.relativePath, to: destRel });
    } catch (err) {
      skipped += 1;
      console.warn(
        "[knowledge-hub] import linked Obsidian failed:",
        item.relativePath,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (writtenRels.length > 0) {
    try {
      const index = await buildVaultIndex({ rootDir: vaultDir });
      for (const row of imported) {
        const doc = index.documents.find((d) => d.relativePath === row.to);
        if (doc) row.documentId = doc.documentId;
      }
    } catch (err) {
      console.warn(
        "[knowledge-hub] post-import vault index failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (imported.length === 0) {
    return {
      ok: false,
      imported,
      skipped,
      reason: candidates.length === 0 ? "no_candidates" : "all_skipped",
    };
  }
  return { ok: true, imported, skipped };
}

export async function importExternalMcpKnowledgeViaRuntime(
  ctx: KnowledgeHubContext,
  params: ImportExternalMcpKnowledgeParams,
  createNote: (args: {
    filename: string;
    content: string;
    subfolder: string;
    sensitivity?: "public" | "friends" | "private";
  }) => Promise<{ documentId: string; relativePath: string }>,
): Promise<ImportExternalMcpKnowledgeResult> {
  ctx.recordOwnerActivity();
  const config = await ctx.getNodeConfig();
  const kb = config?.aiSettings?.knowledgeBase;
  const sensitivity = params.sensitivity ?? "private";
  const queriedAt = new Date().toISOString();
  const attribution = {
    server: kb?.mcpServerUrl ?? kb?.externalMcpServer ?? "mcp",
    tool: kb?.mcpSearchTool?.trim() || "memex_search",
    query: params.query?.trim() || "import",
    queriedAt,
  };

  const snippets: ExternalKnowledgeSnippet[] = [];

  if (params.query?.trim()) {
    const { snippets: hits, error } = await searchExternalMcpKnowledge({
      query: params.query.trim(),
      knowledgeBase: kb,
    });
    if (error && hits.length === 0) {
      return { ok: false, imported: [], reason: error };
    }
    snippets.push(...hits);
  } else {
    const paths = new Set(
      (params.paths ?? []).map((p) => p.trim().replace(/^[\\/]+/, "")).filter(Boolean),
    );
    const ids = new Set((params.externalIds ?? []).map((id) => id.trim()).filter(Boolean));
    if (paths.size === 0 && ids.size === 0) {
      return { ok: false, imported: [], reason: "no_selection" };
    }
    const seen = new Set<string>();
    for (const [path, entry] of mcpRemoteCache) {
      const matchPath = paths.has(path);
      const matchId = entry.externalId ? ids.has(entry.externalId) : false;
      if (!matchPath && !matchId) continue;
      const key = entry.externalId || path;
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push(entry.snippet);
    }
  }

  if (snippets.length === 0) {
    return { ok: false, imported: [], reason: "no_snippets" };
  }

  const imported: ImportExternalMcpKnowledgeResult["imported"] = [];
  for (const snippet of snippets) {
    const formatted = formatMcpSnippetAsNote(snippet, {
      attribution,
      sensitivity,
      subfolder: "mcp",
      title: params.title || snippet.title,
    });
    const note = await createNote({
      filename: formatted.filename,
      content: formatted.content,
      subfolder: formatted.subfolder,
      sensitivity,
    });
    imported.push({
      relativePath: note.relativePath,
      documentId: note.documentId,
      title: snippet.title,
    });
  }

  return { ok: true, imported };
}

const RAG_SYNC_MCP_LIMIT = 100;
const RAG_SYNC_OBSIDIAN_MAX_FILES = 400;

export interface SyncKnowledgeConnectorsForRagResult {
  obsidianImported: number;
  obsidianSkipped: number;
  mcpImported: number;
  mcpError?: string;
}

/**
 * Pull linked Obsidian + Notion/MCP cards into the vault Markdown corpus so Rebuild
 * can embed them. Does not trigger RAG reindex (caller owns that).
 *
 * - Obsidian → `notes/imports/obsidian/…` (stable paths; overwrites)
 * - MCP/Notion → `notes/mcp/<externalId>.md` (stable paths; overwrites)
 */
export async function syncKnowledgeConnectorsForRagViaRuntime(
  ctx: KnowledgeHubContext,
): Promise<SyncKnowledgeConnectorsForRagResult> {
  let obsidianImported = 0;
  let obsidianSkipped = 0;
  let mcpImported = 0;
  let mcpError: string | undefined;

  try {
    const config = await ctx.getNodeConfig();
    const roots = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
    if (roots.length > 0) {
      const files = (await listLinkedObsidianMarkdownFiles(roots)).slice(
        0,
        RAG_SYNC_OBSIDIAN_MAX_FILES,
      );
      const obsidian = await importLinkedObsidianNotesViaRuntime(ctx, {
        paths: files.map((f) => f.relativePath),
      });
      obsidianImported = obsidian.imported.length;
      obsidianSkipped = obsidian.skipped;
    }
  } catch (err) {
    console.warn(
      "[knowledge-hub] Obsidian sync for RAG failed:",
      err instanceof Error ? err.message : err,
    );
  }

  try {
    const vaultDir = ctx.getVaultDir();
    const config = await ctx.getNodeConfig();
    const kb = config?.aiSettings?.knowledgeBase;
    if (!vaultDir || !kb) {
      return { obsidianImported, obsidianSkipped, mcpImported };
    }
    const resolved = resolveAiKnowledgeBaseSettings(kb);
    if (resolved.externalProvider !== "mcp" || !resolved.mcpServerUrl?.trim()) {
      return { obsidianImported, obsidianSkipped, mcpImported };
    }

    const listed = await listExternalMcpKnowledgeViaRuntime(ctx, {
      query: "*",
      limit: RAG_SYNC_MCP_LIMIT,
    });
    if (listed.error && listed.items.length === 0) {
      mcpError = listed.error;
      return { obsidianImported, obsidianSkipped, mcpImported, mcpError };
    }

    const queriedAt = new Date().toISOString();
    const attribution = {
      server: resolved.mcpServerUrl ?? resolved.externalMcpServer ?? "mcp",
      tool: resolved.mcpSearchTool?.trim() || "memex_search",
      query: "*",
      queriedAt,
    };

    for (const item of listed.items) {
      const cached = mcpRemoteCache.get(item.relativePath);
      if (!cached) continue;
      const externalId = cached.externalId || item.externalId || item.relativePath;
      const safeId =
        externalId
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "snippet";
      const destRel = `notes/mcp/${safeId}.md`;
      const formatted = formatMcpSnippetAsNote(cached.snippet, {
        attribution,
        sensitivity: "private",
        subfolder: "mcp",
        title: cached.snippet.title,
      });
      // Stable id in frontmatter so rebuilds overwrite the same note.
      let content = formatted.content;
      if (!/^mcp-external-id\s*:/m.test(content)) {
        content = content.replace(/^---\n/, `---\nmcp-external-id: ${JSON.stringify(externalId)}\n`);
      }
      const abs = resolve(vaultDir, destRel);
      assertPathInsideVault(vaultDir, abs);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, { encoding: "utf8", mode: 0o600 });
      mcpImported += 1;
    }
  } catch (err) {
    mcpError = err instanceof Error ? err.message : String(err);
    console.warn("[knowledge-hub] MCP/Notion sync for RAG failed:", mcpError);
  }

  return { obsidianImported, obsidianSkipped, mcpImported, mcpError };
}

export async function exportNotesToLinkedObsidianViaRuntime(
  ctx: KnowledgeHubContext,
  params: ExportNotesToLinkedObsidianParams,
): Promise<ExportNotesToLinkedObsidianResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) return { ok: false, exported: [], reason: "vault_missing" };

  const config = await ctx.getNodeConfig();
  const roots = config?.aiSettings?.knowledgeBase?.linkedObsidianVaultPaths ?? [];
  if (!roots.length) return { ok: false, exported: [], reason: "no_linked_vaults" };

  const target = await resolveLinkedObsidianRootByLabel(roots, params.targetRootLabel);
  if (!target) return { ok: false, exported: [], reason: "root_not_found" };

  const exported: ExportNotesToLinkedObsidianResult["exported"] = [];
  for (const rel of params.relativePaths) {
    const vaultRel = rel.trim().replace(/^[\\/]+/, "");
    if (!vaultRel.endsWith(".md") || vaultRel.includes("..")) continue;
    const srcAbs = resolve(vaultDir, vaultRel);
    assertPathInsideVault(vaultDir, srcAbs);
    let body: string;
    try {
      body = await readFile(srcAbs, "utf8");
    } catch {
      continue;
    }
    const withMeta = /^---\r?\n[\s\S]*?\bexported-from\s*:/m.test(body)
      ? body
      : [
          wrapMaterializedMarkdown(body, {
            source: vaultRel,
            title: basename(vaultRel, ".md"),
            extractor: "envoymesh-export",
            sensitivity: "private",
          }).replace(
            /^extractor: envoymesh-export$/m,
            "exported-from: envoymesh\nextractor: envoymesh-export",
          ),
        ].join("");

    // Preserve vault-relative folder under export dir to avoid basename collisions.
    const safeInside = vaultRel.replace(/^notes\//, "").replace(/[^a-zA-Z0-9._/-]+/g, "-");
    const destAbs = resolve(target.absRoot, "envoymesh-export", safeInside);
    try {
      assertPathInsideLinkedObsidianRoot(target.absRoot, destAbs);
    } catch {
      continue;
    }
    await mkdir(dirname(destAbs), { recursive: true });
    await writeFile(destAbs, withMeta, { encoding: "utf8", mode: 0o600 });
    exported.push({
      from: vaultRel,
      to: `linked-obsidian/${target.label}/envoymesh-export/${safeInside}`,
    });
  }

  return { ok: exported.length > 0, exported, reason: exported.length ? undefined : "nothing_exported" };
}

export async function exportNotesToMcpViaRuntime(
  ctx: KnowledgeHubContext,
  params: ExportNotesToMcpParams,
): Promise<ExportNotesToMcpResult> {
  ctx.recordOwnerActivity();
  const vaultDir = ctx.getVaultDir();
  if (!vaultDir) return { ok: false, exported: [], reason: "vault_missing" };

  const config = await ctx.getNodeConfig();
  const kb = config?.aiSettings?.knowledgeBase;
  const exported: ExportNotesToMcpResult["exported"] = [];
  const failures: string[] = [];

  for (const rel of params.relativePaths) {
    const vaultRel = rel.trim().replace(/^[\\/]+/, "");
    if (!vaultRel.endsWith(".md") || vaultRel.includes("..")) continue;
    const srcAbs = resolve(vaultDir, vaultRel);
    assertPathInsideVault(vaultDir, srcAbs);
    let body: string;
    try {
      body = await readFile(srcAbs, "utf8");
    } catch {
      continue;
    }
    const title = basename(vaultRel, ".md");
    const result = await writeExternalMcpKnowledge({
      knowledgeBase: kb,
      title,
      content: body,
    });
    if (!result.ok) {
      failures.push(`${vaultRel}: ${result.error ?? "mcp_write_failed"}`);
      continue;
    }
    exported.push({ relativePath: vaultRel, externalId: result.externalId });
  }

  if (exported.length === 0) {
    return {
      ok: false,
      exported,
      reason: failures[0] ?? "nothing_exported",
    };
  }
  return {
    ok: true,
    exported,
    reason: failures.length
      ? `partial: ${failures.length} failed (${failures.slice(0, 3).join("; ")})`
      : undefined,
  };
}

/** Owner-only lexical search over linked Obsidian markdown (query-time; mesh stays vault-only). */
export async function searchLinkedObsidianKnowledge(input: {
  absoluteRoots: readonly string[];
  query: string;
  limit?: number;
}): Promise<Array<{ title: string; relativePath: string; text: string; score: number }>> {
  const q = input.query.trim().toLowerCase();
  if (!q || !input.absoluteRoots.length) return [];
  const limit = input.limit ?? 5;
  const maxFiles = 400;
  const maxBytes = 256 * 1024;
  const files = (await listLinkedObsidianMarkdownFiles(input.absoluteRoots)).slice(0, maxFiles);
  const hits: Array<{ title: string; relativePath: string; text: string; score: number }> = [];
  const terms = q.split(/\s+/).filter(Boolean);

  for (const file of files) {
    if (file.byteLength > maxBytes) continue;
    const abs = await resolveLinkedObsidianAbsolutePath(input.absoluteRoots, file.relativePath);
    if (!abs) continue;
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    if (text.length > maxBytes) text = text.slice(0, maxBytes);
    const hay = `${file.title}\n${text}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (hay.includes(term)) score += 1;
    }
    if (score === 0) continue;
    hits.push({
      title: file.title,
      relativePath: file.relativePath,
      text: text.slice(0, 1200),
      score,
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function formatLinkedObsidianKnowledgeSection(
  hits: Array<{ title: string; relativePath: string; text: string }>,
): string {
  if (hits.length === 0) return "";
  const lines = hits.map(
    (h) =>
      `- ${h.title} (${h.relativePath}): "${h.text.replace(/\s+/g, " ").replace(/"/g, "'").slice(0, 400)}"`,
  );
  return `## Linked Obsidian vault\n${lines.join("\n")}`;
}

export type { LinkedObsidianRoot };
