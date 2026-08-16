/**
 * @vitest-environment jsdom
 *
 * Phase 45D — BrowserAuthorView component tests.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { BondRecord } from "@envoymesh/api";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { BrowserAuthorView } from "../../src/components/views/BrowserAuthorView.js";

const publishWebContentEntry = vi.fn();
const readLibraryItemContent = vi.fn();
const removeProfileGalleryPhoto = vi.fn();
const upsertProfileGalleryPhoto = vi.fn();
const setPublicProfileThumbnail = vi.fn();
const updateHumanProfile = vi.fn();
const getHumanProfile = vi.fn();
const syncProfileToBonds = vi.fn();

const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const bonds: BondRecord[] = [
  {
    peerOwnerId: "envoy:owner:bob",
    displayName: "Bob",
    level: "direct",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    peerOwnerId: "envoy:owner:carol",
    displayName: "Carol",
    level: "referred",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    peerOwnerId: "envoy:owner:blocked",
    displayName: "Blocked",
    level: "blocked",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const humanProfile = {
  ownerId: "envoy:owner:alice",
  displayName: "Alice",
  username: "alice",
  bio: "Hello",
  galleryPhotos: [
    {
      photoId: "photo-1",
      vaultRelativePath: "profile/gallery/photo-1.jpg",
      contentSha256: "abc",
      mimeType: "image/jpeg",
      label: "Trip",
      visibility: "public" as const,
    },
  ],
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    publishWebContentEntry,
    readLibraryItemContent,
    removeProfileGalleryPhoto,
    upsertProfileGalleryPhoto,
    setPublicProfileThumbnail,
    updateHumanProfile,
    getHumanProfile,
    syncProfileToBonds,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile,
    bonds,
  }),
}));

describe("BrowserAuthorView", () => {
  beforeEach(() => {
    publishWebContentEntry.mockReset();
    readLibraryItemContent.mockReset();
    removeProfileGalleryPhoto.mockReset();
    upsertProfileGalleryPhoto.mockReset();
    setPublicProfileThumbnail.mockReset();
    updateHumanProfile.mockReset();
    getHumanProfile.mockReset();
    syncProfileToBonds.mockReset();
    readLibraryItemContent.mockResolvedValue({
      contentBase64: MINIMAL_PNG_BASE64,
      mimeType: "image/png",
    });
    removeProfileGalleryPhoto.mockResolvedValue(humanProfile);
    upsertProfileGalleryPhoto.mockResolvedValue(humanProfile);
    updateHumanProfile.mockResolvedValue(humanProfile);
    getHumanProfile.mockResolvedValue(humanProfile);
    syncProfileToBonds.mockResolvedValue(undefined);
    publishWebContentEntry.mockResolvedValue({
      path: "blog/posts/my-first-post.md",
      urlPath: "blog/posts/my-first-post.md",
      contentHash: "abc",
      byteLength: 10,
      title: "My First Post",
      visibility: "bonded",
      publishedAt: new Date().toISOString(),
      url: "envoy://envoy:owner:alice/blog/posts/my-first-post.md",
      listingUrl: "envoy://envoy:owner:alice/blog/",
    });
  });

  afterEach(() => cleanup());

  it("publishes a blog post via New Blog Post flow", async () => {
    renderWithI18n(<BrowserAuthorView />);

    fireEvent.click(screen.getByTestId("browser-author-template-blog-post"));
    fireEvent.change(screen.getByTestId("browser-author-title"), {
      target: { value: "My First Post" },
    });
    fireEvent.change(screen.getByTestId("markdown-editor-textarea"), {
      target: { value: "Hello world! This is my first post on my EnvoyMesh blog." },
    });
    fireEvent.change(screen.getByTestId("visibility-selector"), {
      target: { value: "bonded" },
    });
    fireEvent.click(screen.getByTestId("browser-author-publish"));

    await waitFor(() => {
      expect(publishWebContentEntry).toHaveBeenCalledWith({
        template: "blog-post",
        title: "My First Post",
        body: "Hello world! This is my first post on my EnvoyMesh blog.",
        visibility: "bonded",
      });
    });

    expect(await screen.findByTestId("browser-author-published")).toBeTruthy();
    expect(screen.getByTestId("browser-author-published-url").textContent).toContain(
      "my-first-post.md",
    );
  });

  it("publishes a photo via Photo template with gallery + file", async () => {
    publishWebContentEntry.mockResolvedValue({
      path: "photos/wall/sunset.png",
      urlPath: "photos/wall/sunset.png",
      contentHash: "def",
      byteLength: 68,
      title: "Sunset",
      visibility: "bonded",
      publishedAt: new Date().toISOString(),
      url: "envoy://envoy:owner:alice/photos/wall/sunset.png",
      listingUrl: "envoy://envoy:owner:alice/photos/wall/",
    });

    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const file = new File([pngBytes], "sunset.png", { type: "image/png" });

    renderWithI18n(<BrowserAuthorView initialTemplate="photo" />);

    fireEvent.change(screen.getByTestId("browser-author-title"), {
      target: { value: "Sunset" },
    });
    fireEvent.change(screen.getByTestId("browser-author-gallery"), {
      target: { value: "wall" },
    });
    fireEvent.change(screen.getByTestId("browser-author-file"), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByTestId("visibility-selector"), {
      target: { value: "bonded" },
    });
    fireEvent.click(screen.getByTestId("browser-author-publish"));

    await waitFor(() => {
      expect(publishWebContentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "photo",
          title: "Sunset",
          gallery: "wall",
          mimeType: "image/png",
          fileName: "sunset.png",
          visibility: "bonded",
          contentBase64: expect.any(String),
        }),
      );
    });

    expect(await screen.findByTestId("browser-author-published")).toBeTruthy();
    expect(screen.getByTestId("browser-author-listing-url").textContent).toContain(
      "/photos/wall/",
    );
  });

  it("requires at least one contact when visibility is contacts", async () => {
    renderWithI18n(<BrowserAuthorView />);

    fireEvent.click(screen.getByTestId("browser-author-template-blog-post"));
    fireEvent.change(screen.getByTestId("browser-author-title"), {
      target: { value: "Private club" },
    });
    fireEvent.change(screen.getByTestId("visibility-selector"), {
      target: { value: "contacts" },
    });

    expect(screen.getByTestId("browser-author-contacts")).toBeTruthy();
    expect(
      (screen.getByTestId("browser-author-publish") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByText("Blocked")).toBeNull();
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Carol")).toBeTruthy();

    fireEvent.click(screen.getByTestId("browser-author-publish"));
    expect(publishWebContentEntry).not.toHaveBeenCalled();
  });

  it("publishes contacts visibility with selected contactIds", async () => {
    publishWebContentEntry.mockResolvedValue({
      path: "blog/posts/private-club.md",
      urlPath: "blog/posts/private-club.md",
      contentHash: "ghi",
      byteLength: 20,
      title: "Private club",
      visibility: "contacts",
      publishedAt: new Date().toISOString(),
      url: "envoy://envoy:owner:alice/blog/posts/private-club.md",
      listingUrl: "envoy://envoy:owner:alice/blog/",
    });

    renderWithI18n(<BrowserAuthorView />);

    fireEvent.click(screen.getByTestId("browser-author-template-blog-post"));
    fireEvent.change(screen.getByTestId("browser-author-title"), {
      target: { value: "Private club" },
    });
    fireEvent.change(screen.getByTestId("markdown-editor-textarea"), {
      target: { value: "Members only." },
    });
    fireEvent.change(screen.getByTestId("visibility-selector"), {
      target: { value: "contacts" },
    });

    fireEvent.click(screen.getAllByTestId("browser-author-contact-checkbox")[0]!);

    fireEvent.click(screen.getByTestId("browser-author-publish"));

    await waitFor(() => {
      expect(publishWebContentEntry).toHaveBeenCalledWith({
        template: "blog-post",
        title: "Private club",
        body: "Members only.",
        visibility: "contacts",
        contactIds: ["envoy:owner:bob"],
      });
    });

    expect(await screen.findByTestId("browser-author-published")).toBeTruthy();
  });

  it("loads existing gallery photos when editing profile", async () => {
    const createObjectURL = vi.fn(() => "blob:mock-gallery-photo");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    renderWithI18n(<BrowserAuthorView initialTemplate="profile" />);

    await waitFor(() => {
      expect(readLibraryItemContent).toHaveBeenCalledWith({
        relativePath: "profile/gallery/photo-1.jpg",
        maxBytes: expect.any(Number),
      });
    });

    expect(await screen.findByTestId("browser-author-existing-photo")).toBeTruthy();
    expect(screen.getByAltText("Trip")).toBeTruthy();

    vi.unstubAllGlobals();
  });
});
