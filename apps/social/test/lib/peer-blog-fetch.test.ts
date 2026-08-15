import { describe, expect, it, vi } from "vitest";
import { BLOG_PEER_PAGE_SIZE, buildBlogIndexMarkdown } from "@envoymesh/api";
import {
  enrichPeerBlogSummaries,
  parsePeerBlogIndex,
  takePeerBlogPage,
} from "../../src/lib/peer-blog-fetch.js";

describe("peer-blog-fetch", () => {
  it("parses index and takes first page only for enrich", async () => {
    const posts = Array.from({ length: 35 }, (_, i) => ({
      path: `blog/posts/p${i}.md`,
      title: `Post ${i}`,
      updatedAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      publishedAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const md = buildBlogIndexMarkdown("envoy:owner:alice", posts);
    const catalog = parsePeerBlogIndex(md, "envoy:owner:alice");
    expect(catalog.length).toBe(35);

    const { page, nextOffset, hasMore } = takePeerBlogPage(catalog, 0);
    expect(page).toHaveLength(BLOG_PEER_PAGE_SIZE);
    expect(hasMore).toBe(true);
    expect(nextOffset).toBe(BLOG_PEER_PAGE_SIZE);

    const libraryRead = vi.fn(async (params: { path: string }) => ({
      peerOwnerId: "envoy:owner:alice",
      libp2pPeerId: "12D3",
      status: "ok" as const,
      body: `# ${params.path}\n\nBody for ${params.path}\n`,
    }));

    const enriched = await enrichPeerBlogSummaries(libraryRead, page);
    expect(libraryRead).toHaveBeenCalledTimes(BLOG_PEER_PAGE_SIZE);
    expect(enriched).toHaveLength(BLOG_PEER_PAGE_SIZE);
    expect(enriched[0]?.bodyPreview).toContain("Body for");

    const second = takePeerBlogPage(catalog, nextOffset);
    expect(second.page).toHaveLength(15);
    expect(second.hasMore).toBe(false);
  });
});
