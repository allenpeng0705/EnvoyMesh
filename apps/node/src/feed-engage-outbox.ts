/**
 * Outbox for undelivered `feed.engage` (like / comment) when the post author
 * is unreachable. Persisted under the profile dir; flushed on bond warm / online.
 *
 * Bounded: hard cap + age TTL. Empty outbox deletes the file.
 */

import { readFile, rename, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FeedEngagePayload } from "@envoymesh/protocol";

export type FeedEngageOutboxAction = Extract<
  FeedEngagePayload["action"],
  "star" | "unstar" | "comment" | "uncomment"
>;

export interface FeedEngageOutboxItem {
  targetOwnerId: string;
  url: string;
  action: FeedEngageOutboxAction;
  actorOwnerId: string;
  text?: string;
  commentId?: string;
  enqueuedAt: string;
}

/** Keep the on-disk queue small and easy to reason about. */
export const MAX_OUTBOX_ITEMS = 64;
/** Drop rows older than this even if never delivered. */
export const MAX_OUTBOX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const writeQueues = new Map<string, Promise<unknown>>();

function outboxPath(profileDir: string): string {
  return join(profileDir, "feed-engage-outbox.json");
}

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

function isValidItem(row: unknown): row is FeedEngageOutboxItem {
  if (!row || typeof row !== "object") return false;
  const r = row as FeedEngageOutboxItem;
  return (
    typeof r.targetOwnerId === "string" &&
    typeof r.url === "string" &&
    typeof r.actorOwnerId === "string" &&
    typeof r.enqueuedAt === "string" &&
    (r.action === "star" ||
      r.action === "unstar" ||
      r.action === "comment" ||
      r.action === "uncomment")
  );
}

/** Drop expired rows, then keep newest ≤ MAX_OUTBOX_ITEMS. */
export function pruneFeedEngageOutboxItems(
  items: FeedEngageOutboxItem[],
  nowMs: number = Date.now(),
): FeedEngageOutboxItem[] {
  const cutoff = nowMs - MAX_OUTBOX_AGE_MS;
  const fresh = items.filter((row) => {
    const t = Date.parse(row.enqueuedAt);
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });
  return fresh.slice(0, MAX_OUTBOX_ITEMS);
}

export async function loadFeedEngageOutbox(profileDir: string): Promise<FeedEngageOutboxItem[]> {
  try {
    const raw = await readFile(outboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return pruneFeedEngageOutboxItems(parsed.filter(isValidItem));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[feed.engage] failed to load outbox:", err);
    throw err;
  }
}

async function writeOutbox(profileDir: string, items: FeedEngageOutboxItem[]): Promise<void> {
  const path = outboxPath(profileDir);
  const pruned = pruneFeedEngageOutboxItems(items);
  if (pruned.length === 0) {
    await unlink(path).catch((err) => {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(pruned)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}

/**
 * Enqueue an engage action. Star/unstar for the same url coalesce to the latest.
 * A pending comment is dropped if an uncomment for the same commentId arrives.
 */
export async function enqueueFeedEngageOutboxItem(
  profileDir: string,
  item: Omit<FeedEngageOutboxItem, "enqueuedAt"> & { enqueuedAt?: string },
): Promise<FeedEngageOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedEngageOutbox(profileDir);
    const targetOwnerId = item.targetOwnerId.trim();
    const url = item.url.trim();
    const actorOwnerId = item.actorOwnerId.trim();
    if (!targetOwnerId || !url || !actorOwnerId) return existing;

    const enqueuedAt = item.enqueuedAt ?? new Date().toISOString();
    let filtered = existing;

    if (item.action === "star" || item.action === "unstar") {
      filtered = existing.filter(
        (row) =>
          !(
            row.targetOwnerId === targetOwnerId &&
            row.url === url &&
            row.actorOwnerId === actorOwnerId &&
            (row.action === "star" || row.action === "unstar")
          ),
      );
    } else if (item.action === "uncomment" && item.commentId?.trim()) {
      const commentId = item.commentId.trim();
      const hadPendingComment = existing.some(
        (row) =>
          row.action === "comment" &&
          row.commentId === commentId &&
          row.targetOwnerId === targetOwnerId &&
          row.url === url,
      );
      filtered = existing.filter(
        (row) =>
          !(
            row.targetOwnerId === targetOwnerId &&
            row.url === url &&
            row.commentId === commentId &&
            (row.action === "comment" || row.action === "uncomment")
          ),
      );
      if (hadPendingComment) {
        const next = pruneFeedEngageOutboxItems(filtered);
        await writeOutbox(profileDir, next);
        return next;
      }
    } else if (item.action === "comment" && item.commentId?.trim()) {
      const commentId = item.commentId.trim();
      filtered = existing.filter(
        (row) =>
          !(
            row.targetOwnerId === targetOwnerId &&
            row.url === url &&
            row.commentId === commentId &&
            (row.action === "comment" || row.action === "uncomment")
          ),
      );
    }

    const next = pruneFeedEngageOutboxItems([
      {
        targetOwnerId,
        url,
        action: item.action,
        actorOwnerId,
        text: item.text,
        commentId: item.commentId?.trim() || undefined,
        enqueuedAt,
      },
      ...filtered,
    ]);
    await writeOutbox(profileDir, next);
    return next;
  });
}

export async function removeFeedEngageOutboxItem(
  profileDir: string,
  item: Pick<
    FeedEngageOutboxItem,
    "targetOwnerId" | "url" | "action" | "commentId" | "actorOwnerId" | "enqueuedAt"
  >,
): Promise<FeedEngageOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedEngageOutbox(profileDir);
    const next = existing.filter((row) => {
      if (row.enqueuedAt === item.enqueuedAt && row.action === item.action && row.url === item.url) {
        return false;
      }
      return true;
    });
    if (next.length === existing.length) {
      const pruned = pruneFeedEngageOutboxItems(existing);
      if (pruned.length === existing.length) return existing;
      await writeOutbox(profileDir, pruned);
      return pruned;
    }
    await writeOutbox(profileDir, next);
    return next;
  });
}

export async function listFeedEngageOutboxForRecipient(
  profileDir: string,
  targetOwnerId: string,
): Promise<FeedEngageOutboxItem[]> {
  const ownerId = targetOwnerId.trim();
  if (!ownerId) return [];
  const all = await loadFeedEngageOutbox(profileDir);
  return all
    .filter((row) => row.targetOwnerId === ownerId)
    .slice()
    .sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
}

/** Drop expired rows and rewrite (or delete) the file — call from flush paths. */
export async function compactFeedEngageOutbox(profileDir: string): Promise<FeedEngageOutboxItem[]> {
  return enqueueWrite(profileDir, async () => {
    const existing = await loadFeedEngageOutbox(profileDir);
    await writeOutbox(profileDir, existing);
    return existing;
  });
}
