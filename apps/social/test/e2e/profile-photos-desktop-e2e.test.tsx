/**
 * @vitest-environment jsdom
 * E2E (UI): Profile Photos | About tabs — desktop Social.
 */
import React from "react";
import { vi } from "vitest";

vi.mock("../../src/lib/profile-photo-crop.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/profile-photo-crop.js")>();
  return {
    ...actual,
    loadImageFromFile: vi.fn(async () => {
      const img = new Image();
      Object.defineProperty(img, "naturalWidth", { value: 400, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: 200, configurable: true });
      img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
      return img;
    }),
    exportSquareThumbnail: vi.fn(async () =>
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    ),
  };
});
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BondRecord, HumanProfile } from "@envoymesh/api";
import { ProfileView } from "../../src/components/views/ProfileView.js";
import { MINIMAL_PNG_BASE64, minimalPngFile } from "../fixtures/profile-photo-fixtures.js";

const setPublicProfileThumbnail = vi.fn();
const upsertProfileGalleryPhoto = vi.fn();
const updateProfileGalleryPhotoVisibility = vi.fn();
const removeProfileGalleryPhoto = vi.fn();
const shareFile = vi.fn();
const syncProfileToBonds = vi.fn();
const refreshHumanProfile = vi.fn();

let humanProfile: HumanProfile | null = null;
const bonds: BondRecord[] = [
  { peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex", createdAt: "2026-01-01T00:00:00.000Z" },
];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    setPublicProfileThumbnail,
    upsertProfileGalleryPhoto,
    updateProfileGalleryPhotoVisibility,
    removeProfileGalleryPhoto,
    shareFile,
    syncProfileToBonds,
    readLibraryItemContent: vi.fn().mockResolvedValue({ contentBase64: MINIMAL_PNG_BASE64, mimeType: "image/png" }),
    getOwnerDidPresentation: vi.fn().mockResolvedValue(null),
    updateHumanProfile: vi.fn(),
    getNodeConfig: vi.fn().mockResolvedValue({}),
    advertiseTopic: vi.fn(),
    stopAdvertiseTopic: vi.fn(),
  }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile,
    bonds,
    refreshHumanProfile,
    nodeStatus: "running",
    peerId: "12D3KooWTest",
    connectionStatus: { online: true, peerId: "12D3KooWTest", multiaddrs: [], connectedRelays: [], bondedPeers: 0 },
    refreshNodeConfig: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  humanProfile = {
    version: "0.1",
    ownerId: "envoy:owner:me",
    displayName: "Me",
    username: "me01",
    updatedAt: "2026-05-28T12:00:00.000Z",
    signature: "sig",
    galleryPhotos: [],
  };
  setPublicProfileThumbnail.mockImplementation(async () => {
    humanProfile = {
      ...humanProfile!,
      publicThumbnail: {
        vaultRelativePath: "profile/thumbnail.png",
        mimeType: "image/png",
        contentSha256: "abc",
        sizeBytes: 68,
      },
    };
  });
  upsertProfileGalleryPhoto.mockImplementation(async (params) => {
    humanProfile = {
      ...humanProfile!,
      galleryPhotos: [
        {
          photoId: "g1",
          vaultRelativePath: "profile/gallery/g1.png",
          mimeType: "image/png",
          contentSha256: "def",
          sizeBytes: 68,
          visibility: params.visibility,
          label: params.label,
        },
      ],
    };
  });
  refreshHumanProfile.mockImplementation(async () => {});
});

describe("E2E Profile photos (desktop)", () => {
  it("shows Photos and About sub-tabs; About shows profile fields", async () => {
    render(<ProfileView />);

    expect(screen.getByRole("navigation", { name: /profile sections/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^photos$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^about$/i })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^about$/i }));
    expect(await screen.findByText("@me01")).toBeDefined();
  });

  it("suggests a thumbnail when none is set", async () => {
    humanProfile = { ...humanProfile!, publicThumbnail: undefined };
    render(<ProfileView />);

    expect(screen.getByRole("status").textContent).toMatch(/add a profile photo/i);
    expect(screen.getByRole("button", { name: /add photo/i })).toBeDefined();
  });

  it("gallery add uploads with public visibility by default", async () => {
    render(<ProfileView />);

    fireEvent.click(screen.getByRole("button", { name: /^add photo$/i }));
    expect(await screen.findByText(/gallery metadata syncs/i)).toBeDefined();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = minimalPngFile("beach.png");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(upsertProfileGalleryPhoto).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "public",
          mimeType: "image/png",
        }),
      );
    });
  });

  it("thumbnail flow opens crop UI then calls setPublicProfileThumbnail", async () => {
    humanProfile = { ...humanProfile!, publicThumbnail: undefined };
    render(<ProfileView />);

    fireEvent.click(screen.getByRole("button", { name: /change profile thumbnail/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/profile thumbnail/i);

    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [minimalPngFile()] } });

    expect(await screen.findByText(/drag the photo/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /use this thumbnail/i }));

    await waitFor(() => {
      expect(setPublicProfileThumbnail).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "image/png", contentBase64: expect.any(String) }),
      );
      expect(syncProfileToBonds).toHaveBeenCalled();
    });
  });
});
