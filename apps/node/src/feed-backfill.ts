/**
 * On bond: pull peer `feeds/index.md` via library.read and seed the local
 * peer Feed timeline so Content → Feed is not empty for posts published
 * before the bond (push-only `feed.notify` has no historical catch-up).
 *
 * Also pulls each post body to recover Moments `imageUrls` (index rows are
 * title/summary only).
 */

import {
  extractEnvoyMarkdownImageUrls,
  parseEnvoyUrl,
  parseFeedIndexMarkdown,
  previewFromWebContentMarkdown,
  resolveEnvoyUrl,
  type LibraryReadParams,
  type LibraryReadResult,
  type ParsedFeedIndexEntry,
} from "@envoymesh/api";
import { randomUUID } from "node:crypto";
import {
  appendFeedNotifyInboxItem,
  loadFeedNotifyInbox,
  markFeedNotifyUrlsRead,
  patchFeedNotifyInboxItem,
  type FeedNotifyInboxItem,
} from "./feed-notify-store.js";

/** Cap how many historical posts we seed per bond (index is newest-first). */
export const FEED_BACKFILL_MAX_POSTS = 30;

/** Parallel library.read of post bodies during backfill. */
export const FEED_BACKFILL_ENRICH_CONCURRENCY = 3;

const FEEDS_INDEX_PATH = "feeds/index.md";

const inFlight = new Set<string>();
/** Per-process: Feed-open backfill already completed successfully for this peer. */
const feedOpenAttempted = new Set<string>();
/** Per-process: image-url enrich pass completed successfully for this peer. */
const feedImageEnrichAttempted = new Set<string>();

export type FeedBackfillResult =
  | { ok: true; inserted: number; skipped: number; patched: number; reason?: string }
  | { ok: false; reason: string };

export type FeedBackfillDeps = {
  profileDir: string;
  peerOwnerId: string;
  libraryRead: (params: LibraryReadParams) => Promise<LibraryReadResult>;
  /** Called for each newly inserted row (with readAt set). */
  emit?: (item: FeedNotifyInboxItem) => void;
  /** Override max posts (tests). */
  maxPosts?: number;
};

/**
 * Soft index failures that should not permanently skip retry this process.
 * (Hard `ok: false` always retries.)
 */
export function isFeedBackfillTerminalSuccess(result: FeedBackfillResult): boolean {
  if (!result.ok) return false;
  const reason = result.reason;
  if (reason == null) return true;
  if (reason === "in_flight") return false;
  if (
    reason === "too_large" ||
    reason === "not_found" ||
    reason === "forbidden" ||
    reason === "unauthorized" ||
    reason === "error" ||
    reason === "timeout"
  ) {
    return false;
  }
  // no_entries / empty_body / unknown soft outcomes: don't keep hammering.
  return true;
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function enrichFromPostBody(
  libraryRead: FeedBackfillDeps["libraryRead"],
  peerOwnerId: string,
  postUrl: string,
): Promise<{ imageUrls?: string[]; summary?: string }> {
  try {
    const { path } = resolveEnvoyUrl(parseEnvoyUrl(postUrl));
    const post = await libraryRead({
      targetOwnerId: peerOwnerId,
      path,
      timeoutMs: 20_000,
    });
    if (post.status !== "ok" || typeof post.body !== "string") return {};
    const imageUrls = extractEnvoyMarkdownImageUrls(post.body);
    const preview = previewFromWebContentMarkdown(post.body);
    return {
      ...(imageUrls.length ? { imageUrls } : {}),
      ...(preview ? { summary: preview } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Best-effort seed of peer Feed posts into `feed-peer-timeline.jsonl`.
 * Marks seeded rows read so Inbox badge does not spike.
 */
export async function backfillBondedPeerFeed(
  deps: FeedBackfillDeps,
): Promise<FeedBackfillResult> {
  const peerOwnerId = deps.peerOwnerId.trim();
  if (!peerOwnerId.startsWith("envoy:owner:")) {
    return { ok: false, reason: "invalid peerOwnerId" };
  }
  if (inFlight.has(peerOwnerId)) {
    return { ok: true, inserted: 0, skipped: 0, patched: 0, reason: "in_flight" };
  }
  inFlight.add(peerOwnerId);
  try {
    const result = await deps.libraryRead({
      targetOwnerId: peerOwnerId,
      path: FEEDS_INDEX_PATH,
      timeoutMs: 45_000,
    });
    if (result.status !== "ok" || typeof result.body !== "string") {
      return {
        ok: true,
        inserted: 0,
        skipped: 0,
        patched: 0,
        reason: result.status === "ok" ? "empty_body" : result.status,
      };
    }

    const max = Math.max(1, deps.maxPosts ?? FEED_BACKFILL_MAX_POSTS);
    const entries = parseFeedIndexMarkdown(result.body).slice(0, max);
    if (entries.length === 0) {
      return { ok: true, inserted: 0, skipped: 0, patched: 0, reason: "no_entries" };
    }

    const enrichments = await mapPool(
      entries,
      FEED_BACKFILL_ENRICH_CONCURRENCY,
      async (entry: ParsedFeedIndexEntry) =>
        enrichFromPostBody(deps.libraryRead, peerOwnerId, entry.url),
    );

    const readAt = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    let patched = 0;
    const toMarkRead: string[] = [];
    const emitted: FeedNotifyInboxItem[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const enriched = enrichments[i] ?? {};
      const messageId = `backfill:${entry.url}`;
      const item: FeedNotifyInboxItem = {
        id: randomUUID(),
        receivedAt: readAt,
        messageId,
        publisherOwnerId: peerOwnerId,
        publishedAt: entry.publishedAt,
        title: entry.title,
        url: entry.url,
        kind: "feed",
        visibility: "bonded",
        summary: enriched.summary ?? entry.summary,
        listingUrl: `envoy://${peerOwnerId}/${FEEDS_INDEX_PATH}`,
        senderPeerId: "backfill",
        ...(enriched.imageUrls?.length ? { imageUrls: enriched.imageUrls } : {}),
      };
      const { inserted: didInsert, item: stored } = await appendFeedNotifyInboxItem(
        deps.profileDir,
        item,
      );
      if (!didInsert) {
        skipped += 1;
        // Older backfills omitted images — patch when we have them now.
        if (
          enriched.imageUrls?.length &&
          !(stored.imageUrls && stored.imageUrls.length > 0)
        ) {
          const ok = await patchFeedNotifyInboxItem(deps.profileDir, stored.url, {
            imageUrls: enriched.imageUrls,
            ...(enriched.summary ? { summary: enriched.summary } : {}),
          });
          if (ok) patched += 1;
        }
        continue;
      }
      inserted += 1;
      toMarkRead.push(stored.url);
      emitted.push({ ...stored, readAt });
    }

    if (toMarkRead.length > 0) {
      await markFeedNotifyUrlsRead(deps.profileDir, toMarkRead, readAt);
    }
    for (const row of emitted) {
      deps.emit?.(row);
    }

    return { ok: true, inserted, skipped, patched };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    inFlight.delete(peerOwnerId);
  }
}

/** Reset in-flight + feed-open gates (tests). */
export function resetFeedBackfillInFlightForTests(): void {
  inFlight.clear();
  feedOpenAttempted.clear();
  feedImageEnrichAttempted.clear();
}

/**
 * For peers already bonded but missing from the local peer timeline, schedule
 * backfill (e.g. first Content → Feed open). Deduped per process per peer
 * after a *terminal* success — soft failures like too_large remain retryable.
 */
export function scheduleFeedBackfillForMissingPeers(
  deps: {
    profileDir: string;
    bondedOwnerIds: readonly string[];
    libraryRead: (params: LibraryReadParams) => Promise<LibraryReadResult>;
    emit?: (item: FeedNotifyInboxItem) => void;
  },
): void {
  void (async () => {
    let inbox: FeedNotifyInboxItem[] = [];
    try {
      inbox = await loadFeedNotifyInbox(deps.profileDir);
    } catch {
      return;
    }
    const haveFeed = new Set(
      inbox
        .filter((row) => row.url.includes("/feeds/") || row.kind === "feed")
        .map((row) => row.publisherOwnerId),
    );
    const needImages = new Set(
      inbox
        .filter(
          (row) =>
            (row.url.includes("/feeds/") || row.kind === "feed") &&
            !(row.imageUrls && row.imageUrls.length > 0),
        )
        .map((row) => row.publisherOwnerId),
    );
    for (const raw of deps.bondedOwnerIds) {
      const peerOwnerId = raw.trim();
      if (!peerOwnerId.startsWith("envoy:owner:")) continue;
      const missingPeer = !haveFeed.has(peerOwnerId);
      const enrichImages = needImages.has(peerOwnerId);
      if (!missingPeer && !enrichImages) continue;
      if (missingPeer && feedOpenAttempted.has(peerOwnerId)) continue;
      if (!missingPeer && feedImageEnrichAttempted.has(peerOwnerId)) continue;
      if (inFlight.has(peerOwnerId)) continue;

      void backfillBondedPeerFeed({
        profileDir: deps.profileDir,
        peerOwnerId,
        libraryRead: deps.libraryRead,
        emit: deps.emit,
      }).then((result) => {
        if (!isFeedBackfillTerminalSuccess(result)) return;
        if (missingPeer) feedOpenAttempted.add(peerOwnerId);
        feedImageEnrichAttempted.add(peerOwnerId);
      });
    }
  })();
}
