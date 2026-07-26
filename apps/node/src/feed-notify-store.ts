/**
 * Durable peer Feed timeline (inbound `feed.notify`).
 *
 * - Append-only JSONL for history (no 200-cap wipe)
 * - Side JSON map for Inbox readAt (badge) without rewriting the timeline
 * - One-time migrate from legacy `feed-notify-inbox.json`
 * - All timeline + read-map mutations share per-profile serial queues
 */

import { appendFile, readFile, rename, writeFile, mkdir, access } from "node:fs/promises";
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
  /** Feed Moments image URLs (notify metadata; bytes via library.read). */
  imageUrls?: string[];
  /** Set when the owner opens Inbox / dismisses — badge only; Feed still lists. */
  readAt?: string;
}

export type AppendFeedNotifyResult = {
  items: FeedNotifyInboxItem[];
  /** False when messageId or url already existed — caller must not re-emit unread. */
  inserted: boolean;
  /** Canonical stored row (existing on dedupe, or the newly written item). */
  item: FeedNotifyInboxItem;
};

/** Soft ceiling so a pathological peer flood cannot unbounded-grow disk/RAM. */
export const MAX_PEER_TIMELINE_ITEMS = 5_000;
/** Feed / Inbox list surfaces — newest slice (full history via listFeedTimeline). */
export const FEED_NOTIFY_LIST_LIMIT = 200;

const LEGACY_INBOX = "feed-notify-inbox.json";
const TIMELINE_JSONL = "feed-peer-timeline.jsonl";
const READ_MAP = "feed-peer-read.json";

type ReadMap = Record<string, string>;

function legacyInboxPath(profileDir: string): string {
  return join(profileDir, LEGACY_INBOX);
}

function timelinePath(profileDir: string): string {
  return join(profileDir, TIMELINE_JSONL);
}

function readMapPath(profileDir: string): string {
  return join(profileDir, READ_MAP);
}

export function isFeedNotifyUnread(item: FeedNotifyInboxItem): boolean {
  return !item.readAt?.trim();
}

function isValidItem(row: unknown): row is FeedNotifyInboxItem {
  return (
    Boolean(row) &&
    typeof row === "object" &&
    typeof (row as FeedNotifyInboxItem).id === "string" &&
    typeof (row as FeedNotifyInboxItem).url === "string" &&
    typeof (row as FeedNotifyInboxItem).messageId === "string"
  );
}

function stripReadAt(item: FeedNotifyInboxItem): Omit<FeedNotifyInboxItem, "readAt"> {
  const { readAt: _r, ...rest } = item;
  return rest;
}

/** Per-profile serial queue so compact/append/read-map RMW cannot interleave. */
const timelineQueues = new Map<string, Promise<unknown>>();
const readMapQueues = new Map<string, Promise<unknown>>();

function enqueueOp<T>(
  queues: Map<string, Promise<unknown>>,
  key: string,
  op: () => Promise<T>,
): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(op, op);
  queues.set(
    key,
    next.then(
      () => {},
      () => {},
    ),
  );
  return next;
}

function enqueueTimeline<T>(profileDir: string, op: () => Promise<T>): Promise<T> {
  return enqueueOp(timelineQueues, timelinePath(profileDir), op);
}

function enqueueReadMap<T>(profileDir: string, op: () => Promise<T>): Promise<T> {
  return enqueueOp(readMapQueues, readMapPath(profileDir), op);
}

async function loadReadMap(profileDir: string): Promise<ReadMap> {
  try {
    const raw = await readFile(readMapPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: ReadMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    console.warn("[feed.notify] failed to load read map:", err);
    throw err;
  }
}

async function writeReadMap(profileDir: string, map: ReadMap): Promise<void> {
  const path = readMapPath(profileDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(map, null, 2), { mode: 0o600 });
  await rename(tmp, path);
}

async function parseJsonl(raw: string): Promise<FeedNotifyInboxItem[]> {
  const byUrl = new Map<string, FeedNotifyInboxItem>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as unknown;
      if (!isValidItem(row)) continue;
      const url = row.url.trim();
      if (!url) continue;
      // Later lines win (re-append after compact keeps newest metadata).
      byUrl.set(url, { ...stripReadAt(row), url });
    } catch {
      /* skip corrupt line */
    }
  }
  return [...byUrl.values()];
}

async function loadLegacyInbox(profileDir: string): Promise<FeedNotifyInboxItem[]> {
  try {
    const raw = await readFile(legacyInboxPath(profileDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[feed.notify] failed to load legacy inbox:", err);
    return [];
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure JSONL (+ read map) exist; import legacy inbox.json once.
 * Idempotent — safe on every load.
 */
async function ensureMigrated(profileDir: string): Promise<void> {
  const jsonlExists = await fileExists(timelinePath(profileDir));
  if (jsonlExists) return;

  const legacy = await loadLegacyInbox(profileDir);
  if (legacy.length === 0) return;

  await mkdir(profileDir, { recursive: true });
  const readMap: ReadMap = {};
  const lines: string[] = [];
  // Legacy was newest-first; write oldest-first so append order matches time.
  for (const item of [...legacy].reverse()) {
    const url = item.url.trim();
    if (!url) continue;
    if (item.readAt?.trim()) readMap[url] = item.readAt.trim();
    lines.push(JSON.stringify(stripReadAt({ ...item, url })));
  }
  const path = timelinePath(profileDir);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, lines.length ? `${lines.join("\n")}\n` : "", { mode: 0o600 });
  await rename(tmp, path);
  if (Object.keys(readMap).length > 0) {
    await writeReadMap(profileDir, readMap);
  }
}

async function loadTimelineRaw(profileDir: string): Promise<FeedNotifyInboxItem[]> {
  try {
    const raw = await readFile(timelinePath(profileDir), "utf8");
    return await parseJsonl(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    console.warn("[feed.notify] failed to load timeline:", err);
    throw err;
  }
}

function applyReadMap(items: FeedNotifyInboxItem[], readMap: ReadMap): FeedNotifyInboxItem[] {
  return items.map((item) => {
    const readAt = readMap[item.url.trim()];
    return readAt ? { ...item, readAt } : { ...item, readAt: undefined };
  });
}

function sortNewestFirst(items: FeedNotifyInboxItem[]): FeedNotifyInboxItem[] {
  return items.slice().sort((a, b) => {
    const ta = a.publishedAt || a.receivedAt;
    const tb = b.publishedAt || b.receivedAt;
    const cmp = tb.localeCompare(ta);
    if (cmp !== 0) return cmp;
    return b.url.localeCompare(a.url);
  });
}

async function loadInboxUnlocked(profileDir: string): Promise<FeedNotifyInboxItem[]> {
  await ensureMigrated(profileDir);
  const [items, readMap] = await Promise.all([
    loadTimelineRaw(profileDir),
    loadReadMap(profileDir),
  ]);
  return sortNewestFirst(applyReadMap(items, readMap));
}

/** Full peer history (newest first), with readAt applied. */
export async function loadFeedNotifyInbox(profileDir: string): Promise<FeedNotifyInboxItem[]> {
  // Serialize with timeline writers so a concurrent compact cannot race this read.
  return enqueueTimeline(profileDir, () => loadInboxUnlocked(profileDir));
}

/**
 * Newest slice for Inbox / Feed UI (not the full history).
 * Own Feed should use `listFeedTimeline` for paging.
 */
export async function listFeedNotifyRecent(
  profileDir: string,
  limit: number = FEED_NOTIFY_LIST_LIMIT,
): Promise<FeedNotifyInboxItem[]> {
  const all = await loadFeedNotifyInbox(profileDir);
  const n = Math.max(1, Math.min(limit, MAX_PEER_TIMELINE_ITEMS));
  return all.slice(0, n);
}

async function compactTimelineIfNeeded(
  profileDir: string,
  items: FeedNotifyInboxItem[],
): Promise<FeedNotifyInboxItem[]> {
  if (items.length <= MAX_PEER_TIMELINE_ITEMS) return items;
  const kept = sortNewestFirst(items).slice(0, MAX_PEER_TIMELINE_ITEMS);
  const path = timelinePath(profileDir);
  const tmp = `${path}.tmp`;
  // Write oldest-first for natural append chronology.
  const lines = [...kept].reverse().map((row) => JSON.stringify(stripReadAt(row)));
  await writeFile(tmp, lines.length ? `${lines.join("\n")}\n` : "", { mode: 0o600 });
  await rename(tmp, path);
  return kept;
}

export async function appendFeedNotifyInboxItem(
  profileDir: string,
  item: FeedNotifyInboxItem,
): Promise<AppendFeedNotifyResult> {
  return enqueueTimeline(profileDir, async () => {
    await ensureMigrated(profileDir);
    const url = item.url.trim();
    if (!url) {
      const items = await loadInboxUnlocked(profileDir);
      return { items, inserted: false, item };
    }

    const existing = await loadTimelineRaw(profileDir);
    const dup = existing.find(
      (row) => row.messageId === item.messageId || row.url.trim() === url,
    );
    if (dup) {
      const items = await loadInboxUnlocked(profileDir);
      const canonical =
        items.find((row) => row.messageId === dup.messageId || row.url.trim() === url) ?? {
          ...dup,
          url,
        };
      return { items, inserted: false, item: canonical };
    }

    const toWrite = stripReadAt({ ...item, url });
    const path = timelinePath(profileDir);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(toWrite)}\n`, { mode: 0o600 });

    const next = [...existing, toWrite];
    await compactTimelineIfNeeded(profileDir, next);
    const items = await loadInboxUnlocked(profileDir);
    const stored =
      items.find((row) => row.messageId === item.messageId || row.url.trim() === url) ?? {
        ...toWrite,
      };
    return { items, inserted: true, item: stored };
  });
}

/** Mark one row read (Inbox dismiss). Keeps the row for Feed. */
export async function dismissFeedNotifyInboxItem(
  profileDir: string,
  id: string,
): Promise<FeedNotifyInboxItem[]> {
  return enqueueReadMap(profileDir, async () => {
    const items = await loadFeedNotifyInbox(profileDir);
    const target = items.find((row) => row.id === id);
    if (!target || target.readAt) return items;
    const map = await loadReadMap(profileDir);
    map[target.url.trim()] = new Date().toISOString();
    await writeReadMap(profileDir, map);
    return loadFeedNotifyInbox(profileDir);
  });
}

/**
 * Mark every feed.notify row read so the Inbox unread badge drops to zero.
 * Does NOT delete rows — Content → Feed still lists them.
 */
export async function dismissAllFeedNotifyInboxItems(
  profileDir: string,
): Promise<FeedNotifyInboxItem[]> {
  return enqueueReadMap(profileDir, async () => {
    const items = await loadFeedNotifyInbox(profileDir);
    if (items.length === 0) return items;
    const map = await loadReadMap(profileDir);
    const now = new Date().toISOString();
    let changed = false;
    for (const row of items) {
      const url = row.url.trim();
      if (!url || map[url]) continue;
      map[url] = now;
      changed = true;
    }
    if (!changed) return items;
    await writeReadMap(profileDir, map);
    return loadFeedNotifyInbox(profileDir);
  });
}
