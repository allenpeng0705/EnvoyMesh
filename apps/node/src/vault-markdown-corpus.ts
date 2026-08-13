/**
 * Materialize anydoc GFM into `notes/imports/` and collect loose Markdown into `notes/`.
 * Used by Library import and Obsidian activate/Sync (Phase 57 item-4).
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { createSensitivityOverrideStore } from "@envoymesh/local-store";
import {
  assertPathInsideVault,
  buildVaultIndex,
  BLOG_KNOWLEDGE_EXTRACTOR_ID,
  collectMarkdownDestinationPath,
  extractVaultDocumentText,
  isMarkdownCollectCandidate,
  isUnderNotesImportsBlog,
  isUnderNotesImportsObsidian,
  isVaultExtractableExtension,
  normalizeVaultRelativePath,
  notesImportsBlogPathForWebPost,
  notesImportsPathForSource,
  uniqueRelativePath,
  wrapMaterializedMarkdown,
  VAULT_NOTES_IMPORTS_DIR,
  VAULT_TEXT_EXTRACTOR_ID,
  type VaultIndex,
} from "@envoymesh/vault";

export type MaterializeSensitivity = "public" | "friends" | "private";

export interface MaterializeOfficeOptions {
  /** When set, writes a per-document sensitivity override (default private). */
  profileDir?: string | null;
  /** Mesh/RAG sensitivity for the materialized note. Default: private. */
  sensitivity?: MaterializeSensitivity;
}

export interface MaterializeResult {
  ok: boolean;
  markdownRelativePath?: string;
  documentId?: string;
  reason?: string;
}

export interface CollectMarkdownResult {
  moved: Array<{ from: string; to: string }>;
}

/** True when Obsidian markdown collect changed vault paths that RAG indexes by relativePath. */
export function needsRagReindexAfterMarkdownCollect(
  moved: ReadonlyArray<{ from: string; to: string }>,
): boolean {
  return moved.length > 0;
}

/**
 * Extract text from an Office/PDF vault file and write GFM under `notes/imports/`.
 * Originals are left in place. Best-effort: returns `{ ok: false }` when extract fails.
 *
 * Materialized notes default to **private** (frontmatter + sensitivity override when
 * `profileDir` is provided) so contact/peer RAG cannot see them until Published.
 */
export async function materializeOfficeDocumentToNotes(
  vaultDir: string,
  sourceRelativePath: string,
  options?: MaterializeOfficeOptions,
): Promise<MaterializeResult> {
  const source = sourceRelativePath.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
  const ext = extname(source).toLowerCase();
  if (!isVaultExtractableExtension(ext)) {
    return { ok: false, reason: "not_extractable" };
  }

  const absSource = resolve(vaultDir, source);
  assertPathInsideVault(vaultDir, absSource);

  let bytes: Buffer;
  try {
    bytes = await readFile(absSource);
  } catch {
    return { ok: false, reason: "source_unreadable" };
  }

  const extracted = await extractVaultDocumentText(ext, bytes);
  if (!extracted?.trim()) {
    return { ok: false, reason: "extract_empty" };
  }

  const sensitivity: MaterializeSensitivity = options?.sensitivity ?? "private";
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const existing = new Set(index.documents.map((d) => d.relativePath.replace(/\\/g, "/")));
  const desired = notesImportsPathForSource(source);
  const markdownRelativePath = uniqueRelativePath(existing, desired);

  const body = wrapMaterializedMarkdown(extracted, {
    source,
    extractor: VAULT_TEXT_EXTRACTOR_ID,
    sensitivity,
  });

  const absMd = resolve(vaultDir, markdownRelativePath);
  assertPathInsideVault(vaultDir, absMd);
  await mkdir(dirname(absMd), { recursive: true });
  await writeFile(absMd, body, { encoding: "utf8", mode: 0o600 });

  const indexAfter = await buildVaultIndex({ rootDir: vaultDir });
  const doc = indexAfter.documents.find(
    (d) => d.relativePath.replace(/\\/g, "/") === markdownRelativePath,
  );

  const profileDir = options?.profileDir?.trim();
  if (doc && profileDir) {
    try {
      const store = createSensitivityOverrideStore(profileDir);
      await store.set(doc.documentId, sensitivity);
    } catch (err) {
      console.warn(
        `[vault] sensitivity override after materialize failed path=${markdownRelativePath}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: true,
    markdownRelativePath,
    ...(doc ? { documentId: doc.documentId } : {}),
  };
}

/**
 * Mirror a web blog post into `notes/imports/blog/<slug>.md` for Knowledge Browse / RAG.
 * Overwrites the same mirror path on republish/backfill. Defaults to private sensitivity.
 */
export async function materializeBlogPostToNotes(
  vaultDir: string,
  input: {
    /** Web-relative path, e.g. `blog/posts/hello.md`. */
    webRelativePath: string;
    title: string;
    /** Full markdown body (usually includes `# Title`). */
    markdown: string;
    profileDir?: string | null;
    sensitivity?: MaterializeSensitivity;
  },
): Promise<MaterializeResult> {
  const webPath = input.webRelativePath.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/");
  if (!webPath.startsWith("blog/posts/") || !webPath.toLowerCase().endsWith(".md")) {
    return { ok: false, reason: "not_blog_post" };
  }

  const sensitivity: MaterializeSensitivity = input.sensitivity ?? "private";
  const markdownRelativePath = notesImportsBlogPathForWebPost(webPath);
  const sourceRef = `web:${webPath}`;
  const body = wrapMaterializedMarkdown(input.markdown, {
    source: sourceRef,
    title: input.title,
    extractor: BLOG_KNOWLEDGE_EXTRACTOR_ID,
    sensitivity,
  });

  const absMd = resolve(vaultDir, markdownRelativePath);
  assertPathInsideVault(vaultDir, absMd);
  await mkdir(dirname(absMd), { recursive: true });
  await writeFile(absMd, body, { encoding: "utf8", mode: 0o600 });

  const indexAfter = await buildVaultIndex({ rootDir: vaultDir });
  const doc = indexAfter.documents.find(
    (d) => d.relativePath.replace(/\\/g, "/") === markdownRelativePath,
  );

  const profileDir = input.profileDir?.trim();
  if (doc && profileDir) {
    try {
      const store = createSensitivityOverrideStore(profileDir);
      await store.set(doc.documentId, sensitivity);
    } catch (err) {
      console.warn(
        `[vault] sensitivity override after blog materialize failed path=${markdownRelativePath}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return {
    ok: true,
    markdownRelativePath,
    ...(doc ? { documentId: doc.documentId } : {}),
  };
}

/**
 * Move loose vault `.md` files into `notes/` (Obsidian corpus).
 * Skips `notes/`, `blog/`, `feeds/`, `profile/`, `.obsidian/`.
 */
export async function collectLooseMarkdownIntoNotes(
  vaultDir: string,
): Promise<CollectMarkdownResult> {
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const existing = new Set(index.documents.map((d) => d.relativePath.replace(/\\/g, "/")));
  const moved: Array<{ from: string; to: string }> = [];

  const candidates = index.documents
    .map((d) => d.relativePath.replace(/\\/g, "/"))
    .filter((p) => isMarkdownCollectCandidate(p))
    .sort();

  for (const from of candidates) {
    // Skip if already moved in this pass (path no longer present).
    if (!existing.has(from)) continue;

    let desired: string;
    try {
      desired = collectMarkdownDestinationPath(from);
    } catch {
      continue;
    }
    if (desired === from) continue;

    // Free the source path from the uniqueness set before allocating destination.
    existing.delete(from);
    const to = uniqueRelativePath(existing, desired);
    const absFrom = resolve(vaultDir, from);
    const absTo = resolve(vaultDir, to);
    assertPathInsideVault(vaultDir, absFrom);
    assertPathInsideVault(vaultDir, absTo);
    await mkdir(dirname(absTo), { recursive: true });
    await rename(absFrom, absTo);
    existing.add(to);
    moved.push({ from, to });
  }

  return { moved };
}

/** Vault prefixes that must not be auto-materialized into `notes/imports/`. */
const MATERIALIZE_SKIP_PREFIXES = [
  "notes/",
  "chat/",
  "profile/",
  "blog/",
  "feeds/",
  ".obsidian/",
  ".envoy/",
] as const;

export interface MaterializePendingResult {
  materialized: string[];
  skippedExisting: string[];
  failed: Array<{ path: string; reason?: string }>;
  /** Office/PDF (etc.) sources that already have a `notes/imports` Markdown companion. */
  coveredSources: string[];
}

/**
 * Convert extractable Office/PDF/HTML vault files into `notes/imports/*.md` when missing.
 * Does not overwrite existing materialized notes (preserves Obsidian edits).
 * Used by Rebuild index so embedding prefers on-disk Markdown.
 */
export async function materializePendingExtractableDocuments(
  vaultDir: string,
  options?: MaterializeOfficeOptions,
): Promise<MaterializePendingResult> {
  const index = await buildVaultIndex({ rootDir: vaultDir });
  const covered = await collectMaterializedOfficeSources(vaultDir, index);
  const materialized: string[] = [];
  const skippedExisting: string[] = [];
  const failed: Array<{ path: string; reason?: string }> = [];

  const candidates = index.documents
    .map((d) => d.relativePath.replace(/\\/g, "/"))
    .filter((p) => shouldAutoMaterializeSource(p))
    .sort();

  for (const source of candidates) {
    if (covered.has(source)) {
      skippedExisting.push(source);
      continue;
    }
    const result = await materializeOfficeDocumentToNotes(vaultDir, source, options);
    if (result.ok && result.markdownRelativePath) {
      materialized.push(result.markdownRelativePath);
      covered.add(source);
    } else {
      failed.push({ path: source, reason: result.reason });
    }
  }

  return {
    materialized,
    skippedExisting,
    failed,
    coveredSources: [...covered].sort(),
  };
}

function shouldAutoMaterializeSource(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  const ext = extname(p).toLowerCase();
  if (!isVaultExtractableExtension(ext)) return false;
  for (const prefix of MATERIALIZE_SKIP_PREFIXES) {
    const bare = prefix.slice(0, -1);
    if (p === bare || p.startsWith(prefix)) return false;
  }
  return true;
}

/**
 * Read `source:` frontmatter from materialized notes under `notes/imports/`.
 */
export async function collectMaterializedOfficeSources(
  vaultDir: string,
  vaultIndex?: VaultIndex,
): Promise<Set<string>> {
  const index = vaultIndex ?? (await buildVaultIndex({ rootDir: vaultDir }));
  const covered = new Set<string>();
  for (const doc of index.documents) {
    const rel = doc.relativePath.replace(/\\/g, "/");
    if (!rel.startsWith(`${VAULT_NOTES_IMPORTS_DIR}/`)) continue;
    if (!rel.toLowerCase().endsWith(".md")) continue;
    // Blog / Obsidian mirrors are not Office companions.
    if (isUnderNotesImportsBlog(rel) || isUnderNotesImportsObsidian(rel)) continue;
    try {
      const abs = resolve(vaultDir, rel);
      assertPathInsideVault(vaultDir, abs);
      const body = await readFile(abs, "utf8");
      const source = parseMaterializedSourceFrontmatter(body);
      if (source) covered.add(source);
    } catch {
      // ignore unreadable companions
    }
  }
  return covered;
}

/** Parse `source:` from YAML frontmatter on a materialized Markdown note. */
export function parseMaterializedSourceFrontmatter(markdown: string): string | null {
  const trimmed = markdown.replace(/^\uFEFF/, "");
  if (!/^---[ \t]*\r?\n/.test(trimmed)) return null;
  const afterOpen = trimmed.slice(trimmed.indexOf("\n") + 1);
  const closeMatch = afterOpen.match(/^[ \t]*---[ \t]*\r?\n/m);
  if (!closeMatch || closeMatch.index === undefined) return null;
  const yaml = afterOpen.slice(0, closeMatch.index);
  const m = yaml.match(/^source:\s*(.+?)\s*$/m);
  if (!m?.[1]) return null;
  let raw = m[1].trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    const inner = raw.slice(1, -1);
    try {
      raw = JSON.parse(`"${inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`) as string;
    } catch {
      raw = inner;
    }
  }
  const source = normalizeVaultRelativePath(raw);
  // Skip non-file sources (e.g. blog mirrors use `web:…`).
  if (!source || source.includes(":") || source.startsWith("web:")) return null;
  return source;
}

