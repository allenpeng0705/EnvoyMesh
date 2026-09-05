/**
 * Phase 45D — web content authoring unit tests (blog + photo + file).
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureDefaultWebSite,
  listWebContentSections,
  listFeedPosts,
  listBlogPosts,
  deleteWebContentEntry,
  publishWebContentEntry,
  publishProfilePortal,
  slugifyTitle,
} from "../src/web-content-author.js";
import {
  createWebContentStore,
  resolveWebContentIndexCandidates,
  resolveWebContentPath,
} from "../src/web-content-store.js";

describe("slugifyTitle", () => {
  it("slugifies blog titles", () => {
    expect(slugifyTitle("My First Post")).toBe("my-first-post");
  });
});

describe("resolveWebContentPath", () => {
  it("prefers index.html for directory indexes", () => {
    expect(resolveWebContentPath("")).toBe("index.html");
    expect(resolveWebContentPath("/")).toBe("index.html");
    expect(resolveWebContentIndexCandidates("")).toEqual(["index.html", "index.md"]);
    expect(resolveWebContentPath("blog/")).toBe("blog/index.html");
  });
});

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Valid 1x1 JPEG from sharp — decodable by fitImageToMaxBytes. */
const JPEG_1X1 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z";

describe("publishWebContentEntry section", () => {
  it("publishes a custom Market section with topic tag", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-section-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "section",
      title: "Market",
      body: "Local goods and swaps.",
      visibility: "bonded",
      ownerId,
    });
    expect(result.path).toBe("market/index.md");
    expect(result.url).toBe(`envoy://${ownerId}/market/`);
    expect(result.listingUrl).toBe(`envoy://${ownerId}/market/`);

    const body = await readFile(join(profileDir, "web", "market/index.md"), "utf8");
    expect(body).toContain("# Market");
    expect(body).toContain("Local goods");

    const store = createWebContentStore(join(profileDir, "web"));
    const entry = await store.findByPath("market/index.md");
    expect(entry?.kind).toBe("section");
    expect(entry?.tags).toContain("market");

    const listed = await listWebContentSections(profileDir, ownerId);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.slug).toBe("market");
    expect(listed[0]?.url).toBe(`envoy://${ownerId}/market/`);
    expect(result.tags).toContain("market");
  });

  it("rejects empty section slug (punctuation-only title)", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-section-empty-"));
    await expect(
      publishWebContentEntry(profileDir, {
        template: "section",
        title: "!!!",
        body: "nope",
        visibility: "public",
        ownerId: "envoy:owner:alice",
      }),
    ).rejects.toThrow(/letters\/numbers/);
  });

  it("rejects reserved slug 'section'", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-section-reserved-"));
    await expect(
      publishWebContentEntry(profileDir, {
        template: "section",
        title: "Anything",
        body: "nope",
        visibility: "public",
        ownerId: "envoy:owner:alice",
        sectionSlug: "section",
      }),
    ).rejects.toThrow(/reserved/);
  });

  it("rejects reserved section slugs", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-section-bad-"));
    await expect(
      publishWebContentEntry(profileDir, {
        template: "section",
        title: "Blog",
        body: "nope",
        visibility: "public",
        ownerId: "envoy:owner:alice",
        sectionSlug: "blog",
      }),
    ).rejects.toThrow(/reserved/);
  });
});

describe("ensureDefaultWebSite", () => {
  it("seeds profile, empty blog, photowall, and feeds once", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-seed-"));
    const ownerId = "envoy:owner:alice";
    const first = await ensureDefaultWebSite(profileDir, {
      ownerId,
      displayName: "Alice",
    });
    expect(first.created).toEqual(["profile", "blog", "photowall", "feeds"]);
    expect(first.urls.profile).toBe(`envoy://${ownerId}/`);
    expect(first.urls.blog).toBe(`envoy://${ownerId}/blog/`);
    expect(first.urls.photowall).toBe(`envoy://${ownerId}/photos/wall/`);
    expect(first.urls.feeds).toBe(`envoy://${ownerId}/feeds/`);

    const profileBody = await readFile(join(profileDir, "web", "index.html"), "utf8");
    expect(profileBody).toContain("em-profile-portal");
    expect(profileBody).toContain("Alice");
    expect(profileBody).not.toContain(">Blog<");

    const blogBody = await readFile(join(profileDir, "web", "blog/index.md"), "utf8");
    expect(blogBody).toContain("_No posts yet._");

    const photosBody = await readFile(join(profileDir, "web", "photos/index.md"), "utf8");
    expect(photosBody).toContain("wall");
    const wallBody = await readFile(join(profileDir, "web", "photos/wall/index.md"), "utf8");
    expect(wallBody).toContain("_No photos yet._");

    const feedsBody = await readFile(join(profileDir, "web", "feeds/index.md"), "utf8");
    expect(feedsBody).toContain("_No posts yet._");

    const store = createWebContentStore(join(profileDir, "web"));
    expect((await store.findByPath("index.html"))?.visibility).toBe("bonded");
    expect((await store.findByPath("index.html"))?.mimeType).toBe("text/html");
    expect((await store.findByPath("blog/index.md"))?.kind).toBe("article");
    expect((await store.findByPath("photos/wall/index.md"))?.kind).toBe("gallery");
    expect((await store.findByPath("feeds/index.md"))?.kind).toBe("feed");

    const second = await ensureDefaultWebSite(profileDir, {
      ownerId,
      displayName: "Alice Changed",
    });
    expect(second.created).toEqual([]);
    const unchanged = await readFile(join(profileDir, "web", "index.html"), "utf8");
    expect(unchanged).toContain("Alice");
    expect(unchanged).not.toContain("Alice Changed");
  });

  it("publishProfilePortal writes index.html with photos and drops index.md", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-portal-"));
    const ownerId = "envoy:owner:alice";
    await ensureDefaultWebSite(profileDir, { ownerId, displayName: "Alice" });

    await publishWebContentEntry(profileDir, {
      template: "photo",
      title: "Trip",
      visibility: "public",
      ownerId,
      contentBase64: PNG_1X1,
      mimeType: "image/png",
      fileName: "trip.png",
      gallery: "wall",
      stablePath: "photos/wall/gallery-trip1.png",
    });

    const result = await publishProfilePortal(profileDir, {
      ownerId,
      displayName: "Alice",
      username: "alice",
      bio: "Hello",
      photos: [{ photoId: "trip1", title: "Trip", mimeType: "image/png" }],
      avatarBase64: PNG_1X1,
      avatarMimeType: "image/png",
      visibility: "public",
    });

    expect(result.path).toBe("index.html");
    const html = await readFile(join(profileDir, "web", "index.html"), "utf8");
    expect(html).toContain("em-profile-portal");
    expect(html).toContain("Alice");
    expect(html).toContain("envoy://envoy:owner:alice/photos/wall/gallery-trip1.png");
    expect(html).toContain("envoy://envoy:owner:alice/avatar.png");

    const store = createWebContentStore(join(profileDir, "web"));
    expect(await store.findByPath("index.md")).toBeUndefined();
    expect((await store.findByPath("index.html"))?.mimeType).toBe("text/html");
  });
});

describe("publishWebContentEntry", () => {
  it("writes blog post + manifest + regenerates blog/index.md", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-author-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "blog-post",
      title: "My First Post",
      body: "Hello world! This is my first post on my EnvoyMesh blog.",
      visibility: "bonded",
      ownerId,
    });

    expect(result.path).toBe("blog/posts/my-first-post.md");
    expect(result.url).toBe(`envoy://${ownerId}/blog/posts/my-first-post.md`);
    expect(result.listingUrl).toBe(`envoy://${ownerId}/blog/`);

    const postBody = await readFile(
      join(profileDir, "web", "blog/posts/my-first-post.md"),
      "utf8",
    );
    expect(postBody).toContain("# My First Post");
    expect(postBody).toContain("Hello world!");

    const indexBody = await readFile(join(profileDir, "web", "blog/index.md"), "utf8");
    expect(indexBody).toContain("My First Post");
    expect(indexBody).toContain(`envoy://${ownerId}/blog/posts/my-first-post.md`);

    const store = createWebContentStore(join(profileDir, "web"));
    const post = await store.findByPath("blog/posts/my-first-post.md");
    expect(post?.visibility).toBe("bonded");
    expect(post?.kind).toBe("article");
    const index = await store.findByPath("blog/index.md");
    expect(index?.visibility).toBe("bonded");
  });

  it("avoids slug collisions", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-author-"));
    const ownerId = "envoy:owner:alice";
    await publishWebContentEntry(profileDir, {
      template: "blog-post",
      title: "Hello",
      body: "one",
      visibility: "public",
      ownerId,
    });
    const second = await publishWebContentEntry(profileDir, {
      template: "blog-post",
      title: "Hello",
      body: "two",
      visibility: "public",
      ownerId,
    });
    expect(second.path).toBe("blog/posts/hello-2.md");
  });

  it("publishes a photo and regenerates PhotoWall indexes", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-photo-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "photo",
      title: "Pixel",
      visibility: "bonded",
      ownerId,
      contentBase64: PNG_1X1,
      mimeType: "image/png",
      fileName: "pixel.png",
      gallery: "wall",
    });

    expect(result.path).toBe("photos/wall/pixel.png");
    expect(result.listingUrl).toBe(`envoy://${ownerId}/photos/wall/`);

    const bytes = await readFile(join(profileDir, "web", "photos/wall/pixel.png"));
    expect(bytes.byteLength).toBeGreaterThan(0);

    const galleryIndex = await readFile(
      join(profileDir, "web", "photos/wall/index.md"),
      "utf8",
    );
    expect(galleryIndex).toContain("Photos");
    expect(galleryIndex).toContain(`envoy://${ownerId}/photos/wall/pixel.png`);
    expect(galleryIndex).not.toContain("PhotoWall — wall");

    const rootIndex = await readFile(join(profileDir, "web", "photos/index.md"), "utf8");
    expect(rootIndex).toContain("[wall]");

    const store = createWebContentStore(join(profileDir, "web"));
    const photo = await store.findByPath("photos/wall/pixel.png");
    expect(photo?.kind).toBe("photo");
    expect(photo?.mimeType).toBe("image/png");
  });

  it("strips JPEG metadata on photo publish", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-photo-exif-"));
    const ownerId = "envoy:owner:alice";
    const baseJpeg = Buffer.from(JPEG_1X1, "base64");
    const exifPayload = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
    const appLen = exifPayload.length + 2;
    const jpegWithExif = Buffer.concat([
      baseJpeg.subarray(0, 2),
      Buffer.from([0xff, 0xe1, (appLen >> 8) & 0xff, appLen & 0xff]),
      exifPayload,
      baseJpeg.subarray(2),
    ]);
    const result = await publishWebContentEntry(profileDir, {
      template: "photo",
      title: "Stripped",
      visibility: "public",
      ownerId,
      contentBase64: jpegWithExif.toString("base64"),
      mimeType: "image/jpeg",
      fileName: "stripped.jpg",
      gallery: "wall",
    });
    const onDisk = await readFile(join(profileDir, "web", result.path));
    expect(onDisk[0]).toBe(0xff);
    expect(onDisk[1]).toBe(0xd8);
    expect(onDisk.includes(Buffer.from("Exif"))).toBe(false);
    expect(onDisk.byteLength).toBeLessThanOrEqual(jpegWithExif.byteLength);
  });

  it("publishes a file under files/", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-file-"));
    const ownerId = "envoy:owner:alice";
    const pdfB64 = Buffer.from("%PDF-1.4 test").toString("base64");
    const result = await publishWebContentEntry(profileDir, {
      template: "file",
      title: "Notes PDF",
      visibility: "public",
      ownerId,
      contentBase64: pdfB64,
      mimeType: "application/pdf",
      fileName: "notes.pdf",
    });
    expect(result.path).toBe("files/notes-pdf.pdf");
    const store = createWebContentStore(join(profileDir, "web"));
    const entry = await store.findByPath("files/notes-pdf.pdf");
    expect(entry?.kind).toBe("file");
    expect(entry?.mimeType).toBe("application/pdf");
  });
});

describe("publishWebContentEntry feed-post", () => {
  it("publishes text + images under feeds/ with kind feed", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-feed-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "feed-post",
      title: "Hello circle",
      body: "Dinner with bonded friends",
      visibility: "bonded",
      ownerId,
      images: [
        {
          contentBase64: PNG_1X1,
          mimeType: "image/png",
          fileName: "a.png",
        },
      ],
    });
    expect(result.path.startsWith("feeds/")).toBe(true);
    expect(result.path.endsWith(".md")).toBe(true);
    expect(result.visibility).toBe("bonded");
    expect(result.listingUrl).toBe(`envoy://${ownerId}/feeds/`);

    const store = createWebContentStore(join(profileDir, "web"));
    const entry = await store.findByPath(result.path);
    expect(entry?.kind).toBe("feed");
    expect(entry?.mimeType).toBe("text/markdown");

    const index = await readFile(join(profileDir, "web", "feeds/index.md"), "utf8");
    expect(index).toContain("# Feed");
    expect(index).toContain(result.path);
    expect(index).toContain("Dinner with bonded friends");

    const md = await readFile(join(profileDir, "web", result.path), "utf8");
    expect(md).toContain("Dinner with bonded friends");
    expect(md).toContain(`envoy://${ownerId}/feeds/media/`);
    expect(result.imageUrls?.length).toBe(1);
    expect(result.imageUrls?.[0]).toMatch(/\/feeds\/media\//);

    const mediaPath = result.imageUrls![0]!.replace(`envoy://${ownerId}/`, "");
    const mediaEntry = await store.findByPath(mediaPath);
    expect(mediaEntry?.kind).toBe("photo");
    expect(mediaEntry?.visibility).toBe("bonded");
    expect(mediaEntry?.mimeType).toMatch(/^image\//);
  });

  it("rejects public visibility and more than 9 images", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-feed-bad-"));
    const ownerId = "envoy:owner:alice";
    await expect(
      publishWebContentEntry(profileDir, {
        template: "feed-post",
        title: "Nope",
        body: "x",
        visibility: "public",
        ownerId,
      }),
    ).rejects.toThrow(/cannot be public/);

    const images = Array.from({ length: 10 }, () => ({
      contentBase64: PNG_1X1,
      mimeType: "image/png",
      fileName: "x.png",
    }));
    await expect(
      publishWebContentEntry(profileDir, {
        template: "feed-post",
        title: "Too many",
        body: "x",
        visibility: "bonded",
        ownerId,
        images,
      }),
    ).rejects.toThrow(/at most 9/);
  });

  it("listBlogPosts returns newest first", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-blog-list-"));
    const ownerId = "envoy:owner:alice";
    const a = await publishWebContentEntry(profileDir, {
      template: "blog-post",
      title: `Alpha-${Date.now()}`,
      body: "one",
      visibility: "bonded",
      ownerId,
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await publishWebContentEntry(profileDir, {
      template: "blog-post",
      title: `Beta-${Date.now()}`,
      body: "two",
      visibility: "bonded",
      ownerId,
    });
    const posts = await listBlogPosts(profileDir, ownerId);
    const mine = posts.filter((p) => p.path === a.path || p.path === b.path);
    expect(mine.map((p) => p.path)).toEqual([b.path, a.path]);
  });

  it("listFeedPosts returns newest first", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-feed-list-"));
    const ownerId = "envoy:owner:alice";
    const a = await publishWebContentEntry(profileDir, {
      template: "feed-post",
      title: `Alpha-${Date.now()}`,
      body: "one",
      visibility: "bonded",
      ownerId,
    });
    await new Promise((r) => setTimeout(r, 5));
    const b = await publishWebContentEntry(profileDir, {
      template: "feed-post",
      title: `Beta-${Date.now()}`,
      body: "two",
      visibility: "bonded",
      ownerId,
    });
    const posts = await listFeedPosts(profileDir, ownerId);
    const mine = posts.filter((p) => p.path === a.path || p.path === b.path);
    expect(mine.map((p) => p.path)).toEqual([b.path, a.path]);
  });

  it("deleteWebContentEntry removes feed post markdown and media", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-feed-del-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "feed-post",
      title: "Temp",
      body: "delete me",
      visibility: "bonded",
      ownerId,
      images: [{ contentBase64: PNG_1X1, mimeType: "image/png", fileName: "a.png" }],
    });
    const del = await deleteWebContentEntry(profileDir, { path: result.path });
    expect(del.deleted).toBe(true);
    const store = createWebContentStore(join(profileDir, "web"));
    expect(await store.findByPath(result.path)).toBeUndefined();
    const posts = await listFeedPosts(profileDir, ownerId);
    expect(posts.some((p) => p.path === result.path)).toBe(false);
  });

  it("stores contactIds when visibility is contacts", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-feed-acl-"));
    const ownerId = "envoy:owner:alice";
    const result = await publishWebContentEntry(profileDir, {
      template: "feed-post",
      title: "Private circle",
      body: "only bob",
      visibility: "contacts",
      contactIds: ["envoy:owner:bob"],
      ownerId,
    });
    const store = createWebContentStore(join(profileDir, "web"));
    const entry = await store.findByPath(result.path);
    expect(entry?.contactIds).toEqual(["envoy:owner:bob"]);
  });
});
