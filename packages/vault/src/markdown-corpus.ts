/**
 * Markdown corpus layout for Obsidian + EnvoyMesh (Phase 57 item-4).
 *
 * - Originals (Office/PDF/…) stay under `documents/` (Envoy backup).
 * - Human-editable Markdown lives under `notes/` (Obsidian-managed when plugin is active).
 * - anydoc GFM materializes to `notes/imports/<stem>.md` with `source:` frontmatter.
 */

import { basename, dirname, extname, posix } from "node:path";
import { VAULT_TEXT_EXTRACTOR_ID } from "./vault-formats.js";

export const VAULT_NOTES_DIR = "notes";
export const VAULT_NOTES_IMPORTS_DIR = "notes/imports";
export const VAULT_NOTES_IMPORTS_BLOG_DIR = "notes/imports/blog";
export const VAULT_NOTES_IMPORTS_OBSIDIAN_DIR = "notes/imports/obsidian";
export const VAULT_DOCUMENTS_DIR = "documents";

/** Extractor id for blog → knowledge mirrors. */
export const BLOG_KNOWLEDGE_EXTRACTOR_ID = "blog";

/**
 * Vault-relative prefixes that must not be moved into `notes/` when collecting
 * loose Markdown (site content, plugin data, already under notes).
 */
export const VAULT_MD_COLLECT_EXCLUDE_PREFIXES = [
  "notes/",
  "blog/",
  "feeds/",
  "profile/",
  ".obsidian/",
  ".envoy/",
] as const;

/**
 * Non-markdown import paths that must stay where the caller asked
 * (chat attachments, profile media, site content). Without this,
 * `resolveImportDestinationPath` nests them under `documents/`, and
 * share/send still looks up the original path → "File not found in vault".
 */
export const VAULT_IMPORT_PRESERVE_PREFIXES = [
  "chat/",
  "profile/",
  "blog/",
  "feeds/",
  ".obsidian/",
  ".envoy/",
] as const;

/** Chat transfer blobs (`chat/out/…`, `chat/in/…`) — chat history only, not My Files / Knowledge. */
export function isVaultChatAttachmentPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return p === "chat" || p.startsWith("chat/");
}

/** Profile avatar / gallery blobs — Profile UI only. */
export function isVaultProfileMediaPath(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return p === "profile" || p.startsWith("profile/");
}

/** Paths that must not appear in library / knowledge browse lists. */
export function isVaultLibraryHiddenPath(relativePath: string): boolean {
  return isVaultChatAttachmentPath(relativePath) || isVaultProfileMediaPath(relativePath);
}

/** Voice-note filenames under chat/ (mesh outbound/inbound audio messages). */
export function isVaultChatVoiceNotePath(relativePath: string): boolean {
  return (
    isVaultChatAttachmentPath(relativePath) &&
    /(^|\/)voice-note\.(webm|m4a|wav)$/i.test(normalizeVaultRelativePath(relativePath))
  );
}

/** Normalize to forward-slash vault-relative path without leading slash. */
export function normalizeVaultRelativePath(relativePath: string): string {
  return relativePath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

export function isUnderNotes(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return p === VAULT_NOTES_DIR || p.startsWith(`${VAULT_NOTES_DIR}/`);
}

export function isMarkdownCollectCandidate(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  if (!p.toLowerCase().endsWith(".md")) return false;
  for (const prefix of VAULT_MD_COLLECT_EXCLUDE_PREFIXES) {
    if (p === prefix.slice(0, -1) || p.startsWith(prefix)) return false;
  }
  return true;
}

/**
 * Prefer `documents/<file>` for binary/office imports.
 * Legacy `imports/` paths are rewritten to `documents/`.
 * Native `.md` imports land under `notes/imports/`.
 * System prefixes (`chat/`, `profile/`, …) are left unchanged.
 */
export function resolveImportDestinationPath(requestedRelativePath: string): string {
  const p = normalizeVaultRelativePath(requestedRelativePath);
  if (!p || p.includes("..") || p.includes("~")) {
    throw new Error("Invalid vault path");
  }

  const ext = extname(p).toLowerCase();
  const base = basename(p);

  if (ext === ".md") {
    if (isUnderNotes(p)) return p;
    return posix.join(VAULT_NOTES_IMPORTS_DIR, base);
  }

  if (p.startsWith("imports/")) {
    return posix.join(VAULT_DOCUMENTS_DIR, p.slice("imports/".length));
  }
  if (p.startsWith(`${VAULT_DOCUMENTS_DIR}/`) || p.startsWith(`${VAULT_NOTES_DIR}/`)) {
    return p;
  }
  for (const prefix of VAULT_IMPORT_PRESERVE_PREFIXES) {
    if (p === prefix.slice(0, -1) || p.startsWith(prefix)) return p;
  }
  // Bare or other folders → keep under documents for non-md.
  return posix.join(VAULT_DOCUMENTS_DIR, p.includes("/") ? p : base);
}

/**
 * Companion Markdown path for an original document (Office/PDF/…).
 * `documents/report.docx` → `notes/imports/report.md`
 */
export function notesImportsPathForSource(sourceRelativePath: string): string {
  const p = normalizeVaultRelativePath(sourceRelativePath);
  const stem = basename(p, extname(p)) || "imported";
  return posix.join(VAULT_NOTES_IMPORTS_DIR, `${stem}.md`);
}

/**
 * Knowledge mirror path for a web blog post.
 * `blog/posts/hello.md` → `notes/imports/blog/hello.md`
 */
export function notesImportsBlogPathForWebPost(webRelativePath: string): string {
  const p = normalizeVaultRelativePath(webRelativePath);
  const stem = basename(p, extname(p)) || "post";
  const safe = stem.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "post";
  return posix.join(VAULT_NOTES_IMPORTS_BLOG_DIR, `${safe}.md`);
}

export function isUnderNotesImportsBlog(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return (
    p === VAULT_NOTES_IMPORTS_BLOG_DIR || p.startsWith(`${VAULT_NOTES_IMPORTS_BLOG_DIR}/`)
  );
}

export function isUnderNotesImportsObsidian(relativePath: string): boolean {
  const p = normalizeVaultRelativePath(relativePath);
  return (
    p === VAULT_NOTES_IMPORTS_OBSIDIAN_DIR ||
    p.startsWith(`${VAULT_NOTES_IMPORTS_OBSIDIAN_DIR}/`)
  );
}

/**
 * Knowledge mirror path for a linked Obsidian note.
 * `linked-obsidian/MyVault/foo/bar.md` → `notes/imports/obsidian/MyVault/foo/bar.md`
 */
export function notesImportsObsidianPathForLinked(browseRelativePath: string): string {
  const p = normalizeVaultRelativePath(browseRelativePath);
  const prefix = "linked-obsidian/";
  if (!p.startsWith(prefix)) {
    throw new Error(`Not a linked Obsidian browse path: ${p}`);
  }
  const rest = p.slice(prefix.length);
  if (!rest || rest.includes("..")) {
    throw new Error(`Invalid linked Obsidian browse path: ${p}`);
  }
  return posix.join(VAULT_NOTES_IMPORTS_OBSIDIAN_DIR, rest);
}

/**
 * Target path when collecting a loose `.md` into the notes corpus.
 * `research/foo.md` → `notes/research/foo.md`
 * `foo.md` → `notes/foo.md`
 * `imports/bar.md` → `notes/imports/bar.md`
 */
export function collectMarkdownDestinationPath(relativePath: string): string {
  const p = normalizeVaultRelativePath(relativePath);
  if (!isMarkdownCollectCandidate(p)) {
    throw new Error(`Not a collectable markdown path: ${p}`);
  }
  if (p.startsWith("imports/")) {
    return posix.join(VAULT_NOTES_IMPORTS_DIR, p.slice("imports/".length));
  }
  if (p.startsWith(`${VAULT_DOCUMENTS_DIR}/`)) {
    return posix.join(VAULT_NOTES_IMPORTS_DIR, p.slice(`${VAULT_DOCUMENTS_DIR}/`.length));
  }
  return posix.join(VAULT_NOTES_DIR, p);
}

/** Pick an unused relative path when `desired` already exists. */
export function uniqueRelativePath(existing: ReadonlySet<string>, desired: string): string {
  const norm = normalizeVaultRelativePath(desired);
  if (!existing.has(norm)) return norm;
  const dir = dirname(norm);
  const ext = extname(norm);
  const stem = basename(norm, ext);
  for (let i = 2; i < 10_000; i++) {
    const candidate = dir === "." ? `${stem}-${i}${ext}` : `${dir}/${stem}-${i}${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate unique path for ${desired}`);
}

export interface MaterializedMarkdownFrontmatter {
  /** Vault-relative path of the original file. */
  source: string;
  /** Display title (usually stem). */
  title?: string;
  /** ISO timestamp. */
  importedAt?: string;
  /** Extractor id (defaults to {@link VAULT_TEXT_EXTRACTOR_ID}). */
  extractor?: string;
  /**
   * Sensitivity for mesh / contact RAG. Defaults to `private` so materialized
   * GFM under `notes/imports/` is not peer-visible until explicitly shared.
   */
  sensitivity?: "public" | "friends" | "private";
}

/**
 * Prefix GFM with YAML frontmatter pointing at the original document.
 * If `body` already starts with frontmatter, appends `source` / `extractor` keys when missing.
 */
export function wrapMaterializedMarkdown(
  body: string,
  meta: MaterializedMarkdownFrontmatter,
): string {
  const title = meta.title?.trim() || basename(meta.source, extname(meta.source)) || "Imported";
  const importedAt = meta.importedAt ?? new Date().toISOString();
  const extractor = meta.extractor ?? VAULT_TEXT_EXTRACTOR_ID;
  const source = normalizeVaultRelativePath(meta.source);
  const sensitivity = meta.sensitivity ?? "private";

  const trimmed = body.replace(/^\uFEFF/, "");
  if (/^---[ \t]*\r?\n/.test(trimmed)) {
    const afterOpen = trimmed.slice(trimmed.indexOf("\n") + 1);
    const closeMatch = afterOpen.match(/^[ \t]*---[ \t]*\r?\n/m);
    if (closeMatch && closeMatch.index !== undefined) {
      let yaml = afterOpen.slice(0, closeMatch.index);
      const rest = afterOpen.slice(closeMatch.index + closeMatch[0].length);
      if (!/^title\s*:/m.test(yaml)) yaml += `title: ${yamlEscape(title)}\n`;
      if (!/^source\s*:/m.test(yaml)) yaml += `source: ${yamlEscape(source)}\n`;
      if (!/^extractor\s*:/m.test(yaml)) yaml += `extractor: ${yamlEscape(extractor)}\n`;
      if (!/^importedAt\s*:/m.test(yaml)) yaml += `importedAt: ${yamlEscape(importedAt)}\n`;
      if (!/^sensitivity\s*:/m.test(yaml)) yaml += `sensitivity: ${sensitivity}\n`;
      return `---\n${yaml}---\n${rest}`;
    }
  }

  return [
    "---",
    `title: ${yamlEscape(title)}`,
    `source: ${yamlEscape(source)}`,
    `extractor: ${yamlEscape(extractor)}`,
    `importedAt: ${yamlEscape(importedAt)}`,
    `sensitivity: ${sensitivity}`,
    "---",
    "",
    trimmed.replace(/^\r?\n/, ""),
  ].join("\n");
}

function yamlEscape(value: string): string {
  if (/[:#{}[\],&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}
