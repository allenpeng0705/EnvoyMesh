import { describe, expect, it } from "vitest";
import {
  buildBlogIndexMarkdown,
  buildDefaultProfileMarkdown,
  buildPhotoWallMarkdown,
  buildPhotosRootMarkdown,
  defaultWebSurfaceForPath,
} from "../src/web-content-default-templates.js";

describe("web-content-default-templates", () => {
  it("builds a default profile with site links", () => {
    const md = buildDefaultProfileMarkdown({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
    });
    expect(md).toContain("# Alice");
    expect(md).toContain("envoy://envoy:owner:alice/blog/");
    expect(md).toContain("envoy://envoy:owner:alice/photos/");
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

  it("builds empty photowall and photos root", () => {
    expect(buildPhotoWallMarkdown("envoy:owner:alice", "wall", [])).toContain("_No photos yet._");
    expect(
      buildPhotosRootMarkdown("envoy:owner:alice", [{ name: "wall", count: 0 }]),
    ).toContain("envoy://envoy:owner:alice/photos/wall/");
  });

  it("maps library paths to default surfaces", () => {
    expect(defaultWebSurfaceForPath("")).toBe("profile");
    expect(defaultWebSurfaceForPath("index.md")).toBe("profile");
    expect(defaultWebSurfaceForPath("blog/")).toBe("blog");
    expect(defaultWebSurfaceForPath("blog/posts/a.md")).toBe("blog");
    expect(defaultWebSurfaceForPath("photos/wall/index.md")).toBe("photowall");
    expect(defaultWebSurfaceForPath("market/index.md")).toBeNull();
  });
});
