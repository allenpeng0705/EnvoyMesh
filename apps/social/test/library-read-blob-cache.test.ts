/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLibraryReadBlobCache,
  fetchLibraryContentCached,
  libraryReadBlobCacheSize,
  libraryReadDetachedBlobCount,
  peekLibraryReadBlobUrl,
} from "../src/lib/library-read-blob-cache.js";

afterEach(() => {
  clearLibraryReadBlobCache();
});

describe("library-read-blob-cache", () => {
  it("caches image bodies and serves fresh hits without a second network call", async () => {
    const libraryRead = vi.fn(async () => ({
      status: "ok" as const,
      body: btoa("fake-png"),
      contentType: "image/png",
      contentHash: "abc123hashvalue",
      etag: "abc123hashvalue".slice(0, 16),
      byteLength: 8,
    }));

    const first = await fetchLibraryContentCached(libraryRead, {
      targetOwnerId: "envoy:owner:allen",
      path: "feeds/media/a/0.png",
    });
    expect(first.fromCache).toBe(false);
    expect(first.blobUrl).toMatch(/^blob:/);
    expect(libraryRead).toHaveBeenCalledTimes(1);
    expect(libraryReadBlobCacheSize()).toBe(1);

    const peek = peekLibraryReadBlobUrl("envoy:owner:allen", "feeds/media/a/0.png");
    expect(peek).toBe(first.blobUrl);

    const second = await fetchLibraryContentCached(libraryRead, {
      targetOwnerId: "envoy:owner:allen",
      path: "feeds/media/a/0.png",
    });
    expect(second.fromCache).toBe(true);
    expect(second.blobUrl).toBe(first.blobUrl);
    expect(libraryRead).toHaveBeenCalledTimes(1);
  });

  it("revalidates with If-None-Match after TTL when forced", async () => {
    const libraryRead = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ok" as const,
        body: btoa("v1"),
        contentType: "image/jpeg",
        contentHash: "hash-v1-xxxxxxxxxx",
        etag: "hash-v1-xxxxxxxx",
        byteLength: 2,
      })
      .mockResolvedValueOnce({
        status: "not_modified" as const,
        etag: "hash-v1-xxxxxxxx",
      });

    await fetchLibraryContentCached(libraryRead, {
      targetOwnerId: "envoy:owner:allen",
      path: "photos/wall/1.jpg",
    });
    const again = await fetchLibraryContentCached(libraryRead, {
      targetOwnerId: "envoy:owner:allen",
      path: "photos/wall/1.jpg",
      revalidate: true,
    });
    expect(again.fromCache).toBe(true);
    expect(libraryRead).toHaveBeenCalledTimes(2);
    expect(libraryRead.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ ifNoneMatch: "hash-v1-xxxxxxxx" }),
    );
  });

  it("LRU eviction keeps detached blob URLs for still-visible tiles", async () => {
    const urls: string[] = [];
    for (let i = 0; i < 65; i++) {
      const libraryRead = vi.fn(async () => ({
        status: "ok" as const,
        body: btoa(`img-${i}`),
        contentType: "image/png",
        contentHash: `hash-${i}-xxxxxxxxxxxxxxxx`,
        etag: `hash-${i}-xxxxxxxx`,
        byteLength: 8,
      }));
      const result = await fetchLibraryContentCached(libraryRead, {
        targetOwnerId: "envoy:owner:allen",
        path: `photos/wall/${i}.png`,
      });
      expect(result.blobUrl).toMatch(/^blob:/);
      urls.push(result.blobUrl!);
    }
    expect(libraryReadBlobCacheSize()).toBe(64);
    expect(libraryReadDetachedBlobCount()).toBe(1);
    // First image was evicted from the hot map but peek still returns the blob.
    const peek = peekLibraryReadBlobUrl("envoy:owner:allen", "photos/wall/0.png");
    expect(peek).toBe(urls[0]);
    expect(peek).toMatch(/^blob:/);
  });
});
