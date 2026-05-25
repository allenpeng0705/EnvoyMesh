import type { VaultChunk, VaultDocumentMetadata } from "./index.js";

export const DEFAULT_MAX_CHUNK_CHARS = 800;
export const DEFAULT_CHUNK_OVERLAP_CHARS = 120;

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

export function chunkDocument(
  metadata: VaultDocumentMetadata,
  content: string,
  options?: number | ChunkDocumentOptions,
): VaultChunk[] {
  const { maxChunkChars, overlapChars } = resolveChunkDocumentOptions(options);
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const segments = splitIntoSegments(normalized);
  if (segments.length === 0) {
    return [];
  }

  const chunks: VaultChunk[] = [];
  let buffer = "";
  let overlapSeed = "";

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
    overlapSeed = overlapChars > 0 ? takeOverlapSuffix(trimmed, overlapChars) : "";
  };

  for (const segment of segments) {
    const candidate = buffer ? `${buffer} ${segment}` : segment;
    if (candidate.length <= maxChunkChars) {
      buffer = candidate;
      continue;
    }

    if (buffer) {
      pushChunk(buffer);
      buffer = overlapSeed ? `${overlapSeed} ${segment}` : segment;
      while (buffer.length > maxChunkChars) {
        const slice = buffer.slice(0, maxChunkChars);
        const breakAt = findSoftBreakIndex(slice, maxChunkChars);
        pushChunk(slice.slice(0, breakAt));
        buffer = overlapSeed ? `${overlapSeed} ${buffer.slice(breakAt).trim()}` : buffer.slice(breakAt).trim();
      }
      continue;
    }

    let rest = segment;
    while (rest.length > maxChunkChars) {
      const slice = rest.slice(0, maxChunkChars);
      const breakAt = findSoftBreakIndex(slice, maxChunkChars);
      pushChunk(slice.slice(0, breakAt));
      rest = overlapSeed ? `${overlapSeed} ${rest.slice(breakAt).trim()}` : rest.slice(breakAt).trim();
    }
    buffer = rest;
  }

  if (buffer.trim()) {
    pushChunk(buffer);
  }

  return chunks;
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
  return Math.max(1, Math.min(maxChunkChars, slice.length));
}

function takeOverlapSuffix(text: string, overlapChars: number): string {
  if (text.length <= overlapChars) {
    return text;
  }
  const raw = text.slice(-overlapChars);
  const space = raw.indexOf(" ");
  return space >= 0 ? raw.slice(space + 1) : raw;
}
