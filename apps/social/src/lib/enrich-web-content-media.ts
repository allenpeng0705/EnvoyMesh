/**
 * Pull Moments/Blog card media from a published markdown body via library.read.
 */
import {
  extractEnvoyMarkdownImageUrls,
  parseEnvoyUrl,
  previewFromWebContentMarkdown,
  resolveEnvoyUrl,
  type LibraryReadParams,
  type LibraryReadResult,
} from "@envoymesh/api";

export type WebContentMediaEnrichment = {
  imageUrls: string[];
  bodyPreview?: string;
};

/** Distinguishes hard failures (retry) from definitive empty bodies (do not spam). */
export type EnrichWebContentMediaResult =
  | ({ outcome: "enriched" } & WebContentMediaEnrichment)
  | { outcome: "empty" }
  | { outcome: "unavailable" };

type LibraryReadFn = (params: LibraryReadParams) => Promise<LibraryReadResult>;

export async function enrichWebContentMediaFromUrl(
  libraryRead: LibraryReadFn,
  url: string,
): Promise<EnrichWebContentMediaResult> {
  try {
    const { targetOwnerId, path } = resolveEnvoyUrl(parseEnvoyUrl(url));
    if (!path || path.endsWith("/index.md") || path.endsWith("/")) {
      return { outcome: "empty" };
    }
    const result = await libraryRead({
      targetOwnerId,
      path,
      timeoutMs: 20_000,
    });
    if (result.status !== "ok" || typeof result.body !== "string") {
      return { outcome: "unavailable" };
    }
    const imageUrls = extractEnvoyMarkdownImageUrls(result.body);
    const bodyPreview = previewFromWebContentMarkdown(result.body) || undefined;
    if (!imageUrls.length && !bodyPreview) return { outcome: "empty" };
    return {
      outcome: "enriched",
      imageUrls,
      ...(bodyPreview ? { bodyPreview } : {}),
    };
  } catch {
    return { outcome: "unavailable" };
  }
}

/** Run enrichments with a small concurrency limit. */
export async function enrichWebContentMediaPool(
  libraryRead: LibraryReadFn,
  urls: readonly string[],
  concurrency = 3,
): Promise<Map<string, WebContentMediaEnrichment>> {
  const out = new Map<string, WebContentMediaEnrichment>();
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) return;
      const enriched = await enrichWebContentMediaFromUrl(libraryRead, url);
      if (enriched.outcome === "enriched") {
        out.set(url, {
          imageUrls: enriched.imageUrls,
          ...(enriched.bodyPreview ? { bodyPreview: enriched.bodyPreview } : {}),
        });
      }
    }
  });
  await Promise.all(workers);
  return out;
}
