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
  isVaultExtractableExtension,
  notesImportsBlogPathForWebPost,
  notesImportsPathForSource,
  uniqueRelativePath,
  wrapMaterializedMarkdown,
  VAULT_TEXT_EXTRACTOR_ID,
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
