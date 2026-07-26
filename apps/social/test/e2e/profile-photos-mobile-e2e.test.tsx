/**
 * @vitest-environment jsdom
 * E2E (UI): Mobile profile photos — ProfilePhotosTab variant=mobile (same UI as Capacitor Me tab).
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
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { HumanProfile } from "@envoymesh/api";
import { ProfilePhotosTab } from "../../src/components/profile/ProfilePhotosTab.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { minimalPngFile } from "../fixtures/profile-photo-fixtures.js";

const setPublicProfileThumbnail = vi.fn();
const upsertProfileGalleryPhoto = vi.fn();
const syncProfileToBonds = vi.fn();
const refreshHumanProfile = vi.fn();

let humanProfile: HumanProfile | null = null;
let isInProcessMobileNode = true;

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    setPublicProfileThumbnail,
    upsertProfileGalleryPhoto,
    updateProfileGalleryPhotoVisibility: vi.fn(),
    removeProfileGalleryPhoto: vi.fn(),
    shareFile: vi.fn(),
    syncProfileToBonds,
    readLibraryItemContent: vi.fn().mockResolvedValue({ contentBase64: "", mimeType: "image/png" }),
    libraryRead: vi.fn().mockResolvedValue({
      status: "ok",
      peerOwnerId: "envoy:owner:mobile",
      libp2pPeerId: "",
      body: "",
      contentType: "image/png",
      byteLength: 0,
      latencyMs: 0,
    }),
    ensureDefaultWebSite: vi.fn().mockResolvedValue({ created: [], urls: {} }),
    getCircuitReservationStatus: vi.fn().mockResolvedValue({
      state: "none",
      live: false,
      everReserved: false,
      relayPeerIds: [],
    }),
  }),
  useIsInProcessMobileNode: () => isInProcessMobileNode,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile,
    bonds: [],
    refreshHumanProfile,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  isInProcessMobileNode = true;
  humanProfile = {
    version: "0.1",
    ownerId: "envoy:owner:mobile",
    displayName: "Mobile Me",
    username: "mobile01",
    updatedAt: "2026-05-28T12:00:00.000Z",
    signature: "sig",
  };
  upsertProfileGalleryPhoto.mockResolvedValue(humanProfile);
  refreshHumanProfile.mockResolvedValue(undefined);
});

describe("E2E Profile photos (mobile tab)", () => {
  it("renders mobile layout class and optional thumbnail suggestion", () => {
    humanProfile = { ...humanProfile!, publicThumbnail: undefined };
    renderWithI18n(<ProfilePhotosTab variant="mobile" />);

    expect(document.querySelector(".mv-profile-photos")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/add a profile photo/i);
  });

  it("thumbnail picker uses capture=environment for camera-friendly mobile upload", async () => {
    renderWithI18n(<ProfilePhotosTab variant="mobile" />);

    fireEvent.click(screen.getByRole("button", { name: /change profile thumbnail/i }));

    const dialog = await screen.findByRole("dialog");
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
  });

  it("gallery pick uploads with public visibility", async () => {
    renderWithI18n(<ProfilePhotosTab variant="mobile" />);

    fireEvent.click(screen.getByTestId("browser-photo-add"));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [minimalPngFile("selfie.png")] } });

    fireEvent.change(await screen.findByTestId("photo-picker-gallery-caption"), {
      target: { value: "Beach day" },
    });
    fireEvent.click(screen.getByTestId("photo-picker-gallery-confirm"));

    await waitFor(() => {
      expect(upsertProfileGalleryPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: "public", label: "Beach day" }),
      );
    });
  });

  it("thumbnail crop confirms setPublicProfileThumbnail and syncs to bonds", async () => {
    humanProfile = { ...humanProfile!, publicThumbnail: undefined };
    setPublicProfileThumbnail.mockResolvedValue(humanProfile);

    renderWithI18n(<ProfilePhotosTab variant="mobile" />);
    fireEvent.click(screen.getByRole("button", { name: /change profile thumbnail/i }));

    const input = (await screen.findByRole("dialog")).querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [minimalPngFile()] } });
    fireEvent.click(await screen.findByRole("button", { name: /use this thumbnail/i }));

    await waitFor(() => {
      expect(setPublicProfileThumbnail).toHaveBeenCalled();
      expect(syncProfileToBonds).toHaveBeenCalled();
    });
  });
});
