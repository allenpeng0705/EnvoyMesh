import { describe, expect, it, vi } from "vitest";
import {
  enrichWebContentMediaFromUrl,
  enrichWebContentMediaPool,
} from "../../src/lib/enrich-web-content-media.js";

describe("enrichWebContentMediaFromUrl", () => {
  it("extracts envoy image urls and body preview from post markdown", async () => {
    const libraryRead = vi.fn(async () => ({
      peerOwnerId: "envoy:owner:alice",
      libp2pPeerId: "12D3",
      status: "ok" as const,
      body: [
        "# Hello",
        "",
        "Moments text",
        "",
        "![photo](envoy://envoy:owner:alice/feeds/media/x/0.jpg)",
        "",
      ].join("\n"),
    }));
    const enriched = await enrichWebContentMediaFromUrl(
      libraryRead,
      "envoy://envoy:owner:alice/feeds/hello.md",
    );
    expect(enriched.outcome).toBe("enriched");
    if (enriched.outcome !== "enriched") throw new Error("expected enriched");
    expect(enriched.imageUrls).toEqual([
      "envoy://envoy:owner:alice/feeds/media/x/0.jpg",
    ]);
    expect(enriched.bodyPreview).toContain("Moments text");
    expect(libraryRead).toHaveBeenCalledWith(
      expect.objectContaining({
        targetOwnerId: "envoy:owner:alice",
        path: "feeds/hello.md",
      }),
    );
  });

  it("returns unavailable when library.read fails so callers can retry", async () => {
    const libraryRead = vi.fn(async () => ({
      peerOwnerId: "envoy:owner:alice",
      libp2pPeerId: "12D3",
      status: "error" as const,
      error: "timed out",
    }));
    const enriched = await enrichWebContentMediaFromUrl(
      libraryRead,
      "envoy://envoy:owner:alice/feeds/hello.md",
    );
    expect(enriched.outcome).toBe("unavailable");
  });

  it("returns empty for a definitive body with no media", async () => {
    const libraryRead = vi.fn(async () => ({
      peerOwnerId: "envoy:owner:alice",
      libp2pPeerId: "12D3",
      status: "ok" as const,
      body: "# Title\n\n",
    }));
    const enriched = await enrichWebContentMediaFromUrl(
      libraryRead,
      "envoy://envoy:owner:alice/feeds/hello.md",
    );
    expect(enriched.outcome).toBe("empty");
  });

  it("pools multiple urls", async () => {
    const libraryRead = vi.fn(async (params: { path: string }) => ({
      peerOwnerId: "envoy:owner:alice",
      libp2pPeerId: "12D3",
      status: "ok" as const,
      body: `![p](envoy://envoy:owner:alice/${params.path.replace(/\.md$/, "")}/0.jpg)`,
    }));
    const map = await enrichWebContentMediaPool(libraryRead, [
      "envoy://envoy:owner:alice/blog/posts/a.md",
      "envoy://envoy:owner:alice/blog/posts/b.md",
    ]);
    expect(map.size).toBe(2);
    expect(map.get("envoy://envoy:owner:alice/blog/posts/a.md")?.imageUrls[0]).toContain(
      "blog/posts/a/0.jpg",
    );
  });
});
