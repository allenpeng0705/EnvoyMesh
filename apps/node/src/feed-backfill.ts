/**
 * On bond: pull peer `feeds/index.md` via library.read and seed the local
 * peer Feed timeline so Content → Feed is not empty for posts published
 * before the bond (push-only `feed.notify` has no historical catch-up).
 */

import {
  parseFeedIndexMarkdown,
  type LibraryReadParams,
  type LibraryReadResult,
} from "@envoymesh/api";
import { randomUUID } from "node:crypto";
import {
  appendFeedNotifyInboxItem,
  loadFeedNotifyInbox,
  markFeedNotifyUrlsRead,
  type FeedNotifyInboxItem,
} from "./feed-notify-store.js";

/** Cap how many historical posts we seed per bond (index is newest-first). */
export const FEED_BACKFILL_MAX_POSTS = 30;

const FEEDS_INDEX_PATH = "feeds/index.md";

const inFlight = new Set<string>();
/** Per-process: Feed-open backfill already tried for this peer (avoid dial spam). */
const feedOpenAttempted = new Set<string>();

export type FeedBackfillResult =
  | { ok: true; inserted: number; skipped: number; reason?: string }
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
    return { ok: true, inserted: 0, skipped: 0, reason: "in_flight" };
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
        reason: result.status === "ok" ? "empty_body" : result.status,
      };
    }

    const max = Math.max(1, deps.maxPosts ?? FEED_BACKFILL_MAX_POSTS);
    const entries = parseFeedIndexMarkdown(result.body).slice(0, max);
    if (entries.length === 0) {
      return { ok: true, inserted: 0, skipped: 0, reason: "no_entries" };
    }

    const readAt = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;
    const toMarkRead: string[] = [];
    const emitted: FeedNotifyInboxItem[] = [];

    for (const entry of entries) {
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
        summary: entry.summary,
        listingUrl: `envoy://${peerOwnerId}/${FEEDS_INDEX_PATH}`,
        senderPeerId: "backfill",
      };
      const { inserted: didInsert, item: stored } = await appendFeedNotifyInboxItem(
        deps.profileDir,
        item,
      );
      if (!didInsert) {
        skipped += 1;
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

    return { ok: true, inserted, skipped };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    inFlight.delete(peerOwnerId);
  }
}

/**
 * First Feed open after bond: for bonded peers with no local feed timeline
 * rows yet, pull `feeds/index.md` once per process (existing bonds missed
 * historical posts because `feed.notify` is push-only).
 */
export function scheduleFeedBackfillForMissingPeers(deps: {
  profileDir: string;
  bondedOwnerIds: readonly string[];
  libraryRead: (params: LibraryReadParams) => Promise<LibraryReadResult>;
  emit?: (item: FeedNotifyInboxItem) => void;
}): void {
  void (async () => {
    const inbox = await loadFeedNotifyInbox(deps.profileDir);
    const publishersWithFeed = new Set<string>();
    for (const row of inbox) {
      if (row.kind === "feed" || row.url.includes("/feeds/")) {
        publishersWithFeed.add(row.publisherOwnerId);
      }
    }
    for (const raw of deps.bondedOwnerIds) {
      const peerOwnerId = raw.trim();
      if (!peerOwnerId.startsWith("envoy:owner:")) continue;
      if (publishersWithFeed.has(peerOwnerId)) continue;
      if (feedOpenAttempted.has(peerOwnerId)) continue;
      feedOpenAttempted.add(peerOwnerId);
      const result = await backfillBondedPeerFeed({
        profileDir: deps.profileDir,
        peerOwnerId,
        libraryRead: deps.libraryRead,
        emit: deps.emit,
      });
      if (!result.ok) {
        console.warn(`[feed.backfill] open failed for ${peerOwnerId}: ${result.reason}`);
        continue;
      }
      if (result.inserted > 0) {
        console.log(
          `[feed.backfill] open ${peerOwnerId}: inserted=${result.inserted} skipped=${result.skipped}`,
        );
      }
    }
  })().catch((err) => {
    console.warn("[feed.backfill] open schedule failed:", err);
  });
}

/** Test helper — clear in-flight / open-attempt locks. */
export function resetFeedBackfillInFlightForTests(): void {
  inFlight.clear();
  feedOpenAttempted.clear();
}
