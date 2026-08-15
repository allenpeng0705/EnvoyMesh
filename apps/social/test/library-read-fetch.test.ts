import { describe, expect, it, vi } from "vitest";
import {
  baseMimeType,
  fetchLibraryContent,
  LIBRARY_READ_CHUNK_BYTES,
} from "../src/lib/library-read-fetch.js";
import type { LibraryReadResult } from "@envoymesh/api";

function okResult(partial: Partial<LibraryReadResult>): LibraryReadResult {
  return {
    peerOwnerId: "envoy:owner:a",
    libp2pPeerId: "peer",
    latencyMs: 1,
    status: "ok",
    ...partial,
  };
}

describe("baseMimeType", () => {
  it("strips charset parameters", () => {
    expect(baseMimeType("text/markdown; charset=utf-8")).toBe("text/markdown");
    expect(baseMimeType("text/html; charset=utf-8")).toBe("text/html");
    expect(baseMimeType("TEXT/Markdown")).toBe("text/markdown");
  });
});

describe("fetchLibraryContent", () => {
  it("returns a normal ok response", async () => {
    const libraryRead = vi.fn(async () =>
      okResult({
        body: "# Hi",
        contentType: "text/markdown",
        contentHash: "abc",
        etag: "abc".slice(0, 3),
        byteLength: 4,
      }),
    );
    const result = await fetchLibraryContent(libraryRead, {
      targetOwnerId: "envoy:owner:a",
      path: "hello.md",
    });
    expect(result.status).toBe("ok");
    expect(result.body).toBe("# Hi");
    expect(result.isText).toBe(true);
  });

  it("treats text/*; charset=utf-8 as text", async () => {
    const libraryRead = vi.fn(async () =>
      okResult({
        body: "# Hi",
        contentType: "text/markdown; charset=utf-8",
        contentHash: "abc",
        byteLength: 4,
      }),
    );
    const result = await fetchLibraryContent(libraryRead, {
      targetOwnerId: "envoy:owner:a",
      path: "hello.md",
    });
    expect(result.status).toBe("ok");
    expect(result.isText).toBe(true);
  });

  it("assembles base64 range chunks on too_large", async () => {
    const total = LIBRARY_READ_CHUNK_BYTES + 100;
    const full = Buffer.alloc(total, 0x41); // 'A'
    const fullB64 = full.toString("base64");
    const libraryRead = vi.fn(async (params: { range?: { start: number; end: number } }) => {
      if (!params.range) {
        return okResult({
          status: "too_large",
          byteLength: total,
          contentType: "application/pdf",
          contentHash: "deadbeef",
          etag: "deadbeef",
        }) as LibraryReadResult;
      }
      const slice = full.subarray(params.range.start, params.range.end + 1);
      return okResult({
        body: slice.toString("base64"),
        contentType: "application/pdf",
        contentHash: "deadbeef",
        etag: "deadbeef",
        range: { start: params.range.start, end: params.range.end, total },
        byteLength: slice.length,
      });
    });

    const result = await fetchLibraryContent(libraryRead, {
      targetOwnerId: "envoy:owner:a",
      path: "big.pdf",
    });
    expect(result.status).toBe("ok");
    expect(result.body).toBe(fullB64);
    expect(result.isText).toBe(false);
    expect(libraryRead.mock.calls.length).toBeGreaterThan(1);
  });

  it("returns cached body on not_modified when revalidating", async () => {
    const libraryRead = vi.fn(async () =>
      okResult({
        status: "not_modified",
        etag: "etag1",
        contentHash: "hash1",
        contentType: "text/markdown",
        byteLength: 5,
      }) as LibraryReadResult,
    );
    const result = await fetchLibraryContent(libraryRead, {
      targetOwnerId: "envoy:owner:a",
      path: "hello.md",
      revalidate: true,
      cache: {
        body: "# cached",
        contentType: "text/markdown",
        contentHash: "hash1",
        etag: "etag1",
        byteLength: 8,
        isText: true,
      },
    });
    expect(result.status).toBe("ok");
    expect(result.fromCache).toBe(true);
    expect(result.body).toBe("# cached");
    expect(libraryRead).toHaveBeenCalledWith(
      expect.objectContaining({ ifNoneMatch: "etag1" }),
    );
  });
});
