/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { BrowserPhotoGallery } from "../../src/components/BrowserPhotoGallery.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => {
  cleanup();
});

const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("BrowserPhotoGallery", () => {
  it("renders a grid and opens a lightbox on tile click", async () => {
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

    renderWithI18n(
      <BrowserPhotoGallery
        title="Photos"
        photos={[
          { title: "Trip", url: "envoy://envoy:owner:abc/photos/wall/a.png" },
          { title: "Home", url: "envoy://envoy:owner:abc/photos/wall/b.png" },
        ]}
        libraryRead={libraryRead}
      />,
    );

    expect(screen.getByTestId("browser-photo-gallery")).toBeTruthy();
    expect(screen.getByText("Photos")).toBeTruthy();
    const tiles = screen.getAllByTestId("browser-photo-tile");
    expect(tiles).toHaveLength(2);

    await waitFor(() => {
      expect(libraryRead).toHaveBeenCalled();
      expect(tiles[0]!.querySelector("img")).toBeTruthy();
    });

    fireEvent.click(tiles[0]!);
    await waitFor(() => {
      expect(screen.getByTestId("browser-photo-lightbox")).toBeTruthy();
      expect(screen.getByTestId("browser-photo-lightbox-img")).toBeTruthy();
    });
  });

  it("omits title and shows add tile when onAddPhoto is set", () => {
    const onAddPhoto = vi.fn();
    renderWithI18n(
      <BrowserPhotoGallery
        photos={[]}
        libraryRead={vi.fn()}
        onAddPhoto={onAddPhoto}
      />,
    );

    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.click(screen.getByTestId("browser-photo-add"));
    expect(onAddPhoto).toHaveBeenCalledOnce();
  });

  it("pins visibility controls in lightbox footer for owners", async () => {
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
    const onOwnerVisibilityChange = vi.fn();
    const url = "envoy://envoy:owner:abc/photos/wall/a.png";

    renderWithI18n(
      <BrowserPhotoGallery
        photos={[{ title: "Trip", url }]}
        libraryRead={libraryRead}
        ownerByUrl={{
          [url]: { vaultRelativePath: "photos/gallery/a.png", visibility: "public" },
        }}
        onOwnerVisibilityChange={onOwnerVisibilityChange}
      />,
    );

    fireEvent.click(screen.getByTestId("browser-photo-tile"));
    const select = await screen.findByTestId("browser-photo-lightbox-visibility");
    expect(select.closest(".browser-photo-gallery__lightbox-footer")).toBeTruthy();
    fireEvent.change(select, { target: { value: "direct" } });
    expect(onOwnerVisibilityChange).toHaveBeenCalledWith("photos/gallery/a.png", "direct");
  });

  it("shows a delete control in the lightbox for owners", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onOwnerDelete = vi.fn();
    const url = "envoy://envoy:owner:abc/photos/wall/a.png";

    renderWithI18n(
      <BrowserPhotoGallery
        photos={[{ title: "Trip", url }]}
        libraryRead={vi.fn(async () => ({
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
        }))}
        ownerByUrl={{
          [url]: { vaultRelativePath: "photos/gallery/a.png", visibility: "public" },
        }}
        onOwnerDelete={onOwnerDelete}
      />,
    );

    fireEvent.click(screen.getByTestId("browser-photo-tile"));
    fireEvent.click(await screen.findByTestId("browser-photo-lightbox-delete"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onOwnerDelete).toHaveBeenCalledWith("photos/gallery/a.png");
    confirmSpy.mockRestore();
  });
});
