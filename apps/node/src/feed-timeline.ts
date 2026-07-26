/**
 * Own Feed (Friend Circle) — merged own posts + peer timeline, paged newest-first.
 */

import type { BondRecord } from "@envoymesh/api";
import { listFeedPosts, type FeedPostSummary } from "./web-content-author.js";
import { loadFeedNotifyInbox, type FeedNotifyInboxItem } from "./feed-notify-store.js";

export const FEED_TIMELINE_DEFAULT_LIMIT = 20;
export const FEED_TIMELINE_MAX_LIMIT = 50;

export type FeedTimelineSource = "own" | "peer";

export interface FeedTimelineItem {
  source: FeedTimelineSource;
  /** Stable UI key: `own:{path}` or `peer:{id}`. */
  key: string;
  publisherOwnerId: string;
  title: string;
  body?: string;
  url: string;
  /** Own post path under web/ — required for delete. */
  path?: string;
  publishedAt: string;
  imageUrls: string[];
  visibility?: string;
}

export interface ListFeedTimelineParams {
  /**
   * Exclusive cursor: return items strictly older than this row
   * (publishedAt desc, then url desc).
   */
  before?: string;
  beforeUrl?: string;
  /** Page size (default 20, max 50). */
  limit?: number;
}

export interface ListFeedTimelineResult {
  items: FeedTimelineItem[];
  hasMore: boolean;
  /** Pass as `before` / `beforeUrl` for the next page. */
  nextBefore?: string;
  nextBeforeUrl?: string;
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return FEED_TIMELINE_DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), FEED_TIMELINE_MAX_LIMIT));
}

function isEligibleBond(level: BondRecord["level"]): boolean {
  return level === "direct" || level === "referred";
}

function ownToItem(p: FeedPostSummary): FeedTimelineItem {
  return {
    source: "own",
    key: `own:${p.path}`,
    publisherOwnerId: p.publisherOwnerId,
    title: p.title,
    body: p.bodyPreview ?? p.summary,
    url: p.url,
    path: p.path,
    publishedAt: p.publishedAt,
    imageUrls: p.imageUrls ?? [],
    visibility: p.visibility,
  };
}

function peerToItem(n: FeedNotifyInboxItem): FeedTimelineItem | null {
  if (n.kind !== "feed" && n.kind !== "note" && n.kind !== "photo" && n.kind !== "article") {
    return null;
  }
  if (n.kind !== "feed" && !n.url.includes("/feeds/")) return null;
  return {
    source: "peer",
    key: `peer:${n.id}`,
    publisherOwnerId: n.publisherOwnerId,
    title: n.title,
    body: n.summary,
    url: n.url,
    publishedAt: n.publishedAt || n.receivedAt,
    imageUrls: n.imageUrls?.length ? [...n.imageUrls] : [],
    visibility: n.visibility,
  };
}

/** True if `item` is strictly older than the cursor (newer-first order). */
export function isOlderThanCursor(
  item: Pick<FeedTimelineItem, "publishedAt" | "url">,
  before: string,
  beforeUrl?: string,
): boolean {
  if (item.publishedAt < before) return true;
  if (item.publishedAt > before) return false;
  if (!beforeUrl) return false;
  return item.url < beforeUrl;
}

export async function listFeedTimeline(input: {
  profileDir: string;
  ownerId: string;
  bonds: readonly BondRecord[];
  params?: ListFeedTimelineParams;
}): Promise<ListFeedTimelineResult> {
  const limit = clampLimit(input.params?.limit);
  const before = input.params?.before?.trim() || undefined;
  const beforeUrl = input.params?.beforeUrl?.trim() || undefined;
  const selfOwnerId = input.ownerId.trim();

  const bondedIds = new Set(
    input.bonds.filter((b) => isEligibleBond(b.level)).map((b) => b.peerOwnerId.trim()),
  );

  const [ownPosts, peerRows] = await Promise.all([
    listFeedPosts(input.profileDir, selfOwnerId),
    loadFeedNotifyInbox(input.profileDir),
  ]);

  const merged: FeedTimelineItem[] = [];
  for (const p of ownPosts) {
    merged.push(ownToItem(p));
  }
  for (const n of peerRows) {
    if (selfOwnerId && n.publisherOwnerId === selfOwnerId) continue;
    if (!bondedIds.has(n.publisherOwnerId)) continue;
    const item = peerToItem(n);
    if (item) merged.push(item);
  }

  merged.sort((a, b) => {
    const cmp = b.publishedAt.localeCompare(a.publishedAt);
    if (cmp !== 0) return cmp;
    return b.url.localeCompare(a.url);
  });

  let start = 0;
  if (before) {
    start = merged.findIndex((item) => isOlderThanCursor(item, before, beforeUrl));
    if (start < 0) {
      return { items: [], hasMore: false };
    }
  }

  const page = merged.slice(start, start + limit);
  const hasMore = start + limit < merged.length;
  const oldest = page[page.length - 1];
  return {
    items: page,
    hasMore,
    nextBefore: hasMore && oldest ? oldest.publishedAt : undefined,
    nextBeforeUrl: hasMore && oldest ? oldest.url : undefined,
  };
}
