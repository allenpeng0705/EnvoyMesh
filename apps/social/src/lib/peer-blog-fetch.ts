/**
 * Peer Blog (Chat → Blog): parse index once, page, enrich only the visible page.
 */
import {
  BLOG_PEER_PAGE_SIZE,
  parseBlogIndexMarkdown,
  slicePeerBlogIndexPage,
  type BlogPostSummary,
  type LibraryReadParams,
  type LibraryReadResult,
  type ParsedFeedIndexEntry,
} from "@envoymesh/api";
import {
  enrichWebContentMediaPool,
  type WebContentMediaEnrichment,
} from "./enrich-web-content-media.js";

export function pathFromEnvoyBlogUrl(url: string): string {
  const m = /envoy:\/\/[^/]+\/(.+)$/.exec(url.trim());
  return m?.[1]?.replace(/\/+$/, "") ?? url;
}

export function peerBlogEntriesToSummaries(
  entries: readonly ParsedFeedIndexEntry[],
  peerOwnerId: string,
): BlogPostSummary[] {
  return entries.map((e) => ({
    path: pathFromEnvoyBlogUrl(e.url),
    title: e.title,
    url: e.url,
    publishedAt: e.publishedAt,
    summary: e.summary,
    bodyPreview: e.summary,
    visibility: "bonded" as const,
    publisherOwnerId: peerOwnerId,
  }));
}

export function parsePeerBlogIndex(
  markdown: string,
  peerOwnerId: string,
): BlogPostSummary[] {
  return peerBlogEntriesToSummaries(parseBlogIndexMarkdown(markdown), peerOwnerId);
}

export function takePeerBlogPage(
  catalog: readonly BlogPostSummary[],
  offset: number,
  pageSize: number = BLOG_PEER_PAGE_SIZE,
): { page: BlogPostSummary[]; nextOffset: number; hasMore: boolean } {
  return slicePeerBlogIndexPage(catalog, offset, pageSize);
}

export async function enrichPeerBlogSummaries(
  libraryRead: (params: LibraryReadParams) => Promise<LibraryReadResult>,
  posts: readonly BlogPostSummary[],
): Promise<BlogPostSummary[]> {
  if (posts.length === 0) return [];
  const media = await enrichWebContentMediaPool(
    libraryRead,
    posts.map((p) => p.url),
  );
  return mergePeerBlogMedia(posts, media);
}

export function mergePeerBlogMedia(
  posts: readonly BlogPostSummary[],
  media: ReadonlyMap<string, WebContentMediaEnrichment>,
): BlogPostSummary[] {
  return posts.map((p) => {
    const hit = media.get(p.url);
    if (!hit) return p;
    return {
      ...p,
      ...(hit.bodyPreview ? { bodyPreview: hit.bodyPreview } : {}),
      ...(hit.imageUrls.length ? { imageUrls: hit.imageUrls } : {}),
    };
  });
}
