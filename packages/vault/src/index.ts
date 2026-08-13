import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, relative, resolve, sep } from "node:path";
import { extractVaultDocumentText } from "./document-text-extract.js";
import {
  chunkDocument,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_MAX_CHUNK_CHARS,
  type ChunkDocumentOptions,
} from "./chunk-document.js";
import {
  isVaultExtractableExtension,
  isVaultTextChunkExtension,
  VAULT_EXTRACTABLE_EXTENSIONS,
  VAULT_TEXT_CHUNK_EXTENSIONS,
  type VaultExtractableExtension,
  type VaultTextChunkExtension,
} from "./vault-formats.js";

export const DEFAULT_SHARED_VAULT_DIR = "shared_vault";

export {
  VAULT_ANYDOC_EXTENSIONS,
  VAULT_EXTRACTABLE_EXTENSIONS,
  VAULT_TEXT_CHUNK_EXTENSIONS,
  VAULT_TEXT_EXTRACTOR_ID,
  isVaultAnydocExtension,
  isVaultExtractableExtension,
  isVaultSearchableExtension,
  isVaultTextChunkExtension,
  type VaultAnydocExtension,
  type VaultExtractableExtension,
  type VaultTextChunkExtension,
} from "./vault-formats.js";

export { extractVaultDocumentText, stripHtmlText, stripRtfText } from "./document-text-extract.js";

export {
  VAULT_NOTES_DIR,
  VAULT_NOTES_IMPORTS_DIR,
  VAULT_NOTES_IMPORTS_BLOG_DIR,
  VAULT_DOCUMENTS_DIR,
  VAULT_MD_COLLECT_EXCLUDE_PREFIXES,
  BLOG_KNOWLEDGE_EXTRACTOR_ID,
  normalizeVaultRelativePath,
  isUnderNotes,
  isUnderNotesImportsBlog,
  isMarkdownCollectCandidate,
  resolveImportDestinationPath,
  notesImportsPathForSource,
  notesImportsBlogPathForWebPost,
  collectMarkdownDestinationPath,
  uniqueRelativePath,
  wrapMaterializedMarkdown,
  type MaterializedMarkdownFrontmatter,
} from "./markdown-corpus.js";

/** @deprecated Use {@link VAULT_TEXT_CHUNK_EXTENSIONS} — kept for callers that relied on this name */
export const SUPPORTED_VAULT_EXTENSIONS = VAULT_TEXT_CHUNK_EXTENSIONS;

/** @deprecated Prefer {@link VaultTextChunkExtension} */
export type SupportedVaultExtension = VaultTextChunkExtension;

export interface VaultDocumentMetadata {
  documentId: string;
  relativePath: string;
  /** Lower-case extension incl. dot (e.g. `.pdf`) or empty string when none */
  extension: string;
  title: string;
  byteLength: number;
  contentHash: string;
  updatedAt: string;
  /** Set when a file is listed but skipped for search indexing (e.g. too large). */
  indexSkippedReason?: string;
}

export interface VaultChunk {
  chunkId: string;
  documentId: string;
  relativePath: string;
  index: number;
  text: string;
}

export interface VaultIndex {
  rootDir: string;
  documents: VaultDocumentMetadata[];
  chunks: VaultChunk[];
}

export interface VaultContentManifestDocument {
  documentId: string;
  relativePath: string;
  title: string;
  byteLength: number;
  contentHash: string;
  updatedAt: string;
}

export interface VaultContentManifest {
  version: "0.1";
  generatedAt: string;
  rootDir: string;
  documents: VaultContentManifestDocument[];
}

export async function writeVaultContentManifestFile(
  rootDir: string,
  outputPath: string,
): Promise<VaultContentManifest> {
  const index = await buildVaultIndex({ rootDir: resolve(rootDir) });
  const manifest: VaultContentManifest = {
    version: "0.1",
    generatedAt: new Date().toISOString(),
    rootDir: index.rootDir,
    documents: index.documents.map((document) => ({
      documentId: document.documentId,
      relativePath: document.relativePath,
      title: document.title,
      byteLength: document.byteLength,
      contentHash: document.contentHash,
      updatedAt: document.updatedAt,
    })),
  };
  const out = resolve(outputPath);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return manifest;
}

export {
  chunkDocument,
  DEFAULT_CHUNK_OVERLAP_CHARS,
  DEFAULT_MAX_CHUNK_CHARS,
  type ChunkDocumentOptions,
} from "./chunk-document.js";

export interface BuildVaultIndexOptions {
  rootDir: string;
  maxChunkChars?: number;
  chunkOverlapChars?: number;
  /** Skip text extraction and chunking when file size exceeds this limit. */
  maxFileBytes?: number;
}

export interface VaultSearchResult {
  chunk: VaultChunk;
  document: VaultDocumentMetadata;
  score: number;
  matches: string[];
}

export interface VaultSearchOptions {
  limit?: number;
}

export type VaultAccessOperation = "index" | "search" | "read_metadata";
export type VaultAccessOutcome = "allow" | "deny";

export interface VaultAccessAuditEvent {
  version: "0.1";
  eventId: string;
  operation: VaultAccessOperation;
  outcome: VaultAccessOutcome;
  createdAt: string;
  query?: string;
  requesterPeerId?: string;
  requesterOwnerId?: string;
  reason?: string;
  resultCount: number;
  documentIds: string[];
  relativePaths: string[];
}

export interface CreateVaultAccessAuditEventInput {
  operation: VaultAccessOperation;
  outcome: VaultAccessOutcome;
  query?: string;
  requesterPeerId?: string;
  requesterOwnerId?: string;
  reason?: string;
  results?: VaultSearchResult[];
  createdAt?: string;
  eventId?: string;
}

export interface AuditedVaultSearchResult {
  results: VaultSearchResult[];
  auditEvent: VaultAccessAuditEvent;
}

export interface AuditedVaultSearchOptions extends VaultSearchOptions {
  requesterPeerId?: string;
  requesterOwnerId?: string;
  createdAt?: string;
  eventId?: string;
}

const defaultMaxChunkChars = DEFAULT_MAX_CHUNK_CHARS;

function chunkOptionsFromBuild(options: BuildVaultIndexOptions): ChunkDocumentOptions {
  return {
    maxChunkChars: options.maxChunkChars ?? defaultMaxChunkChars,
    overlapChars: options.chunkOverlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS,
  };
}

function metadataOnlyDocument(input: {
  documentId: string;
  relativePath: string;
  extension: string;
  byteLength: number;
  contentHash: string;
  updatedAt: string;
  indexSkippedReason?: string;
}): VaultDocumentMetadata {
  return {
    documentId: input.documentId,
    relativePath: input.relativePath,
    extension: input.extension,
    title: titleFromRelativePath(input.relativePath),
    byteLength: input.byteLength,
    contentHash: input.contentHash,
    updatedAt: input.updatedAt,
    indexSkippedReason: input.indexSkippedReason,
  };
}

export async function buildVaultIndex(options: BuildVaultIndexOptions): Promise<VaultIndex> {
  const rootDir = resolve(options.rootDir);
  const filePaths = await listSupportedVaultFiles(rootDir);
  const documents: VaultDocumentMetadata[] = [];
  const chunks: VaultChunk[] = [];
  const chunking = chunkOptionsFromBuild(options);

  for (const filePath of filePaths) {
    assertPathInsideVault(rootDir, filePath);

    const fileStat = await stat(filePath);
    const relativePath = toVaultRelativePath(rootDir, filePath);
    const extension = extname(filePath).toLowerCase();

    if (options.maxFileBytes != null && fileStat.size > options.maxFileBytes) {
      const contentHashBin = hashContent(
        `${relativePath}\nSKIPPED\n${fileStat.size}\n${fileStat.mtime.toISOString()}`,
      );
      documents.push(
        metadataOnlyDocument({
          documentId: createBinaryIntegrityDocumentId(relativePath, contentHashBin),
          relativePath,
          extension,
          byteLength: fileStat.size,
          contentHash: contentHashBin,
          updatedAt: fileStat.mtime.toISOString(),
          indexSkippedReason: `file exceeds max size (${options.maxFileBytes} bytes)`,
        }),
      );
      continue;
    }

    const raw = await readFile(filePath);

    if (isVaultTextChunkExtension(extension)) {
      const contentString = raw.toString("utf8");
      const contentHashLegacy = hashContent(contentString);
      const documentId = createLegacyUtf8ChunkDocumentId(relativePath, contentString);
      const metadata: VaultDocumentMetadata = {
        documentId,
        relativePath,
        extension,
        title: titleFromRelativePath(relativePath),
        byteLength: raw.byteLength,
        contentHash: contentHashLegacy,
        updatedAt: fileStat.mtime.toISOString(),
      };
      documents.push(metadata);
      chunks.push(...chunkDocument(metadata, contentString, chunking));
    } else if (isVaultExtractableExtension(extension)) {
      const contentHashBin = hashBufferSha256Base64Url(raw);
      const documentId = createBinaryIntegrityDocumentId(relativePath, contentHashBin);
      const metadata: VaultDocumentMetadata = {
        documentId,
        relativePath,
        extension,
        title: titleFromRelativePath(relativePath),
        byteLength: raw.byteLength,
        contentHash: contentHashBin,
        updatedAt: fileStat.mtime.toISOString(),
      };
      documents.push(metadata);
      const extracted = await extractVaultDocumentText(extension, raw);
      if (extracted) {
        chunks.push(...chunkDocument(metadata, extracted, chunking));
      }
    } else {
      const contentHashBin = hashBufferSha256Base64Url(raw);
      const documentId = createBinaryIntegrityDocumentId(relativePath, contentHashBin);
      const metadata: VaultDocumentMetadata = {
        documentId,
        relativePath,
        extension,
        title: titleFromRelativePath(relativePath),
        byteLength: raw.byteLength,
        contentHash: contentHashBin,
        updatedAt: fileStat.mtime.toISOString(),
      };
      documents.push(metadata);
    }
  }

  return {
    rootDir,
    documents,
    chunks,
  };
}

export async function listSupportedVaultFiles(rootDir: string): Promise<string[]> {
  const absoluteRoot = resolve(rootDir);
  try {
    const st = await stat(absoluteRoot);
    if (!st.isDirectory()) {
      return [];
    }
  } catch (error) {
    const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const entries = await walkVaultDirectory(absoluteRoot);

  return entries
    .filter((filePath) => shouldIncludeVaultFileInIndex(filePath))
    .sort((left, right) => left.localeCompare(right));
}

/** Regular files indexed for library/metadata; skips dotfiles (e.g. `.DS_Store`). */
export function shouldIncludeVaultFileInIndex(filePath: string): boolean {
  return !basename(filePath).startsWith(".");
}

/**
 * Extensions we UTF-decode directly for full-text vault search (.txt / .md / .json / .csv).
 * @deprecated This used to imply "eligible for indexing" — indexing now includes binary files via {@link shouldIncludeVaultFileInIndex}.
 */
export function isSupportedVaultFile(filePath: string): boolean {
  return isVaultTextChunkExtension(extname(filePath));
}

export function assertPathInsideVault(rootDir: string, candidatePath: string): void {
  const absoluteRoot = resolve(rootDir);
  const absoluteCandidate = resolve(candidatePath);
  const relativePath = relative(absoluteRoot, absoluteCandidate);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    relativePath.includes(`..${sep}`) ||
    absoluteCandidate === absoluteRoot
  ) {
    throw new Error("Path is outside the shared vault root");
  }
}

export function searchVault(
  index: VaultIndex,
  query: string,
  options: VaultSearchOptions = {},
): VaultSearchResult[] {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return [];
  }

  const documentsById = new Map(index.documents.map((document) => [document.documentId, document]));
  const results = index.chunks
    .map((chunk) => scoreChunk(chunk, terms))
    .filter((result) => result.score > 0)
    .map((result) => {
      const document = documentsById.get(result.chunk.documentId);
      if (!document) {
        throw new Error(`Missing document metadata for ${result.chunk.documentId}`);
      }

      return {
        ...result,
        document,
      };
    })
    .sort((left, right) => right.score - left.score || left.chunk.relativePath.localeCompare(right.chunk.relativePath));

  return results.slice(0, options.limit ?? 10);
}

export function searchVaultWithAudit(
  index: VaultIndex,
  query: string,
  options: AuditedVaultSearchOptions = {},
): AuditedVaultSearchResult {
  const results = searchVault(index, query, options);

  return {
    results,
    auditEvent: createVaultAccessAuditEvent({
      operation: "search",
      outcome: "allow",
      query,
      requesterPeerId: options.requesterPeerId,
      requesterOwnerId: options.requesterOwnerId,
      results,
      createdAt: options.createdAt,
      eventId: options.eventId,
    }),
  };
}

export function createVaultAccessAuditEvent(
  input: CreateVaultAccessAuditEventInput,
): VaultAccessAuditEvent {
  const results = input.results ?? [];

  return {
    version: "0.1",
    eventId: input.eventId ?? `vault_audit_${randomUUID()}`,
    operation: input.operation,
    outcome: input.outcome,
    createdAt: input.createdAt ?? new Date().toISOString(),
    query: input.query,
    requesterPeerId: input.requesterPeerId,
    requesterOwnerId: input.requesterOwnerId,
    reason: input.reason,
    resultCount: results.length,
    documentIds: [...new Set(results.map((result) => result.document.documentId))],
    relativePaths: [...new Set(results.map((result) => result.document.relativePath))],
  };
}

export function createDeniedVaultAccessAuditEvent(
  input: Omit<CreateVaultAccessAuditEventInput, "outcome" | "results">,
): VaultAccessAuditEvent {
  return createVaultAccessAuditEvent({
    ...input,
    outcome: "deny",
    results: [],
  });
}

async function walkVaultDirectory(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = resolve(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkVaultDirectory(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function scoreChunk(chunk: VaultChunk, terms: string[]): Omit<VaultSearchResult, "document"> {
  const lowerText = chunk.text.toLowerCase();
  const matches = terms.filter((term) => lowerText.includes(term));
  const uniqueMatches = [...new Set(matches)];

  return {
    chunk,
    score: uniqueMatches.length,
    matches: uniqueMatches,
  };
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/u)
    .map((term) => term.trim())
    .filter(Boolean);
}

function toVaultRelativePath(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath).split(sep).join("/");
}

function hashBufferSha256Base64Url(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("base64url");
}

function createLegacyUtf8ChunkDocumentId(relativePath: string, utf8Content: string): string {
  return `doc_${hashContent(`${relativePath}\n${utf8Content}`).slice(0, 24)}`;
}

function createBinaryIntegrityDocumentId(relativePath: string, fileSha256Base64Url: string): string {
  return `doc_${hashContent(`${relativePath}\nBINARY\n${fileSha256Base64Url}`).slice(0, 24)}`;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("base64url");
}

function titleFromRelativePath(relativePath: string): string {
  return basename(relativePath, extname(relativePath));
}
