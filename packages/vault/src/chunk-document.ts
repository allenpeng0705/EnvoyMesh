import type { VaultChunk, VaultDocumentMetadata } from "./index.js";

export const DEFAULT_MAX_CHUNK_CHARS = 800;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 120;

/**
 * Bump when chunk text layout changes (e.g. frontmatter strip, heading splits)
 * so RAG manifests invalidate without requiring a content hash change.
 */
export const VAULT_CHUNK_ALGORITHM_ID = "md-heading-fm-v1";

export interface ChunkDocumentOptions {
  maxChunkChars?: number;
  overlapChars?: number;
}

export function resolveChunkDocumentOptions(
  options?: number | ChunkDocumentOptions,
): Required<ChunkDocumentOptions> {
  if (typeof options === "number") {
    return { maxChunkChars: options, overlapChars: 0 };
  }
  const maxChunkChars = options?.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const requestedOverlap = options?.overlapChars ?? DEFAULT_CHUNK_OVERLAP_CHARS;
  return {
    maxChunkChars,
    overlapChars: Math.min(requestedOverlap, Math.max(0, Math.floor(maxChunkChars / 2))),
  };
}

/**
 * Strip YAML frontmatter so embedding does not treat keys as prose.
 * Only strips a leading `---` … `---` block.
 */
export function stripYamlFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length);
}

export function chunkDocument(
  metadata: VaultDocumentMetadata,
  content: string,
  options?: number | ChunkDocumentOptions,
): VaultChunk[] {
  const { maxChunkChars, overlapChars } = resolveChunkDocumentOptions(options);
  const body = stripYamlFrontmatter(content);
  const sections = splitMarkdownSections(body);
  const chunks: VaultChunk[] = [];

  const pushChunk = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const index = chunks.length;
    chunks.push({
      chunkId: `${metadata.documentId}:chunk:${index}`,
      documentId: metadata.documentId,
      relativePath: metadata.relativePath,
      index,
      text: trimmed,
    });
  };

  for (const section of sections) {
    const heading = section.heading?.trim();
    const sectionText = section.body.replace(/\s+/g, " ").trim();
    if (!sectionText && !heading) continue;

    const prefixed = heading
      ? sectionText
        ? `${heading}\n\n${sectionText}`
        : heading
      : sectionText;

    if (prefixed.length <= maxChunkChars) {
      pushChunk(prefixed);
      continue;
    }

    // Oversized section: fall back to paragraph/sentence packing with overlap.
    let overlapSeed = "";
    const segments = splitIntoSegments(sectionText || prefixed);
    let buffer = heading ? `${heading}\n\n` : "";

    const flushBuffer = () => {
      const trimmed = buffer.trim();
      if (!trimmed) return;
      pushChunk(trimmed);
      overlapSeed = overlapChars > 0 ? takeOverlapSuffix(trimmed, overlapChars) : "";
      buffer = "";
    };

    for (const segment of segments) {
      const candidate = buffer ? `${buffer} ${segment}` : segment;
      if (candidate.length <= maxChunkChars) {
        buffer = candidate;
        continue;
      }
      if (buffer.trim()) flushBuffer();
      let rest = overlapSeed ? `${overlapSeed} ${segment}` : segment;
      while (rest.length > maxChunkChars) {
        const slice = rest.slice(0, maxChunkChars);
        const breakAt = findSoftBreakIndex(slice, maxChunkChars);
        pushChunk(slice.slice(0, breakAt));
        overlapSeed = overlapChars > 0 ? takeOverlapSuffix(slice.slice(0, breakAt), overlapChars) : "";
        rest = rest.slice(breakAt).trim();
        if (overlapSeed && rest) rest = `${overlapSeed} ${rest}`;
      }
      buffer = rest;
    }
    if (buffer.trim()) flushBuffer();
  }

  return chunks;
}

/** Split on ATX headings (`#` … `######`); preserve heading line with each section. */
export function splitMarkdownSections(
  content: string,
): Array<{ heading?: string; body: string }> {
  const text = content.replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  const headingRe = /^(#{1,6})\s+.+$/gm;
  const matches = [...text.matchAll(headingRe)];
  if (matches.length === 0) {
    return [{ body: text }];
  }

  const sections: Array<{ heading?: string; body: string }> = [];
  const firstIdx = matches[0]!.index ?? 0;
  if (firstIdx > 0) {
    const preamble = text.slice(0, firstIdx).trim();
    if (preamble) sections.push({ body: preamble });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? text.length) : text.length;
    const block = text.slice(start, end);
    const nl = block.indexOf("\n");
    const heading = (nl === -1 ? block : block.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    sections.push({ heading, body });
  }

  return sections;
}

function splitIntoSegments(text: string): string[] {
  const paragraphs = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const segments: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= 400) {
      segments.push(paragraph);
      continue;
    }
    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph];
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed) segments.push(trimmed);
    }
  }

  return segments.length > 0 ? segments : [text];
}

function findSoftBreakIndex(slice: string, maxChunkChars: number): number {
  const minBreak = Math.max(1, Math.floor(maxChunkChars * 0.5));
  for (const marker of [". ", "! ", "? ", "; ", ", ", " "]) {
    const idx = slice.lastIndexOf(marker, maxChunkChars - 1);
    if (idx >= minBreak) {
      return idx + marker.trimEnd().length;
    }
  }
  return maxChunkChars;
}

function takeOverlapSuffix(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) return text;
  return text.slice(-overlapChars).trim();
}
