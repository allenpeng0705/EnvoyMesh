/**
 * Phase 45E — persisted inbox rows for inbound `feed.notify`.
 * Small JSON list under the profile directory (atomic write).
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
}

const MAX_INBOX_ITEMS = 200;

function inboxPath(profileDir: string): string {
  return join(profileDir, "feed-notify-inbox.json");
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
    return [];
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

export async function dismissFeedNotifyInboxItem(
  profileDir: string,
  id: string,
): Promise<FeedNotifyInboxItem[]> {
  const existing = await loadFeedNotifyInbox(profileDir);
  const next = existing.filter((row) => row.id !== id);
  if (next.length === existing.length) return existing;
  await writeFeedNotifyInbox(profileDir, next);
  return next;
}
