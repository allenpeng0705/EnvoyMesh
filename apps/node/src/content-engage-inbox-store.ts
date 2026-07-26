/**
 * Unread inbox for inbound stars/comments on the owner's Feed/Blog posts.
 * Powers Content / Feed / Blog nav badges (cleared when those surfaces open).
 *
 * Bounded: hard cap + age TTL. Empty inbox deletes the file.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ContentEngageSurface = "feed" | "blog";
export type ContentEngageAction = "star" | "comment";

export interface ContentEngageNotification {
  id: string;
  receivedAt: string;
  messageId: string;
  url: string;
  surface: ContentEngageSurface;
  action: ContentEngageAction;
  actorOwnerId: string;
  text?: string;
  senderPeerId: string;
}

/** Keep the badge queue small and easy to reason about. */
export const MAX_INBOX_ITEMS = 64;
/** Drop unread rows older than this (user never opened Content). */
export const MAX_INBOX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function inboxPath(profileDir: string): string {
  return join(profileDir, "content-engage-inbox.json");
}

/** Infer Feed vs Blog from an envoy:// content URL. */
export function surfaceForContentUrl(url: string): ContentEngageSurface | undefined {
  const u = url.trim();
  if (u.includes("/feeds/")) return "feed";
  if (u.includes("/blog/")) return "blog";
  return undefined;
}

function isValidItem(row: unknown): row is ContentEngageNotification {
  return (
    Boolean(row) &&
    typeof row === "object" &&
    typeof (row as ContentEngageNotification).id === "string" &&
    typeof (row as ContentEngageNotification).url === "string" &&
    typeof (row as ContentEngageNotification).receivedAt === "string" &&
    ((row as ContentEngageNotification).surface === "feed" ||
      (row as ContentEngageNotification).surface === "blog")
  );
}

/** Drop expired rows, then keep newest ≤ MAX_INBOX_ITEMS. */
export function pruneContentEngageInboxItems(
  items: ContentEngageNotification[],
  nowMs: number = Date.now(),
): ContentEngageNotification[] {
  const cutoff = nowMs - MAX_INBOX_AGE_MS;
  const fresh = items.filter((row) => {
    const t = Date.parse(row.receivedAt);
    if (!Number.isFinite(t)) return false;
    return t >= cutoff;
  });
  return fresh.slice(0, MAX_INBOX_ITEMS);
}

export async function loadContentEngageInbox(
  profileDir: string,
): Promise<ContentEngageNotification[]> {
  try {
    const raw = await readFile(inboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return pruneContentEngageInboxItems(parsed.filter(isValidItem));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[content.engage] failed to load inbox:", err);
    return [];
  }
}

async function writeContentEngageInbox(
  profileDir: string,
  items: ContentEngageNotification[],
): Promise<void> {
  const path = inboxPath(profileDir);
  const pruned = pruneContentEngageInboxItems(items);
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

export async function appendContentEngageInboxItem(
  profileDir: string,
  item: Omit<ContentEngageNotification, "id" | "receivedAt"> & {
    id?: string;
    receivedAt?: string;
  },
): Promise<ContentEngageNotification | undefined> {
  const existing = await loadContentEngageInbox(profileDir);
  if (existing.some((row) => row.messageId === item.messageId)) {
    return undefined;
  }
  const nextItem: ContentEngageNotification = {
    id: item.id?.trim() || randomUUID(),
    receivedAt: item.receivedAt ?? new Date().toISOString(),
    messageId: item.messageId,
    url: item.url,
    surface: item.surface,
    action: item.action,
    actorOwnerId: item.actorOwnerId,
    text: item.text,
    senderPeerId: item.senderPeerId,
  };
  const next = pruneContentEngageInboxItems([nextItem, ...existing]);
  await writeContentEngageInbox(profileDir, next);
  return nextItem;
}

/**
 * Clear unread engagement badges for a surface, or all Content badges.
 * Used when the user opens Content / Feed / Blog.
 */
export async function dismissContentEngageInbox(
  profileDir: string,
  surface: ContentEngageSurface | "all" = "all",
): Promise<ContentEngageNotification[]> {
  const existing = await loadContentEngageInbox(profileDir);
  if (existing.length === 0) return existing;
  const next =
    surface === "all" ? [] : existing.filter((row) => row.surface !== surface);
  if (next.length === existing.length) return existing;
  await writeContentEngageInbox(profileDir, next);
  return next;
}
