/**
 * Authoritative (and local-mirror) engagement for Feed/Blog posts.
 * One JSON file per content URL under `<profileDir>/engagement/`.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_CONTENT_COMMENT_CHARS = 280;
export const MAX_CONTENT_COMMENTS_PER_POST = 100;

export interface ContentEngagementComment {
  id: string;
  authorOwnerId: string;
  text: string;
  createdAt: string;
}

export interface ContentEngagementRecord {
  url: string;
  stars: string[];
  comments: ContentEngagementComment[];
  updatedAt: string;
}

export interface ContentEngagementSummary {
  url: string;
  starCount: number;
  starredByMe: boolean;
  /** Owner IDs who starred, oldest-first (WeChat Moments-style name list). */
  starOwnerIds: string[];
  commentCount: number;
  comments: ContentEngagementComment[];
}

function engagementDir(profileDir: string): string {
  return join(profileDir, "engagement");
}

export function engagementKeyForUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex").slice(0, 32);
}

function engagementPath(profileDir: string, url: string): string {
  return join(engagementDir(profileDir), `${engagementKeyForUrl(url)}.json`);
}

function emptyRecord(url: string): ContentEngagementRecord {
  return {
    url: url.trim(),
    stars: [],
    comments: [],
    updatedAt: new Date().toISOString(),
  };
}

export function summarizeEngagement(
  record: ContentEngagementRecord,
  viewerOwnerId: string,
): ContentEngagementSummary {
  const me = viewerOwnerId.trim();
  return {
    url: record.url,
    starCount: record.stars.length,
    starredByMe: Boolean(me) && record.stars.includes(me),
    starOwnerIds: [...record.stars],
    commentCount: record.comments.length,
    comments: [...record.comments],
  };
}

export async function loadContentEngagement(
  profileDir: string,
  url: string,
): Promise<ContentEngagementRecord> {
  const trimmed = url.trim();
  if (!trimmed) return emptyRecord("");
  try {
    const raw = await readFile(engagementPath(profileDir, trimmed), "utf8");
    const parsed = JSON.parse(raw) as ContentEngagementRecord;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.stars)) {
      return emptyRecord(trimmed);
    }
    return {
      url: typeof parsed.url === "string" && parsed.url.trim() ? parsed.url.trim() : trimmed,
      stars: parsed.stars.filter((s): s is string => typeof s === "string" && s.length > 0),
      comments: Array.isArray(parsed.comments)
        ? parsed.comments.filter(
            (c): c is ContentEngagementComment =>
              !!c &&
              typeof c.id === "string" &&
              typeof c.authorOwnerId === "string" &&
              typeof c.text === "string" &&
              typeof c.createdAt === "string",
          )
        : [],
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return emptyRecord(trimmed);
    throw err;
  }
}

async function saveContentEngagement(
  profileDir: string,
  record: ContentEngagementRecord,
): Promise<void> {
  const dir = engagementDir(profileDir);
  await mkdir(dir, { recursive: true });
  const path = engagementPath(profileDir, record.url);
  const tmp = `${path}.${process.pid}.tmp`;
  const body = JSON.stringify(record, null, 2);
  await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, path);
}

export async function toggleContentStarInStore(
  profileDir: string,
  url: string,
  actorOwnerId: string,
): Promise<ContentEngagementRecord> {
  const actor = actorOwnerId.trim();
  if (!actor) throw new Error("toggleContentStar: actorOwnerId required");
  const record = await loadContentEngagement(profileDir, url);
  const idx = record.stars.indexOf(actor);
  if (idx >= 0) record.stars.splice(idx, 1);
  else record.stars.push(actor);
  record.updatedAt = new Date().toISOString();
  await saveContentEngagement(profileDir, record);
  return record;
}

export async function addContentCommentInStore(
  profileDir: string,
  url: string,
  actorOwnerId: string,
  text: string,
  commentId?: string,
): Promise<ContentEngagementRecord> {
  const actor = actorOwnerId.trim();
  const trimmed = text.trim();
  const id = commentId?.trim() || randomUUID();
  if (!actor) throw new Error("addContentComment: actorOwnerId required");
  if (!trimmed) throw new Error("addContentComment: text required");
  if (trimmed.length > MAX_CONTENT_COMMENT_CHARS) {
    throw new Error(`addContentComment: text exceeds ${MAX_CONTENT_COMMENT_CHARS} characters`);
  }
  const record = await loadContentEngagement(profileDir, url);
  const existing = record.comments.find((c) => c.id === id);
  if (existing) {
    // Idempotent retry (same client commentId).
    return record;
  }
  if (record.comments.length >= MAX_CONTENT_COMMENTS_PER_POST) {
    throw new Error(`addContentComment: at most ${MAX_CONTENT_COMMENTS_PER_POST} comments`);
  }
  record.comments.push({
    id,
    authorOwnerId: actor,
    text: trimmed,
    createdAt: new Date().toISOString(),
  });
  record.updatedAt = new Date().toISOString();
  await saveContentEngagement(profileDir, record);
  return record;
}

/**
 * Remove a comment.
 * Allowed only for:
 * - the comment author (their own comment), or
 * - the content author (Feed/Blog post owner — any comment under that post).
 */
export async function removeContentCommentInStore(
  profileDir: string,
  url: string,
  actorOwnerId: string,
  commentId: string,
  contentOwnerId?: string,
): Promise<ContentEngagementRecord> {
  const actor = actorOwnerId.trim();
  const id = commentId.trim();
  const postOwner = contentOwnerId?.trim() || "";
  if (!actor) throw new Error("removeContentComment: actorOwnerId required");
  if (!id) throw new Error("removeContentComment: commentId required");
  const record = await loadContentEngagement(profileDir, url);
  const idx = record.comments.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("removeContentComment: comment not found");
  const comment = record.comments[idx]!;
  const isCommentAuthor = comment.authorOwnerId === actor;
  const isPostAuthor = Boolean(postOwner) && postOwner === actor;
  if (!isCommentAuthor && !isPostAuthor) {
    throw new Error("removeContentComment: only the comment author or post author may remove");
  }
  record.comments.splice(idx, 1);
  record.updatedAt = new Date().toISOString();
  await saveContentEngagement(profileDir, record);
  return record;
}

/** Replace local record with an inbound snapshot (authoritative from post author). */
export async function replaceContentEngagement(
  profileDir: string,
  record: ContentEngagementRecord,
): Promise<void> {
  const next: ContentEngagementRecord = {
    url: record.url.trim(),
    stars: [...new Set(record.stars.filter(Boolean))],
    comments: record.comments.slice(0, MAX_CONTENT_COMMENTS_PER_POST),
    updatedAt: record.updatedAt || new Date().toISOString(),
  };
  await saveContentEngagement(profileDir, next);
}
