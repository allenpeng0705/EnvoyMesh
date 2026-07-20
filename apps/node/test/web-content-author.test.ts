/**
 * Phase 45D — web content authoring unit tests (blog + photo + file).
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  publishWebContentEntry,
  slugifyTitle,
} from "../src/web-content-author.js";
import { createWebContentStore } from "../src/web-content-store.js";

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("slugifyTitle", () => {
  it("slugifies blog titles", () => {
    expect(slugifyTitle("My First Post")).toBe("my-first-post");
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
