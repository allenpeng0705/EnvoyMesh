/**
 * Publisher-side outbox for undelivered `feed.notify` (peer offline at publish).
 * Flushed later on bond warm / node online — same wire path, no pull protocol.
 *
 * Bounded: hard cap + age TTL. Empty outbox deletes the file.
 * All RMW mutations share a per-profile serial queue to avoid lost updates.
 */

import { readFile, rename, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedNotifyPublishMeta } from "./feed-notify-outbound.js";

export interface FeedNotifyOutboxItem {
  recipientOwnerId: string;
  url: string;
  meta: FeedNotifyPublishMeta;
  enqueuedAt: string;
}

/** Keep the on-disk queue small and easy to reason about. */
export const MAX_OUTBOX_ITEMS = 64;
/** Drop rows older than this even if never delivered. */
export const MAX_OUTBOX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite<T>(profileDir: string, op: () => Promise<T>): Promise<T> {
  const key = outboxPath(profileDir);
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(op, op);
  writeQueues.set(
    key,
    next.then(
      () => {},
      () => {},
    ),
  );
  return next;
}

function outboxPath(profileDir: string): string {
  return join(profileDir, "feed-notify-outbox.json");
}

function isValidItem(row: unknown): row is FeedNotifyOutboxItem {
  return (
    Boolean(row) &&
    typeof row === "object" &&
    typeof (row as FeedNotifyOutboxItem).recipientOwnerId === "string" &&
    typeof (row as FeedNotifyOutboxItem).url === "string" &&
    Boolean((row as FeedNotifyOutboxItem).meta) &&
    typeof (row as FeedNotifyOutboxItem).meta === "object" &&
    typeof (row as FeedNotifyOutboxItem).enqueuedAt === "string"
  );
}

/** Drop expired rows, then keep newest ≤ MAX_OUTBOX_ITEMS. */
export function pruneFeedNotifyOutboxItems(
  items: FeedNotifyOutboxItem[],
  nowMs: number = Date.now(),
): FeedNotifyOutboxItem[] {
  const cutoff = nowMs - MAX_OUTBOX_AGE_MS;
  const fresh = items.filter((row) => {
    const t = Date.parse(row.enqueuedAt);
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });
  // Newest first (enqueue order).
  return fresh.slice(0, MAX_OUTBOX_ITEMS);
}

export async function loadFeedNotifyOutbox(profileDir: string): Promise<FeedNotifyOutboxItem[]> {
  try {
    const raw = await readFile(outboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return pruneFeedNotifyOutboxItems(parsed.filter(isValidItem));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[feed.notify] failed to load outbox:", err);
    throw err;
  }
}

async function writeFeedNotifyOutbox(
  profileDir: string,
  items: FeedNotifyOutboxItem[],
): Promise<void> {
  const path = outboxPath(profileDir);
  const pruned = pruneFeedNotifyOutboxItems(items);
  if (pruned.length === 0) {
    await unlink(path).catch((err) => {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  // Compact JSON — outbox is machine-only and should stay small.
  await writeFile(tmp, `${JSON.stringify(pruned)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

/** Upsert by recipientOwnerId + url; newest first; prune + cap. */
export async function enqueueFeedNotifyOutboxItem(
  profileDir: string,
  item: Omit<FeedNotifyOutboxItem, "enqueuedAt"> & { enqueuedAt?: string },
): Promise<FeedNotifyOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedNotifyOutbox(profileDir);
    const recipientOwnerId = item.recipientOwnerId.trim();
    const url = item.url.trim();
    if (!recipientOwnerId || !url) return existing;

    const enqueuedAt = item.enqueuedAt ?? new Date().toISOString();
    const filtered = existing.filter(
      (row) => !(row.recipientOwnerId === recipientOwnerId && row.url === url),
    );
    const next = pruneFeedNotifyOutboxItems([
      { recipientOwnerId, url, meta: item.meta, enqueuedAt },
      ...filtered,
    ]);
    await writeFeedNotifyOutbox(profileDir, next);
    return next;
  });
}

export async function removeFeedNotifyOutboxItem(
  profileDir: string,
  recipientOwnerId: string,
  url: string,
): Promise<FeedNotifyOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedNotifyOutbox(profileDir);
    const next = existing.filter(
      (row) => !(row.recipientOwnerId === recipientOwnerId && row.url === url),
    );
    if (next.length === existing.length) {
      // Still rewrite if prune would shrink (stale rows on disk).
      const pruned = pruneFeedNotifyOutboxItems(existing);
      if (pruned.length === existing.length) return existing;
      await writeFeedNotifyOutbox(profileDir, pruned);
      return pruned;
    }
    await writeFeedNotifyOutbox(profileDir, next);
    return next;
  });
}

export async function listFeedNotifyOutboxForRecipient(
  profileDir: string,
  recipientOwnerId: string,
): Promise<FeedNotifyOutboxItem[]> {
  const ownerId = recipientOwnerId.trim();
  if (!ownerId) return [];
  const all = await loadFeedNotifyOutbox(profileDir);
  return all.filter((row) => row.recipientOwnerId === ownerId);
}

/** Drop expired rows and rewrite (or delete) the file — call from flush paths. */
export async function compactFeedNotifyOutbox(profileDir: string): Promise<FeedNotifyOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedNotifyOutbox(profileDir);
    await writeFeedNotifyOutbox(profileDir, existing);
    return existing;
  });
}
