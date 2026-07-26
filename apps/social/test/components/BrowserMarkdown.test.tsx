/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  BrowserMarkdown,
  sanitizeBrowserMarkdown,
} from "../../src/components/BrowserMarkdown.js";

afterEach(() => {
  cleanup();
});

describe("sanitizeBrowserMarkdown", () => {
  it("keeps envoy:// hrefs on PhotoWall listing links", () => {
    const md =
      "- [wall](envoy://envoy:owner:abc/photos/wall/) (5 photos)";
    const html = sanitizeBrowserMarkdown(md);
    expect(html).toContain('href="envoy://envoy:owner:abc/photos/wall/"');
    expect(html).toContain("wall");
    expect(html).toContain("5 photos");
  });

  it("keeps envoy:// on markdown image src", () => {
    const md =
      "[![Trip](envoy://envoy:owner:abc/photos/wall/a.jpg)](envoy://envoy:owner:abc/photos/wall/a.jpg)";
    const html = sanitizeBrowserMarkdown(md);
    expect(html).toContain('src="envoy://envoy:owner:abc/photos/wall/a.jpg"');
    expect(html).toContain('href="envoy://envoy:owner:abc/photos/wall/a.jpg"');
  });
});

describe("BrowserMarkdown", () => {
  it("rewrites envoy:// image src to a blob URL after libraryRead", async () => {
    // 1x1 PNG
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const libraryRead = vi.fn(async () => ({
      status: "ok" as const,
      peerOwnerId: "envoy:owner:abc",
      libp2pPeerId: "12D3KooWTest",
      body: pngBase64,
      contentType: "image/png",
      contentHash: "abc",
      etag: '"abc"',
      byteLength: 68,
      isText: false,
      latencyMs: 1,
    }));

    const { container } = render(
      <BrowserMarkdown
        text={"![Trip](envoy://envoy:owner:abc/photos/wall/a.png)"}
        libraryRead={libraryRead}
      />,
    );

    await waitFor(() => {
      expect(libraryRead).toHaveBeenCalledWith(
        expect.objectContaining({
          targetOwnerId: "envoy:owner:abc",
          path: "photos/wall/a.png",
        }),
      );
    });

    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img?.getAttribute("src")?.startsWith("blob:")).toBe(true);
    });
  });
});
