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
  publishWebContentEntry,
  slugifyTitle,
} from "../src/web-content-author.js";
import { createWebContentStore } from "../src/web-content-store.js";

describe("slugifyTitle", () => {
  it("slugifies blog titles", () => {
    expect(slugifyTitle("My First Post")).toBe("my-first-post");
  });
});

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

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
  it("seeds profile, empty blog, and empty photowall once", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-web-seed-"));
    const ownerId = "envoy:owner:alice";
    const first = await ensureDefaultWebSite(profileDir, {
      ownerId,
      displayName: "Alice",
    });
    expect(first.created).toEqual(["profile", "blog", "photowall"]);
    expect(first.urls.profile).toBe(`envoy://${ownerId}/`);
    expect(first.urls.blog).toBe(`envoy://${ownerId}/blog/`);
    expect(first.urls.photowall).toBe(`envoy://${ownerId}/photos/`);

    const profileBody = await readFile(join(profileDir, "web", "index.md"), "utf8");
    expect(profileBody).toContain("# Alice");
    expect(profileBody).toContain("Welcome to my EnvoyMesh site");

    const blogBody = await readFile(join(profileDir, "web", "blog/index.md"), "utf8");
    expect(blogBody).toContain("_No posts yet._");

    const photosBody = await readFile(join(profileDir, "web", "photos/index.md"), "utf8");
    expect(photosBody).toContain("wall");
    const wallBody = await readFile(join(profileDir, "web", "photos/wall/index.md"), "utf8");
    expect(wallBody).toContain("_No photos yet._");

    const store = createWebContentStore(join(profileDir, "web"));
    expect((await store.findByPath("index.md"))?.visibility).toBe("bonded");
    expect((await store.findByPath("blog/index.md"))?.kind).toBe("article");
    expect((await store.findByPath("photos/wall/index.md"))?.kind).toBe("gallery");

    const second = await ensureDefaultWebSite(profileDir, {
      ownerId,
      displayName: "Alice Changed",
    });
    expect(second.created).toEqual([]);
    const unchanged = await readFile(join(profileDir, "web", "index.md"), "utf8");
    expect(unchanged).toContain("# Alice");
    expect(unchanged).not.toContain("Alice Changed");
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
    expect(galleryIndex).toContain("PhotoWall — wall");
    expect(galleryIndex).toContain(`envoy://${ownerId}/photos/wall/pixel.png`);

    const rootIndex = await readFile(join(profileDir, "web", "photos/index.md"), "utf8");
    expect(rootIndex).toContain("[wall]");

    const store = createWebContentStore(join(profileDir, "web"));
    const photo = await store.findByPath("photos/wall/pixel.png");
    expect(photo?.kind).toBe("photo");
    expect(photo?.mimeType).toBe("image/png");
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
