/**
 * Publisher-side outbox for undelivered `feed.notify` (peer offline at publish).
 * Flushed later on bond warm / node online — same wire path, no pull protocol.
 *
 * All RMW mutations share a per-profile serial queue to avoid lost updates.
 */

import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedNotifyPublishMeta } from "./feed-notify-outbound.js";

export interface FeedNotifyOutboxItem {
  recipientOwnerId: string;
  url: string;
  meta: FeedNotifyPublishMeta;
  enqueuedAt: string;
}

const MAX_OUTBOX_ITEMS = 100;

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

export async function loadFeedNotifyOutbox(profileDir: string): Promise<FeedNotifyOutboxItem[]> {
  try {
    const raw = await readFile(outboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is FeedNotifyOutboxItem =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as FeedNotifyOutboxItem).recipientOwnerId === "string" &&
        typeof (row as FeedNotifyOutboxItem).url === "string" &&
        Boolean((row as FeedNotifyOutboxItem).meta) &&
        typeof (row as FeedNotifyOutboxItem).meta === "object",
    );
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
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

/** Upsert by recipientOwnerId + url; newest first; cap MAX_OUTBOX_ITEMS. */
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
    const next: FeedNotifyOutboxItem[] = [
      { recipientOwnerId, url, meta: item.meta, enqueuedAt },
      ...filtered,
    ].slice(0, MAX_OUTBOX_ITEMS);
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
    if (next.length === existing.length) return existing;
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

export { MAX_OUTBOX_ITEMS };
