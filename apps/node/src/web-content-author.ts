/**
 * Phase 45D — Web content authoring helpers.
 *
 * Writes files under `<profileDir>/web/`, upserts `web-content.json`, and
 * regenerates Blog / PhotoWall listings.
 *
 * Design: docs/web-content-browsing-design.md §4.2.3, §4.8, §9.2.
 */

import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import {
  buildBlogIndexMarkdown as buildBlogIndexMarkdownShared,
  buildPhotoWallMarkdown as buildPhotoWallMarkdownShared,
  buildPhotosRootMarkdown as buildPhotosRootMarkdownShared,
  buildProfilePortalHtml,
  DEFAULT_PHOTO_GALLERY,
  MAX_IMAGE_INPUT_BYTES,
  photoWallCanonicalPath,
  photoWallPageTitle,
  PROFILE_PHOTO_MIME_TYPES,
  stripImageMetadata,
  type ProfilePhotoMime,
  type ProfilePortalPhoto,
} from "@envoymesh/api";

import { fitImageToMaxBytes } from "./image-fit.js";
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
  | "file"
  | "section"
  | "feed-post";

export interface PublishWebContentImage {
  contentBase64: string;
  mimeType: string;
  fileName?: string;
}

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
  /**
   * When set, write/overwrite this relative path under `web/` instead of
   * allocating a unique slug (profile gallery → PhotoWall mirror).
   */
  stablePath?: string;
  /** Custom section path slug (defaults to slugified title). */
  sectionSlug?: string;
  /** Auto-tag section slug for `publish:<slug>` discovery (default true). */
  advertiseTopic?: boolean;
  /** Feed posts — up to MAX_FEED_POST_IMAGES images. */
  images?: PublishWebContentImage[];
}

/** Max images per Feed post (WeChat Moments-style). */
export const MAX_FEED_POST_IMAGES = 9;

/** Paths reserved for built-in site surfaces — custom sections cannot use these. */
export const RESERVED_WEB_SECTION_SLUGS = new Set([
  "blog",
  "photos",
  "notes",
  "files",
  "feeds",
  "profile",
  "index",
  "section",
]);

/** Unicode-aware path slug for custom sections (e.g. Market, 市集). Returns "" if empty. */
export function slugifySectionPath(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
  /** Effective tags written to the manifest (includes auto topic tags for sections). */
  tags?: string[];
}

/** Soft storage target for published photos/files after auto-resize. */
export const MAX_AUTHOR_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Stable PhotoWall path for a mirrored profile gallery photo. */
export function galleryPhotoWallStablePath(photoId: string, ext: string): string {
  const id = photoId.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "photo";
  const cleanExt = ext.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return normalizeWebPath(`photos/wall/gallery-${id}.${cleanExt}`);
}

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

function decodeBase64Payload(b64: string, maxBytes = MAX_IMAGE_INPUT_BYTES): Buffer {
  const trimmed = b64.trim();
  if (!trimmed) throw new Error("publishWebContentEntry: contentBase64 is empty");
  const buf = Buffer.from(trimmed, "base64");
  if (buf.byteLength === 0) {
    throw new Error("publishWebContentEntry: contentBase64 decoded to empty");
  }
  if (buf.byteLength > maxBytes) {
    throw new Error("publishWebContentEntry: upload could not be processed");
  }
  return buf;
}

function buildBlogIndexMarkdown(ownerId: string, posts: WebContentEntry[]): string {
  return buildBlogIndexMarkdownShared(ownerId, posts);
}

/** Markdown PhotoWall grid — clickable thumbnails via envoy:// image links. */
function buildPhotoWallMarkdown(
  ownerId: string,
  gallery: string,
  photos: WebContentEntry[],
): string {
  return buildPhotoWallMarkdownShared(ownerId, gallery, photos);
}

function buildPhotosRootMarkdown(
  ownerId: string,
  galleries: { name: string; count: number; visibility: WebContentVisibility }[],
): string {
  return buildPhotosRootMarkdownShared(
    ownerId,
    galleries.map((g) => ({ name: g.name, count: g.count })),
  );
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
    photoWallPageTitle(gallery),
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
  let publishedAt = now;

  let tags = params.tags ? [...params.tags] : [];
  let sectionSlugOut: string | undefined;

  if (params.template === "section") {
    const body = params.body ?? "";
    const markdown = `# ${title}\n\n${body.trim()}\n`;
    const meta = sha256Utf8(markdown);
    contentHash = meta.hash;
    byteLength = meta.byteLength;
    summary = summaryFromBody(body) || title;
    mimeType = "text/markdown";
    kind = "section";
    const sectionSlug = slugifySectionPath(params.sectionSlug?.trim() || title);
    if (!sectionSlug) {
      throw new Error(
        "publishWebContentEntry: section needs a title or path slug with letters/numbers",
      );
    }
    if (RESERVED_WEB_SECTION_SLUGS.has(sectionSlug)) {
      throw new Error(
        `publishWebContentEntry: section slug "${sectionSlug}" is reserved for built-in site pages`,
      );
    }
    sectionSlugOut = sectionSlug;
    relativePath = `${sectionSlug}/index.md`;
    if (params.advertiseTopic !== false && !tags.includes(sectionSlug)) {
      tags = [...tags, sectionSlug];
    }
    await writeWebFile(webDir, relativePath, markdown);
  } else if (params.template === "blog-post" || params.template === "note") {
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
    } else {
      kind = "note";
      relativePath = await uniquePath(webDir, store, "notes", slug, "md");
    }
    await writeWebFile(webDir, relativePath, markdown);
  } else if (params.template === "feed-post") {
    // Feed / Friend Circle: bonded-by-default Moments-style text + images.
    // Never public — coerce accidental public to bonded.
    if (params.visibility === "public") {
      throw new Error("publishWebContentEntry: feed-post visibility cannot be public (use bonded)");
    }
    const body = (params.body ?? "").trim();
    const images = params.images ?? [];
    if (images.length > MAX_FEED_POST_IMAGES) {
      throw new Error(
        `publishWebContentEntry: feed-post allows at most ${MAX_FEED_POST_IMAGES} images`,
      );
    }
    if (!body && images.length === 0) {
      throw new Error("publishWebContentEntry: feed-post needs text or at least one image");
    }
    // No interest tags — all bonded recipients should see Moments posts.
    tags = [];
    kind = "feed";
    mimeType = "text/markdown";
    relativePath = await uniquePath(webDir, store, "feeds", slug || `post-${Date.now()}`, "md");
    const postSlug = relativePath.replace(/^feeds\//, "").replace(/\.md$/, "");
    const imageLines: string[] = [];
    const imageUrls: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i]!;
      let bytes = decodeBase64Payload(img.contentBase64);
      let imgMime = (img.mimeType ?? "image/jpeg").trim();
      if (!imgMime.startsWith("image/")) {
        throw new Error("publishWebContentEntry: feed-post image mimeType must be image/*");
      }
      const fitted = await fitImageToMaxBytes(bytes, imgMime, MAX_AUTHOR_UPLOAD_BYTES);
      bytes = fitted.bytes;
      imgMime = fitted.mimeType;
      const mimeLower = imgMime.toLowerCase();
      if ((PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeLower)) {
        bytes = Buffer.from(
          stripImageMetadata(new Uint8Array(bytes), mimeLower as ProfilePhotoMime),
        );
        if (bytes.byteLength > MAX_AUTHOR_UPLOAD_BYTES) {
          const again = await fitImageToMaxBytes(bytes, mimeLower, MAX_AUTHOR_UPLOAD_BYTES);
          bytes = again.bytes;
          imgMime = again.mimeType;
        }
      }
      const ext = extensionFor({
        mimeType: imgMime,
        fileName: img.fileName,
        fallback: "jpg",
      });
      const mediaPath = normalizeWebPath(`feeds/media/${postSlug}/${i}.${ext}`);
      await writeWebFile(webDir, mediaPath, bytes);
      const abs = `envoy://${ownerId}/${mediaPath}`;
      imageUrls.push(abs);
      imageLines.push(`![photo](${abs})`);
    }
    const markdownParts = [`# ${title}`];
    if (body) markdownParts.push("", body);
    if (imageLines.length) markdownParts.push("", ...imageLines);
    markdownParts.push("");
    const markdown = markdownParts.join("\n");
    const meta = sha256Utf8(markdown);
    contentHash = meta.hash;
    byteLength = meta.byteLength;
    summary = summaryFromBody(body) || (imageUrls.length ? `${imageUrls.length} photo(s)` : title);
    await writeWebFile(webDir, relativePath, markdown);
    listingUrl = `envoy://${ownerId}/feeds/`;
  } else if (params.template === "profile") {
    const body = (params.body ?? "").trim();
    const html =
      body.includes("em-profile-portal") ||
      /^<!DOCTYPE\s+html/i.test(body) ||
      /^<html[\s>]/i.test(body)
        ? body
        : buildProfilePortalHtml({
            displayName: title,
            ownerId,
            bio: body || undefined,
          });
    const meta = sha256Utf8(html);
    contentHash = meta.hash;
    byteLength = meta.byteLength;
    summary = summaryFromBody(body.replace(/<[^>]+>/g, " ")) || title;
    mimeType = "text/html";
    kind = "profile";
    relativePath = "index.html";
    await writeWebFile(webDir, relativePath, html);
    await removeStaleProfileMarkdown(store, webDir);
  } else if (params.template === "photo" || params.template === "file") {
    if (!params.contentBase64) {
      throw new Error(`publishWebContentEntry: contentBase64 required for ${params.template}`);
    }
    let bytes = decodeBase64Payload(params.contentBase64);
    mimeType = (params.mimeType ?? "application/octet-stream").trim();
    summary =
      params.template === "photo" && params.body?.trim()
        ? params.body.trim().slice(0, 280)
        : title;

    if (params.template === "photo") {
      kind = "photo";
      if (!mimeType.startsWith("image/")) {
        throw new Error("publishWebContentEntry: photo mimeType must be image/*");
      }
      const fitted = await fitImageToMaxBytes(bytes, mimeType, MAX_AUTHOR_UPLOAD_BYTES);
      bytes = fitted.bytes;
      mimeType = fitted.mimeType;
      const mimeLower = mimeType.toLowerCase();
      if ((PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeLower)) {
        bytes = Buffer.from(
          stripImageMetadata(new Uint8Array(bytes), mimeLower as ProfilePhotoMime),
        );
        if (bytes.byteLength > MAX_AUTHOR_UPLOAD_BYTES) {
          const again = await fitImageToMaxBytes(bytes, mimeLower, MAX_AUTHOR_UPLOAD_BYTES);
          bytes = again.bytes;
          mimeType = again.mimeType;
        }
      }
      const meta = sha256Bytes(bytes);
      contentHash = meta.hash;
      byteLength = meta.byteLength;
      const gallery = slugifyTitle(params.gallery?.trim() || "wall") || "wall";
      const ext = extensionFor({ mimeType, fileName: params.fileName, fallback: "jpg" });
      if (params.stablePath?.trim()) {
        relativePath = normalizeWebPath(params.stablePath.trim());
        if (!relativePath.startsWith("photos/")) {
          throw new Error("publishWebContentEntry: stablePath must be under photos/");
        }
        const existing = await store.findByPath(relativePath);
        if (existing?.publishedAt) publishedAt = existing.publishedAt;
        // Drop sibling extensions for the same gallery-* stem (mime may change).
        const stem = relativePath.replace(/\.[^.]+$/, "");
        for (const e of await store.list({ kind: "photo" })) {
          if (e.path === relativePath) continue;
          if (e.path.replace(/\.[^.]+$/, "") === stem) {
            await store.remove(e.path);
            await unlink(join(webDir, e.path)).catch(() => undefined);
          }
        }
      } else {
        relativePath = await uniquePath(webDir, store, `photos/${gallery}`, slug, ext);
      }
      await writeWebFile(webDir, relativePath, bytes);
    } else {
      if (bytes.byteLength > MAX_AUTHOR_UPLOAD_BYTES) {
        throw new Error("publishWebContentEntry: upload could not be processed");
      }
      const meta = sha256Bytes(bytes);
      contentHash = meta.hash;
      byteLength = meta.byteLength;
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
    publishedAt,
    urlSlug: sectionSlugOut ?? slug,
    ...(params.visibility === "contacts" && params.contactIds?.length
      ? { contactIds: [...params.contactIds] }
      : {}),
    ...(tags.length ? { tags } : {}),
  };
  await store.upsert(entry);

  if (params.template === "blog-post") {
    listingUrl = await regenerateBlogListing(store, webDir, ownerId, params.visibility, now);
  } else if (params.template === "photo") {
    const gallery = slugifyTitle(params.gallery?.trim() || "wall") || "wall";
    listingUrl = await regeneratePhotoWall(store, webDir, ownerId, gallery, params.visibility, now);
  } else if (params.template === "section" && sectionSlugOut) {
    listingUrl = `envoy://${ownerId}/${sectionSlugOut}/`;
  } else if (params.template === "profile") {
    listingUrl = `envoy://${ownerId}`;
  } else if (params.template === "feed-post") {
    listingUrl = listingUrl ?? `envoy://${ownerId}/feeds/`;
  }

  return {
    path: relativePath,
    urlPath: relativePath,
    contentHash,
    byteLength,
    title,
    visibility: params.visibility,
    publishedAt,
    url:
      params.template === "section" && sectionSlugOut
        ? `envoy://${ownerId}/${sectionSlugOut}/`
        : params.template === "profile"
          ? `envoy://${ownerId}`
          : `envoy://${ownerId}/${relativePath}`,
    listingUrl,
    ...(tags.length ? { tags } : {}),
  };
}

export interface EnsureDefaultWebSiteParams {
  ownerId: string;
  /** Used as the seeded Profile title / greeting. */
  displayName?: string;
  /** Default visibility for seeded shells (contacts can browse). */
  visibility?: WebContentVisibility;
}

export interface EnsureDefaultWebSiteResult {
  created: Array<"profile" | "blog" | "photowall">;
  urls: {
    profile: string;
    blog: string;
    photowall: string;
  };
}

async function removeStaleProfileMarkdown(
  store: ReturnType<typeof createWebContentStore>,
  webDir: string,
): Promise<void> {
  await store.remove("index.md");
  await unlink(join(webDir, "index.md")).catch(() => undefined);
}

export interface PublishProfilePortalParams {
  ownerId: string;
  displayName: string;
  username?: string;
  bio?: string;
  hobbies?: string[];
  knowledge?: string[];
  capabilities?: Array<{ tag?: string; type?: string; descriptor?: string }>;
  /** Gallery photos already mirrored (or about to be) on PhotoWall. */
  photos?: Array<{ photoId: string; title?: string; mimeType: string }>;
  avatarBase64?: string;
  avatarMimeType?: string;
  visibility?: WebContentVisibility;
}

/**
 * Write `web/index.html` portal (+ optional `avatar.*`) from the signed human profile.
 * Removes stale `index.md` so `/` serves the HTML portal.
 */
export async function publishProfilePortal(
  profileDir: string,
  params: PublishProfilePortalParams,
): Promise<PublishWebContentResult> {
  const ownerId = params.ownerId.trim();
  if (!ownerId.startsWith("envoy:owner:")) {
    throw new Error("publishProfilePortal: ownerId must be envoy:owner:…");
  }
  const visibility = params.visibility ?? "bonded";
  const displayName = params.displayName.trim() || "Me";
  const webDir = join(profileDir, "web");
  await mkdir(webDir, { recursive: true });
  const store = createWebContentStore(webDir);
  await store.reload();
  const now = new Date().toISOString();

  let avatarUrl: string | undefined;
  if (params.avatarBase64?.trim()) {
    let bytes = decodeBase64Payload(params.avatarBase64);
    let mimeType = (params.avatarMimeType ?? "image/jpeg").trim().toLowerCase();
    if (!(PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType)) {
      mimeType = "image/jpeg";
    }
    const fitted = await fitImageToMaxBytes(bytes, mimeType, MAX_AUTHOR_UPLOAD_BYTES);
    bytes = fitted.bytes;
    mimeType = fitted.mimeType;
    if ((PROFILE_PHOTO_MIME_TYPES as readonly string[]).includes(mimeType.toLowerCase())) {
      bytes = Buffer.from(
        stripImageMetadata(new Uint8Array(bytes), mimeType.toLowerCase() as ProfilePhotoMime),
      );
    }
    const ext =
      mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
    const avatarPath = `avatar.${ext}`;
    // Drop sibling avatar extensions.
    for (const sibling of ["avatar.jpg", "avatar.jpeg", "avatar.png", "avatar.webp"]) {
      if (sibling === avatarPath) continue;
      await store.remove(sibling);
      await unlink(join(webDir, sibling)).catch(() => undefined);
    }
    const meta = sha256Bytes(bytes);
    await writeWebFile(webDir, avatarPath, bytes);
    await store.upsert({
      path: avatarPath,
      contentHash: meta.hash,
      byteLength: meta.byteLength,
      title: "Avatar",
      summary: "Profile avatar",
      kind: "photo",
      mimeType,
      visibility: "public",
      updatedAt: now,
      publishedAt: now,
    });
    avatarUrl = `envoy://${ownerId}/${avatarPath}`;
  } else {
    for (const candidate of ["avatar.jpg", "avatar.jpeg", "avatar.png", "avatar.webp"]) {
      if (await store.findByPath(candidate)) {
        avatarUrl = `envoy://${ownerId}/${candidate}`;
        break;
      }
    }
  }

  const photos: ProfilePortalPhoto[] = (params.photos ?? []).map((p) => {
    const ext =
      p.mimeType === "image/png" ? "png" : p.mimeType === "image/webp" ? "webp" : "jpg";
    const path = galleryPhotoWallStablePath(p.photoId, ext);
    return {
      title: p.title?.trim() || p.photoId,
      url: `envoy://${ownerId}/${path}`,
    };
  });

  // If the caller omitted photos (e.g. seed / stale republish), use PhotoWall mirrors.
  if (photos.length === 0) {
    const wall = (await store.list({ kind: "photo" })).filter(
      (e) =>
        e.path.startsWith("photos/wall/") &&
        !e.path.endsWith("/index.md") &&
        e.path !== "photos/wall/index.md" &&
        /\/gallery-/.test(e.path),
    );
    for (const e of wall) {
      photos.push({
        title: e.title || e.path.split("/").pop() || "Photo",
        url: `envoy://${ownerId}/${e.path}`,
      });
    }
  }

  const html = buildProfilePortalHtml({
    ownerId,
    displayName,
    username: params.username,
    bio: params.bio,
    hobbies: params.hobbies,
    knowledge: params.knowledge,
    capabilities: params.capabilities,
    avatarUrl,
    photos,
  });

  return publishWebContentEntry(profileDir, {
    template: "profile",
    title: displayName,
    visibility,
    ownerId,
    body: html,
  });
}

/**
 * Idempotently seed a default mesh site: Profile page + empty Blog + empty PhotoWall.
 * Never overwrites an existing manifest entry / path.
 */
export async function ensureDefaultWebSite(
  profileDir: string,
  params: EnsureDefaultWebSiteParams,
): Promise<EnsureDefaultWebSiteResult> {
  const ownerId = params.ownerId.trim();
  if (!ownerId.startsWith("envoy:owner:")) {
    throw new Error("ensureDefaultWebSite: ownerId must be envoy:owner:…");
  }
  const visibility = params.visibility ?? "bonded";
  const displayName = params.displayName?.trim() || "Me";
  const webDir = join(profileDir, "web");
  await mkdir(webDir, { recursive: true });
  const store = createWebContentStore(webDir);
  await store.reload();
  const now = new Date().toISOString();
  const created: EnsureDefaultWebSiteResult["created"] = [];

  const hasHtml = await store.findByPath("index.html");
  const hasMd = await store.findByPath("index.md");
  if (!hasHtml) {
    const html = buildProfilePortalHtml({ ownerId, displayName });
    const meta = sha256Utf8(html);
    await writeWebFile(webDir, "index.html", html);
    await store.upsert({
      path: "index.html",
      contentHash: meta.hash,
      byteLength: meta.byteLength,
      title: displayName,
      summary: "Default Profile page",
      kind: "profile",
      mimeType: "text/html",
      visibility,
      updatedAt: now,
      publishedAt: now,
      urlSlug: "profile",
    });
    if (hasMd) await removeStaleProfileMarkdown(store, webDir);
    created.push("profile");
  }

  if (!(await store.findByPath("blog/index.md"))) {
    await upsertListing(
      store,
      webDir,
      "blog/index.md",
      "Blog",
      buildBlogIndexMarkdown(ownerId, []),
      visibility,
      now,
      "article",
      "0 posts",
    );
    created.push("blog");
  }

  let photowallCreated = false;
  if (!(await store.findByPath("photos/wall/index.md"))) {
    await upsertListing(
      store,
      webDir,
      "photos/wall/index.md",
      photoWallPageTitle(DEFAULT_PHOTO_GALLERY),
      buildPhotoWallMarkdown(ownerId, DEFAULT_PHOTO_GALLERY, []),
      visibility,
      now,
      "gallery",
      "0 photos",
    );
    photowallCreated = true;
  }
  if (!(await store.findByPath("photos/index.md"))) {
    await upsertListing(
      store,
      webDir,
      "photos/index.md",
      "Photos",
      buildPhotosRootMarkdown(ownerId, [{ name: DEFAULT_PHOTO_GALLERY, count: 0, visibility }]),
      visibility,
      now,
      "gallery",
      "1 gallery",
    );
    photowallCreated = true;
  }
  if (photowallCreated) created.push("photowall");

  return {
    created,
    urls: {
      profile: `envoy://${ownerId}/`,
      blog: `envoy://${ownerId}/blog/`,
      photowall: `envoy://${ownerId}/${photoWallCanonicalPath()}`,
    },
  };
}

export interface WebContentSectionSummary {
  title: string;
  slug: string;
  path: string;
  url: string;
  visibility: WebContentVisibility;
  tags?: string[];
  updatedAt: string;
}

/** List custom sections (kind `section`) for My site / shelves. */
export async function listWebContentSections(
  profileDir: string,
  ownerId: string,
): Promise<WebContentSectionSummary[]> {
  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const entries = await store.list({ kind: "section" });
  const out: WebContentSectionSummary[] = [];
  for (const e of entries) {
    const m = /^([^/]+)\/index\.md$/.exec(e.path);
    if (!m) continue;
    const slug = m[1]!;
    if (RESERVED_WEB_SECTION_SLUGS.has(slug)) continue;
    out.push({
      title: e.title,
      slug,
      path: e.path,
      url: `envoy://${ownerId}/${slug}/`,
      visibility: e.visibility,
      tags: e.tags,
      updatedAt: e.updatedAt,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

export interface FeedPostSummary {
  path: string;
  url: string;
  title: string;
  summary?: string;
  bodyPreview?: string;
  publishedAt: string;
  visibility: WebContentVisibility;
  imageUrls: string[];
  publisherOwnerId: string;
}

/** Extract envoy:// image URLs from Feed markdown. */
export function extractFeedImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const re = /!\[[^\]]*\]\((envoy:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const u = m[1]?.trim();
    if (u) urls.push(u);
  }
  return urls;
}

export interface DeleteWebContentParams {
  path: string;
  /** Required to rebuild `blog/index.md` envoy:// links when deleting a blog post. */
  ownerId?: string;
}

export interface DeleteWebContentResult {
  path: string;
  deleted: boolean;
}

/**
 * Delete a web-content item: remove manifest entry + file.
 * Feed posts also remove the sidecar media directory `feeds/media/{slug}/`.
 */
export async function deleteWebContentEntry(
  profileDir: string,
  params: DeleteWebContentParams,
): Promise<DeleteWebContentResult> {
  const relativePath = normalizeWebPath(params.path ?? "");
  if (!relativePath || relativePath.includes("..")) {
    throw new Error("deleteWebContentEntry: invalid path");
  }
  // Refuse deleting site shells / listings by accident.
  if (
    relativePath === "index.html" ||
    relativePath === "index.md" ||
    relativePath === "blog/index.md" ||
    relativePath.endsWith("/index.md") ||
    relativePath.endsWith("/index.html")
  ) {
    throw new Error("deleteWebContentEntry: listing/index paths cannot be deleted this way");
  }

  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const existing = await store.findByPath(relativePath);
  await store.remove(relativePath);
  await unlink(join(webDir, relativePath)).catch(() => undefined);

  // Feed Moments media lives beside the post markdown.
  if (
    (existing?.kind === "feed" || relativePath.startsWith("feeds/")) &&
    relativePath.endsWith(".md") &&
    !relativePath.includes("/media/")
  ) {
    const postSlug = relativePath.replace(/^feeds\//, "").replace(/\.md$/, "");
    if (postSlug && !postSlug.includes("/")) {
      const mediaDir = join(webDir, "feeds", "media", postSlug);
      await rm(mediaDir, { recursive: true, force: true }).catch(() => undefined);
      // Drop any accidental media manifest rows under that prefix.
      const mediaEntries = (await store.list()).filter((e) =>
        e.path.startsWith(`feeds/media/${postSlug}/`),
      );
      for (const e of mediaEntries) {
        await store.remove(e.path);
        await unlink(join(webDir, e.path)).catch(() => undefined);
      }
    }
  }

  // Keep blog/index.md in sync when a post is removed.
  const listingOwner = params.ownerId?.trim();
  if (
    listingOwner &&
    relativePath.startsWith("blog/posts/") &&
    relativePath.endsWith(".md")
  ) {
    await regenerateBlogListing(
      store,
      webDir,
      listingOwner,
      existing?.visibility ?? "bonded",
      new Date().toISOString(),
    );
  }

  return { path: relativePath, deleted: Boolean(existing) };
}

/** List own Feed posts (kind `feed`), newest first. */
export async function listFeedPosts(
  profileDir: string,
  ownerId: string,
): Promise<FeedPostSummary[]> {
  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const entries = await store.list({ kind: "feed" });
  const out: FeedPostSummary[] = [];
  for (const e of entries) {
    if (!e.path.startsWith("feeds/") || !e.path.endsWith(".md")) continue;
    if (e.path.includes("/media/")) continue;
    let imageUrls: string[] = [];
    let bodyPreview = e.summary;
    try {
      const raw = await readFile(join(webDir, e.path), "utf8");
      imageUrls = extractFeedImageUrls(raw);
      const withoutHeading = raw.replace(/^#\s+[^\n]+\n*/, "").trim();
      const withoutImages = withoutHeading.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
      if (withoutImages) bodyPreview = withoutImages.slice(0, 280);
    } catch {
      /* listing still useful without body parse */
    }
    out.push({
      path: e.path,
      url: `envoy://${ownerId}/${e.path}`,
      title: e.title,
      summary: e.summary,
      bodyPreview,
      publishedAt: e.publishedAt ?? e.updatedAt,
      visibility: e.visibility,
      imageUrls,
      publisherOwnerId: ownerId,
    });
  }
  out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return out;
}

export interface BlogPostSummary {
  path: string;
  url: string;
  title: string;
  summary?: string;
  bodyPreview?: string;
  publishedAt: string;
  visibility: WebContentVisibility;
  publisherOwnerId: string;
}

/** List own Blog posts (kind `article` under `blog/posts/`), newest first. */
export async function listBlogPosts(
  profileDir: string,
  ownerId: string,
): Promise<BlogPostSummary[]> {
  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const entries = await store.list({ kind: "article" });
  const out: BlogPostSummary[] = [];
  for (const e of entries) {
    if (!e.path.startsWith("blog/posts/") || !e.path.endsWith(".md")) continue;
    let bodyPreview = e.summary;
    try {
      const raw = await readFile(join(webDir, e.path), "utf8");
      const withoutHeading = raw.replace(/^#\s+[^\n]+\n*/, "").trim();
      const withoutImages = withoutHeading.replace(/!\[[^\]]*\]\([^)]+\)/g, "").trim();
      if (withoutImages) bodyPreview = withoutImages.slice(0, 280);
    } catch {
      /* listing still useful without body parse */
    }
    out.push({
      path: e.path,
      url: `envoy://${ownerId}/${e.path}`,
      title: e.title,
      summary: e.summary,
      bodyPreview,
      publishedAt: e.publishedAt ?? e.updatedAt,
      visibility: e.visibility,
      publisherOwnerId: ownerId,
    });
  }
  out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return out;
}

/** Find PhotoWall entries mirrored from a profile gallery photoId (`gallery-{id}.*`). */
export async function findGalleryPhotoWallEntries(
  profileDir: string,
  photoId: string,
): Promise<WebContentEntry[]> {
  const id = photoId.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!id) return [];
  const prefix = `photos/wall/gallery-${id}.`;
  const store = createWebContentStore(join(profileDir, "web"));
  await store.reload();
  return (await store.list({ kind: "photo" })).filter((e) => e.path.startsWith(prefix));
}

/** Remove mirrored PhotoWall file(s) for a gallery photoId and regenerate listings. */
export async function removeGalleryPhotoWallMirror(
  profileDir: string,
  ownerId: string,
  photoId: string,
): Promise<number> {
  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const entries = await findGalleryPhotoWallEntries(profileDir, photoId);
  for (const e of entries) {
    await store.remove(e.path);
    await unlink(join(webDir, e.path)).catch(() => undefined);
  }
  if (entries.length > 0) {
    await regeneratePhotoWall(store, webDir, ownerId, "wall", "bonded", new Date().toISOString());
  }
  return entries.length;
}

/** Update visibility (and optional contact ACL) on a mirrored gallery PhotoWall entry. */
export async function updateGalleryPhotoWallVisibility(
  profileDir: string,
  ownerId: string,
  photoId: string,
  visibility: WebContentVisibility,
  contactIds?: string[],
): Promise<boolean> {
  const webDir = join(profileDir, "web");
  const store = createWebContentStore(webDir);
  await store.reload();
  const entries = await findGalleryPhotoWallEntries(profileDir, photoId);
  if (entries.length === 0) return false;
  const now = new Date().toISOString();
  for (const e of entries) {
    const next: WebContentEntry = {
      ...e,
      visibility,
      updatedAt: now,
      ...(visibility === "contacts" && contactIds?.length
        ? { contactIds: [...contactIds] }
        : { contactIds: undefined }),
    };
    if (visibility !== "contacts") {
      delete next.contactIds;
    }
    await store.upsert(next);
  }
  await regeneratePhotoWall(store, webDir, ownerId, "wall", visibility, now);
  return true;
}
