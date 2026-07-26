import { describe, expect, it } from "vitest";
import { parsePhotoWallMarkdown } from "../../src/lib/parse-photo-wall-markdown.js";

describe("parsePhotoWallMarkdown", () => {
  it("returns null for normal markdown without images", () => {
    expect(parsePhotoWallMarkdown("# Hello\n\nNo images here.")).toBeNull();
  });

  it("parses PhotoWall embeds into a gallery model", () => {
    const md = [
      "# Photos",
      "",
      "[![Trip](envoy://envoy:owner:abc/photos/wall/a.jpg)](envoy://envoy:owner:abc/photos/wall/a.jpg)",
      "",
      "**[Trip](envoy://envoy:owner:abc/photos/wall/a.jpg)**",
      "",
      "Snow on the lake",
      "",
      "[![Home](envoy://envoy:owner:abc/photos/wall/b.png)](envoy://envoy:owner:abc/photos/wall/b.png)",
      "",
    ].join("\n");
    const parsed = parsePhotoWallMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe("Photos");
    expect(parsed!.photos).toEqual([
      {
        title: "Trip",
        url: "envoy://envoy:owner:abc/photos/wall/a.jpg",
        caption: "Snow on the lake",
      },
      { title: "Home", url: "envoy://envoy:owner:abc/photos/wall/b.png" },
    ]);
  });

  it("dedupes the same image URL", () => {
    const md =
      "![A](envoy://envoy:owner:abc/x.jpg)\n![A again](envoy://envoy:owner:abc/x.jpg)";
    const parsed = parsePhotoWallMarkdown(md);
    expect(parsed!.photos).toHaveLength(1);
  });
});
