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
  buildBlogIndexMarkdown as buildBlogIndexMarkdownShared,
  buildDefaultProfileMarkdown,
  buildPhotoWallMarkdown as buildPhotoWallMarkdownShared,
  buildPhotosRootMarkdown as buildPhotosRootMarkdownShared,
} from "@envoymesh/api";

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
  | "section";

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
  /** Custom section path slug (defaults to slugified title). */
  sectionSlug?: string;
  /** Auto-tag section slug for `publish:<slug>` discovery (default true). */
  advertiseTopic?: boolean;
}

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
  } else if (params.template === "blog-post" || params.template === "note" || params.template === "profile") {
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
    summary =
      params.template === "photo" && params.body?.trim()
        ? params.body.trim().slice(0, 280)
        : title;

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
  }

  return {
    path: relativePath,
    urlPath: relativePath,
    contentHash,
    byteLength,
    title,
    visibility: params.visibility,
    publishedAt: now,
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

  if (!(await store.findByPath("index.md"))) {
    const markdown = buildDefaultProfileMarkdown({ ownerId, displayName });
    const meta = sha256Utf8(markdown);
    await writeWebFile(webDir, "index.md", markdown);
    await store.upsert({
      path: "index.md",
      contentHash: meta.hash,
      byteLength: meta.byteLength,
      title: displayName,
      summary: "Default Profile page",
      kind: "profile",
      mimeType: "text/markdown",
      visibility,
      updatedAt: now,
      publishedAt: now,
      urlSlug: "profile",
    });
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
      "PhotoWall — wall",
      buildPhotoWallMarkdown(ownerId, "wall", []),
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
      buildPhotosRootMarkdown(ownerId, [{ name: "wall", count: 0, visibility }]),
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
      photowall: `envoy://${ownerId}/photos/`,
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
