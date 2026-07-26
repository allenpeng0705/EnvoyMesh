/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  BrowserHtmlDocument,
  extractBrowserHtmlBody,
  sanitizeBrowserHtml,
} from "../../src/components/BrowserHtmlDocument.js";
import { buildProfilePortalHtml } from "@envoymesh/api";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-testid=browser-profile-lightbox]").forEach((n) => n.remove());
});

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("BrowserHtmlDocument helpers", () => {
  it("keeps envoy:// URLs after sanitize", () => {
    const html = buildProfilePortalHtml({
      ownerId: "envoy:owner:abc",
      displayName: "Ada",
      photos: [{ title: "Trip", url: "envoy://envoy:owner:abc/photos/wall/a.png" }],
    });
    const body = extractBrowserHtmlBody(html);
    const clean = sanitizeBrowserHtml(body);
    expect(clean).toContain("em-profile-portal");
    expect(clean).toContain('src="envoy://envoy:owner:abc/photos/wall/a.png"');
  });
});

describe("BrowserHtmlDocument", () => {
  it("rewrites envoy images to blob URLs and opens lightbox on mosaic click", async () => {
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

    const html = buildProfilePortalHtml({
      ownerId: "envoy:owner:abc",
      displayName: "Ada",
      photos: [{ title: "Trip", url: "envoy://envoy:owner:abc/photos/wall/a.png" }],
    });

    renderWithI18n(
      <BrowserHtmlDocument
        html={html}
        libraryRead={libraryRead}
        onLinkClick={(e) => e.preventDefault()}
      />,
    );

    expect(screen.getByTestId("browser-html-document")).toBeTruthy();

    await waitFor(() => {
      expect(libraryRead).toHaveBeenCalled();
      const img = screen.getByTestId("browser-html-document").querySelector(".em-mosaic__tile img");
      expect(img?.getAttribute("src")?.startsWith("blob:")).toBe(true);
    });

    const tile = screen.getByTestId("browser-html-document").querySelector("a.em-mosaic__tile");
    expect(tile).toBeTruthy();
    fireEvent.click(tile!);
    await waitFor(() => {
      expect(screen.getByTestId("browser-profile-lightbox")).toBeTruthy();
    });
  });
});
