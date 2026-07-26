import { describe, expect, it } from "vitest";
import { buildBlogIndexMarkdown } from "@envoymesh/api";
import { parsePublicBlogIndexMarkdown } from "../../src/lib/parse-public-blog-index.js";

describe("parsePublicBlogIndexMarkdown", () => {
  it("returns empty for empty / no-posts listings", () => {
    expect(parsePublicBlogIndexMarkdown("")).toEqual([]);
    expect(parsePublicBlogIndexMarkdown(buildBlogIndexMarkdown("envoy:owner:a", []))).toEqual([]);
  });

  it("extracts titles and envoy urls from a populated index", () => {
    const md = buildBlogIndexMarkdown("envoy:owner:alice", [
      {
        path: "blog/posts/hello.md",
        title: "Hello World",
        updatedAt: "2026-07-20T00:00:00.000Z",
        publishedAt: "2026-07-20T00:00:00.000Z",
        summary: "First",
      },
      {
        path: "blog/posts/two.md",
        title: "Second",
        updatedAt: "2026-07-19T00:00:00.000Z",
        publishedAt: "2026-07-19T00:00:00.000Z",
      },
    ]);
    expect(parsePublicBlogIndexMarkdown(md)).toEqual([
      {
        title: "Hello World",
        url: "envoy://envoy:owner:alice/blog/posts/hello.md",
      },
      {
        title: "Second",
        url: "envoy://envoy:owner:alice/blog/posts/two.md",
      },
    ]);
  });
});
