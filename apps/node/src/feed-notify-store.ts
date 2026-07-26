/**
 * Phase 45E — persisted inbox rows for inbound `feed.notify`.
 * Small JSON list under the profile directory (atomic write).
 *
 * Rows are the durable peer-Feed timeline source AND the Inbox badge source.
 * Opening Inbox marks rows read (clears badge) without deleting them — otherwise
 * Content → Feed / Explore → Following would lose peer posts until restart
 * (or forever).
 */

import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface FeedNotifyInboxItem {
  id: string;
  receivedAt: string;
  messageId: string;
  publisherOwnerId: string;
  publishedAt: string;
  title: string;
  url: string;
  kind: string;
  visibility: string;
  summary?: string;
  tags?: string[];
  contentHash?: string;
  listingUrl?: string;
  senderPeerId: string;
  /** Set when the owner opens Inbox / dismisses — badge only; Feed still lists. */
  readAt?: string;
}

const MAX_INBOX_ITEMS = 200;

function inboxPath(profileDir: string): string {
  return join(profileDir, "feed-notify-inbox.json");
}

export function isFeedNotifyUnread(item: FeedNotifyInboxItem): boolean {
  return !item.readAt?.trim();
}

export async function loadFeedNotifyInbox(profileDir: string): Promise<FeedNotifyInboxItem[]> {
  try {
    const raw = await readFile(inboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is FeedNotifyInboxItem =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as FeedNotifyInboxItem).id === "string" &&
        typeof (row as FeedNotifyInboxItem).url === "string",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[feed.notify] failed to load inbox:", err);
    throw err;
  }
}

async function writeFeedNotifyInbox(
  profileDir: string,
  items: FeedNotifyInboxItem[],
): Promise<void> {
  const path = inboxPath(profileDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

export async function appendFeedNotifyInboxItem(
  profileDir: string,
  item: FeedNotifyInboxItem,
): Promise<FeedNotifyInboxItem[]> {
  const existing = await loadFeedNotifyInbox(profileDir);
  if (existing.some((row) => row.messageId === item.messageId)) {
    return existing;
  }
  const next = [item, ...existing].slice(0, MAX_INBOX_ITEMS);
  await writeFeedNotifyInbox(profileDir, next);
  return next;
}

/** Mark one row read (Inbox dismiss). Keeps the row for Feed / Following. */
export async function dismissFeedNotifyInboxItem(
  profileDir: string,
  id: string,
): Promise<FeedNotifyInboxItem[]> {
  const existing = await loadFeedNotifyInbox(profileDir);
  const now = new Date().toISOString();
  let changed = false;
  const next = existing.map((row) => {
    if (row.id !== id || row.readAt) return row;
    changed = true;
    return { ...row, readAt: now };
  });
  if (!changed) return existing;
  await writeFeedNotifyInbox(profileDir, next);
  return next;
}

/**
 * Mark every feed.notify row read so the Inbox unread badge drops to zero.
 * Does NOT delete rows — Content → Feed and Explore → Following still list them.
 */
export async function dismissAllFeedNotifyInboxItems(
  profileDir: string,
): Promise<FeedNotifyInboxItem[]> {
  const existing = await loadFeedNotifyInbox(profileDir);
  if (existing.length === 0) return existing;
  const now = new Date().toISOString();
  let changed = false;
  const next = existing.map((row) => {
    if (row.readAt) return row;
    changed = true;
    return { ...row, readAt: now };
  });
  if (!changed) return existing;
  await writeFeedNotifyInbox(profileDir, next);
  return next;
}
