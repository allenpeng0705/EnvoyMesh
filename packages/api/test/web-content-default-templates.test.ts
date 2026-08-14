import { describe, expect, it } from "vitest";
import {
  buildBlogIndexMarkdown,
  buildFeedIndexMarkdown,
  buildDefaultProfileMarkdown,
  buildPhotoWallMarkdown,
  buildPhotosRootMarkdown,
  buildProfilePortalHtml,
  buildVisitorPlaceholderMarkdown,
  defaultWebSurfaceForPath,
  parseFeedIndexMarkdown,
} from "../src/web-content-default-templates.js";

describe("web-content-default-templates", () => {
  it("builds a default profile with site links", () => {
    const md = buildDefaultProfileMarkdown({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
    });
    expect(md).toContain("# Alice");
    expect(md).toContain("envoy://envoy:owner:alice/blog/");
    expect(md).toContain("envoy://envoy:owner:alice/photos/wall/");
  });

  it("builds a profile portal HTML with photos and escaped text", () => {
    const html = buildProfilePortalHtml({
      ownerId: "envoy:owner:alice",
      displayName: 'Alice <script>',
      username: "alice",
      bio: "Hello & welcome",
      hobbies: ["hiking"],
      avatarUrl: "envoy://envoy:owner:alice/avatar.jpg",
      photos: [
        {
          title: "Trip",
          url: "envoy://envoy:owner:alice/photos/wall/gallery-1.jpg",
        },
      ],
    });
    expect(html).toContain("em-profile-portal");
    expect(html).toContain("Alice &lt;script&gt;");
    expect(html).toContain("Hello &amp; welcome");
    expect(html).toContain('src="envoy://envoy:owner:alice/avatar.jpg"');
    expect(html).toContain("envoy://envoy:owner:alice/photos/wall/gallery-1.jpg");
    expect(html).toContain("hiking");
    expect(html).not.toContain(">Blog<");
    expect(html).not.toContain('href="envoy://envoy:owner:alice/blog/"');
  });

  it("builds empty and populated blog indexes", () => {
    expect(buildBlogIndexMarkdown("envoy:owner:alice", [])).toContain("_No posts yet._");
    const withPost = buildBlogIndexMarkdown("envoy:owner:alice", [
      {
        path: "blog/posts/hello.md",
        title: "Hello",
        updatedAt: "2026-07-20T00:00:00.000Z",
        publishedAt: "2026-07-20T00:00:00.000Z",
        summary: "First",
      },
    ]);
    expect(withPost).toContain("[Hello](envoy://envoy:owner:alice/blog/posts/hello.md)");
    expect(withPost).toContain("First");
  });

  it("builds empty and populated feed indexes", () => {
    expect(buildFeedIndexMarkdown("envoy:owner:alice", [])).toContain("_No posts yet._");
    const withPost = buildFeedIndexMarkdown("envoy:owner:alice", [
      {
        path: "feeds/hello.md",
        title: "Hello",
        updatedAt: "2026-07-20T00:00:00.000Z",
        publishedAt: "2026-07-20T00:00:00.000Z",
        summary: "Moments",
      },
    ]);
    expect(withPost).toContain("# Feed");
    expect(withPost).toContain("[Hello](envoy://envoy:owner:alice/feeds/hello.md)");
    expect(withPost).toContain("Moments");
  });

  it("parses feed index markdown (round-trip with builder)", () => {
    const md = buildFeedIndexMarkdown("envoy:owner:alice", [
      {
        path: "feeds/newer.md",
        title: "Newer",
        updatedAt: "2026-08-02T00:00:00.000Z",
        publishedAt: "2026-08-02T15:00:00.000Z",
        summary: "Second",
      },
      {
        path: "feeds/older.md",
        title: "Older",
        updatedAt: "2026-07-20T00:00:00.000Z",
        publishedAt: "2026-07-20T00:00:00.000Z",
      },
    ]);
    const parsed = parseFeedIndexMarkdown(md);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      title: "Newer",
      url: "envoy://envoy:owner:alice/feeds/newer.md",
      publishedAt: "2026-08-02T12:00:00.000Z",
      summary: "Second",
    });
    expect(parsed[1]?.title).toBe("Older");
    expect(parsed[1]?.summary).toBeUndefined();
    expect(parseFeedIndexMarkdown("# Feed\n\n_No posts yet._\n")).toEqual([]);
  });

  it("includes photo captions in PhotoWall markdown when summary differs from title", () => {
    const md = buildPhotoWallMarkdown("envoy:owner:alice", "wall", [
      {
        path: "photos/wall/lake.jpg",
        title: "lake.jpg",
        summary: "A beautiful winter lake",
        updatedAt: "2026-07-20T00:00:00.000Z",
        publishedAt: "2026-07-20T00:00:00.000Z",
      },
    ]);
    expect(md).toContain("A beautiful winter lake");
    expect(md).toContain("envoy://envoy:owner:alice/photos/wall/lake.jpg");
    expect(md).not.toContain("**[lake.jpg]");
    expect(md).not.toContain("![lake.jpg]");
    expect(md).not.toContain("**[");
  });

  it("builds empty photowall and photos root", () => {
    expect(buildPhotoWallMarkdown("envoy:owner:alice", "wall", [])).toContain("# Photos");
    expect(buildPhotoWallMarkdown("envoy:owner:alice", "wall", [])).toContain("_No photos yet._");
    expect(buildPhotoWallMarkdown("envoy:owner:alice", "travel", [])).toContain("# travel");
    expect(
      buildPhotosRootMarkdown("envoy:owner:alice", [{ name: "wall", count: 0 }]),
    ).toContain("envoy://envoy:owner:alice/photos/wall/");
  });

  it("maps library paths to default surfaces", () => {
    expect(defaultWebSurfaceForPath("")).toBe("profile");
    expect(defaultWebSurfaceForPath("index.md")).toBe("profile");
    expect(defaultWebSurfaceForPath("index.html")).toBe("profile");
    expect(defaultWebSurfaceForPath("blog/")).toBe("blog");
    expect(defaultWebSurfaceForPath("blog/posts/a.md")).toBe("blog");
    expect(defaultWebSurfaceForPath("photos/wall/index.md")).toBe("photowall");
    expect(defaultWebSurfaceForPath("market/index.md")).toBeNull();
  });

  it("builds visitor placeholders for unpublished remote surfaces", () => {
    const profile = buildVisitorPlaceholderMarkdown({
      surface: "profile",
      ownerId: "envoy:owner:bob",
      displayName: "Bob",
    });
    expect(profile).toContain("# Bob");
    expect(profile).toContain("hasn’t published a Profile");
    expect(profile).toContain("envoy://envoy:owner:bob/blog/");

    const blog = buildVisitorPlaceholderMarkdown({
      surface: "blog",
      ownerId: "envoy:owner:bob",
      displayName: "Bob",
    });
    expect(blog).toContain("# Blog");
    expect(blog).toContain("hasn’t published any blog posts");
  });
});
