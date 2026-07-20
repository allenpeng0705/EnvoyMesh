/**
 * Phase 45D — Web content authoring helpers.
 *
 * Writes files under `<profileDir>/web/`, upserts `web-content.json`, and
 * regenerates Blog / PhotoWall listings.
 *
 * Design: docs/web-content-browsing-design.md §4.2.3, §4.8, §9.2.
 */

import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  createWebContentStore,
  normalizeWebPath,
  type WebContentEntry,
  type WebContentKind,
  type WebContentVisibility,
} from "./web-content-store.js";

export type PublishWebContentTemplate =
  | "blog-post"
  | "note"
  | "profile"
  | "photo"
  | "file";

export interface PublishWebContentParams {
  template: PublishWebContentTemplate;
  title: string;
  /** Markdown body for text templates (H1 title is prepended). */
  body?: string;
  visibility: WebContentVisibility;
  contactIds?: string[];
  tags?: string[];
  /** Owner ID used to build absolute `envoy://` links in listings. */
  ownerId: string;
  /** Base64 file bytes for photo / file templates. */
  contentBase64?: string;
  /** MIME type for photo / file (required when contentBase64 is set). */
  mimeType?: string;
  /** Original filename hint (extension + display). */
  fileName?: string;
  /** PhotoWall gallery folder (default `wall`). */
  gallery?: string;
}

export interface PublishWebContentResult {
  path: string;
  urlPath: string;
  contentHash: string;
  byteLength: number;
  title: string;
  visibility: WebContentVisibility;
  publishedAt: string;
  url: string;
  listingUrl?: string;
}

/** Soft cap for in-app uploads (local write; mesh reads still chunk via 45B). */
export const MAX_AUTHOR_UPLOAD_BYTES = 2 * 1024 * 1024;

const VISIBILITY_RANK: Record<WebContentVisibility, number> = {
  private: 0,
  contacts: 1,
  bonded: 2,
  public: 3,
};

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/json": "json",
};

/** Slugify a title for URL paths (`My First Post` → `my-first-post`). */
export function slugifyTitle(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "post";
}

function sha256Bytes(buf: Buffer): { hash: string; byteLength: number } {
  return {
    hash: createHash("sha256").update(buf).digest("hex"),
    byteLength: buf.byteLength,
  };
}

function sha256Utf8(text: string): { hash: string; byteLength: number } {
  return sha256Bytes(Buffer.from(text, "utf8"));
}

async function writeWebFile(webDir: string, relativePath: string, contents: string | Buffer): Promise<void> {
  const abs = join(webDir, relativePath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, contents, { mode: 0o600 });
}

function mostOpenVisibility(
  entries: WebContentEntry[],
  fallback: WebContentVisibility,
): WebContentVisibility {
  let best: WebContentVisibility = fallback;
  for (const e of entries) {
    if (VISIBILITY_RANK[e.visibility] > VISIBILITY_RANK[best]) {
      best = e.visibility;
    }
  }
  return best;
}

function summaryFromBody(body: string, max = 160): string {
  const plain = body
    .replace(/^#+\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1)}…`;
}

function extensionFor(params: {
  mimeType?: string;
  fileName?: string;
  fallback: string;
}): string {
  if (params.fileName) {
    const ext = extname(params.fileName).replace(/^\./, "").toLowerCase();
    if (ext && /^[a-z0-9]{1,8}$/.test(ext)) return ext;
  }
  if (params.mimeType) {
    const mapped = MIME_EXT[params.mimeType.toLowerCase()];
    if (mapped) return mapped;
    const subtype = params.mimeType.split("/")[1]?.split("+")[0]?.toLowerCase();
    if (subtype && /^[a-z0-9]{1,8}$/.test(subtype)) return subtype;
  }
  return params.fallback;
}

function decodeBase64Payload(b64: string): Buffer {
  const trimmed = b64.trim();
  if (!trimmed) throw new Error("publishWebContentEntry: contentBase64 is empty");
  const buf = Buffer.from(trimmed, "base64");
  if (buf.byteLength === 0) {
    throw new Error("publishWebContentEntry: contentBase64 decoded to empty");
  }
  if (buf.byteLength > MAX_AUTHOR_UPLOAD_BYTES) {
    throw new Error(
      `publishWebContentEntry: upload exceeds ${MAX_AUTHOR_UPLOAD_BYTES} bytes`,
    );
  }
  return buf;
}

function buildBlogIndexMarkdown(ownerId: string, posts: WebContentEntry[]): string {
  const sorted = [...posts].sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  const lines = ["# Blog", ""];
  if (sorted.length === 0) {
    lines.push("_No posts yet._", "");
    return lines.join("\n");
  }
  for (const post of sorted) {
    const href = `envoy://${ownerId}/${post.path}`;
    const date = (post.publishedAt ?? post.updatedAt).slice(0, 10);
    const summary = post.summary?.trim() ? ` — ${post.summary.trim()}` : "";
    lines.push(`- [${post.title}](${href}) (${date})${summary}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Markdown PhotoWall grid — clickable thumbnails via envoy:// image links. */
function buildPhotoWallMarkdown(
  ownerId: string,
  gallery: string,
  photos: WebContentEntry[],
): string {
  const sorted = [...photos].sort((a, b) => {
    const ta = a.publishedAt ?? a.updatedAt;
    const tb = b.publishedAt ?? b.updatedAt;
    return tb.localeCompare(ta);
  });
  const lines = [`# PhotoWall — ${gallery}`, ""];
  if (sorted.length === 0) {
    lines.push("_No photos yet._", "");
    return lines.join("\n");
  }
  for (const photo of sorted) {
    const href = `envoy://${ownerId}/${photo.path}`;
    lines.push(`[![${photo.title}](${href})](${href})`);
    lines.push("");
    lines.push(`**[${photo.title}](${href})**`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildPhotosRootMarkdown(
  ownerId: string,
  galleries: { name: string; count: number; visibility: WebContentVisibility }[],
): string {
  const lines = ["# Photos", ""];
  if (galleries.length === 0) {
    lines.push("_No galleries yet._", "");
    return lines.join("\n");
  }
  for (const g of galleries) {
    const href = `envoy://${ownerId}/photos/${g.name}/`;
    lines.push(`- [${g.name}](${href}) (${g.count} photo${g.count === 1 ? "" : "s"})`);
  }
  lines.push("");
  return lines.join("\n");
}

async function uniquePath(
  webDir: string,
  store: ReturnType<typeof createWebContentStore>,
  dir: string,
  baseSlug: string,
  ext: string,
): Promise<string> {
  let slug = baseSlug;
  let n = 2;
  for (;;) {
    const path = normalizeWebPath(`${dir}/${slug}.${ext}`);
    const existing = await store.findByPath(path);
    if (!existing) {
      try {
        await access(join(webDir, path));
      } catch {
        return path;
      }
    }
    slug = `${baseSlug}-${n}`;
    n += 1;
  }
}

async function upsertListing(
  store: ReturnType<typeof createWebContentStore>,
  webDir: string,
  relativePath: string,
  title: string,
  markdown: string,
  visibility: WebContentVisibility,
  now: string,
  kind: WebContentKind,
  summary: string,
): Promise<void> {
  const meta = sha256Utf8(markdown);
  await writeWebFile(webDir, relativePath, markdown);
  await store.upsert({
    path: relativePath,
    contentHash: meta.hash,
    byteLength: meta.byteLength,
    title,
    summary,
    kind,
    mimeType: "text/markdown",
    visibility,
    updatedAt: now,
    publishedAt: now,
  });
}

async function regenerateBlogListing(
  store: ReturnType<typeof createWebContentStore>,
  webDir: string,
  ownerId: string,
  visibilityFallback: WebContentVisibility,
  now: string,
): Promise<string> {
  const articles = (await store.list({ kind: "article" })).filter((e) =>
    e.path.startsWith("blog/posts/"),
  );
  const indexMd = buildBlogIndexMarkdown(ownerId, articles);
  const indexVisibility = mostOpenVisibility(articles, visibilityFallback);
  await upsertListing(
    store,
    webDir,
    "blog/index.md",
    "Blog",
    indexMd,
    indexVisibility,
    now,
    "article",
    `${articles.length} post${articles.length === 1 ? "" : "s"}`,
  );
  return `envoy://${ownerId}/blog/`;
}

async function regeneratePhotoWall(
  store: ReturnType<typeof createWebContentStore>,
  webDir: string,
  ownerId: string,
  gallery: string,
  visibilityFallback: WebContentVisibility,
  now: string,
): Promise<string> {
  const prefix = `photos/${gallery}/`;
  const photos = (await store.list({ kind: "photo" })).filter(
    (e) => e.path.startsWith(prefix) && !e.path.endsWith("/index.md") && e.path !== `${prefix}index.md`,
  );
  const galleryMd = buildPhotoWallMarkdown(ownerId, gallery, photos);
  const galleryVisibility = mostOpenVisibility(photos, visibilityFallback);
  await upsertListing(
    store,
    webDir,
    `${prefix}index.md`,
    `PhotoWall — ${gallery}`,
    galleryMd,
    galleryVisibility,
    now,
    "gallery",
    `${photos.length} photo${photos.length === 1 ? "" : "s"}`,
  );

  // Root photos/index.md — list galleries.
  const allPhotos = await store.list({ kind: "photo" });
  const galleryNames = new Map<string, { count: number; visibility: WebContentVisibility }>();
  for (const p of allPhotos) {
    const m = /^photos\/([^/]+)\//.exec(p.path);
    if (!m) continue;
    if (p.path.endsWith("index.md")) continue;
    const name = m[1]!;
    const cur = galleryNames.get(name) ?? { count: 0, visibility: p.visibility };
    cur.count += 1;
    if (VISIBILITY_RANK[p.visibility] > VISIBILITY_RANK[cur.visibility]) {
      cur.visibility = p.visibility;
    }
    galleryNames.set(name, cur);
  }
  // Ensure current gallery appears even if somehow filtered.
  if (!galleryNames.has(gallery)) {
    galleryNames.set(gallery, { count: photos.length, visibility: galleryVisibility });
  }
  const galleries = [...galleryNames.entries()].map(([name, v]) => ({
    name,
    count: v.count,
    visibility: v.visibility,
  }));
  const rootMd = buildPhotosRootMarkdown(ownerId, galleries);
  let rootVisibility: WebContentVisibility = visibilityFallback;
  for (const g of galleries) {
    if (VISIBILITY_RANK[g.visibility] > VISIBILITY_RANK[rootVisibility]) {
      rootVisibility = g.visibility;
    }
  }
  await upsertListing(
    store,
    webDir,
    "photos/index.md",
    "Photos",
    rootMd,
    rootVisibility,
    now,
    "gallery",
    `${galleries.length} galler${galleries.length === 1 ? "y" : "ies"}`,
  );

  return `envoy://${ownerId}/photos/${gallery}/`;
}

/**
 * Publish a web content item. Regenerates Blog / PhotoWall indexes when needed.
 */
export async function publishWebContentEntry(
  profileDir: string,
  params: PublishWebContentParams,
): Promise<PublishWebContentResult> {
  const title = params.title.trim();
  if (!title) throw new Error("publishWebContentEntry: title is required");
  const ownerId = params.ownerId.trim();
  if (!ownerId.startsWith("envoy:owner:")) {
    throw new Error("publishWebContentEntry: ownerId must be envoy:owner:…");
  }

  const webDir = join(profileDir, "web");
  await mkdir(webDir, { recursive: true });
  const store = createWebContentStore(webDir);
  await store.reload();

  const now = new Date().toISOString();
  const slug = slugifyTitle(title);
  let relativePath: string;
  let kind: WebContentKind;
  let mimeType: string;
  let contentHash: string;
  let byteLength: number;
  let summary: string;
  let listingUrl: string | undefined;

  if (params.template === "blog-post" || params.template === "note" || params.template === "profile") {
    const body = params.body ?? "";
    const markdown = `# ${title}\n\n${body.trim()}\n`;
    const meta = sha256Utf8(markdown);
    contentHash = meta.hash;
    byteLength = meta.byteLength;
    summary = summaryFromBody(body) || title;
    mimeType = "text/markdown";

    if (params.template === "blog-post") {
      kind = "article";
      relativePath = await uniquePath(webDir, store, "blog/posts", slug, "md");
    } else if (params.template === "note") {
      kind = "note";
      relativePath = await uniquePath(webDir, store, "notes", slug, "md");
    } else {
      kind = "profile";
      relativePath = "index.md";
    }
    await writeWebFile(webDir, relativePath, markdown);
  } else if (params.template === "photo" || params.template === "file") {
    if (!params.contentBase64) {
      throw new Error(`publishWebContentEntry: contentBase64 required for ${params.template}`);
    }
    const bytes = decodeBase64Payload(params.contentBase64);
    const meta = sha256Bytes(bytes);
    contentHash = meta.hash;
    byteLength = meta.byteLength;
    mimeType = (params.mimeType ?? "application/octet-stream").trim();
    summary = title;

    if (params.template === "photo") {
      kind = "photo";
      if (!mimeType.startsWith("image/")) {
        throw new Error("publishWebContentEntry: photo mimeType must be image/*");
      }
      const gallery = slugifyTitle(params.gallery?.trim() || "wall") || "wall";
      const ext = extensionFor({ mimeType, fileName: params.fileName, fallback: "jpg" });
      relativePath = await uniquePath(webDir, store, `photos/${gallery}`, slug, ext);
      await writeWebFile(webDir, relativePath, bytes);
    } else {
      kind = "file";
      const ext = extensionFor({ mimeType, fileName: params.fileName, fallback: "bin" });
      relativePath = await uniquePath(webDir, store, "files", slug, ext);
      await writeWebFile(webDir, relativePath, bytes);
    }
  } else {
    throw new Error(`publishWebContentEntry: unsupported template ${params.template as string}`);
  }

  const entry: WebContentEntry = {
    path: relativePath,
    contentHash,
    byteLength,
    title,
    summary,
    kind,
    mimeType,
    visibility: params.visibility,
    updatedAt: now,
    publishedAt: now,
    urlSlug: slug,
    ...(params.visibility === "contacts" && params.contactIds?.length
      ? { contactIds: [...params.contactIds] }
      : {}),
    ...(params.tags?.length ? { tags: [...params.tags] } : {}),
  };
  await store.upsert(entry);

  if (params.template === "blog-post") {
    listingUrl = await regenerateBlogListing(store, webDir, ownerId, params.visibility, now);
  } else if (params.template === "photo") {
    const gallery = slugifyTitle(params.gallery?.trim() || "wall") || "wall";
    listingUrl = await regeneratePhotoWall(store, webDir, ownerId, gallery, params.visibility, now);
  }

  return {
    path: relativePath,
    urlPath: relativePath,
    contentHash,
    byteLength,
    title,
    visibility: params.visibility,
    publishedAt: now,
    url: `envoy://${ownerId}/${relativePath}`,
    listingUrl,
  };
}
