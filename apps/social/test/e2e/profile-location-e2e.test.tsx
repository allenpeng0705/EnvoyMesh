/**
 * @vitest-environment jsdom
 * E2E (UI integration): Profile About → location gazetteer, map picker, save.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, act, within } from "@testing-library/react";
import type { BondRecord, HumanProfile } from "@envoymesh/api";
import { NEARBY_GEOHASH_PRECISION } from "@envoymesh/api";
import { ProfileView } from "../../src/components/views/ProfileView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const updateHumanProfile = vi.fn();
const refreshHumanProfile = vi.fn().mockResolvedValue(undefined);

let humanProfile: HumanProfile | null = null;
const bonds: BondRecord[] = [];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    updateHumanProfile,
    refreshHumanProfile,
    syncProfileToBonds: vi.fn(),
    getOwnerDidPresentation: vi.fn().mockResolvedValue(null),
    getNodeConfig: vi.fn().mockResolvedValue({}),
    advertiseTopic: vi.fn(),
    stopAdvertiseTopic: vi.fn(),
    setPublicProfileThumbnail: vi.fn(),
    upsertProfileGalleryPhoto: vi.fn(),
    updateProfileGalleryPhotoVisibility: vi.fn(),
    removeProfileGalleryPhoto: vi.fn(),
    shareFile: vi.fn(),
    readLibraryItemContent: vi.fn(),
    getCircuitReservationStatus: vi.fn().mockResolvedValue({
      state: "none",
      live: false,
      everReserved: false,
      relayPeerIds: [],
    }),
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
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
  updateHumanProfile.mockImplementation(async (input) => ({
    ...humanProfile!,
    ...input,
    signature: "sig2",
    updatedAt: new Date().toISOString(),
  }));
});

async function openAboutEditForm() {
  renderWithI18n(<ProfileView />);
  fireEvent.click(screen.getByRole("button", { name: /^about$/i }));
  fireEvent.click(screen.getByRole("button", { name: /Edit profile details/i }));
  await screen.findByLabelText(/Country code/i);
}

async function commitGazetteerField(label: RegExp, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
}

describe("E2E Profile location", () => {
  it("gazetteer selection saves canonical discoveryLocation on profile", async () => {
    await openAboutEditForm();

    await commitGazetteerField(/Country code/i, "United States");
    await commitGazetteerField(/Region \/ state/i, "Massachusetts");
    await commitGazetteerField(/^City$/i, "Boston");

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      expect(updateHumanProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          discoveryLocation: expect.objectContaining({
            countryCode: "US",
            regionCode: "MA",
            city: "Boston",
          }),
        }),
      );
    });
  });

  it("reverts invalid country code on blur", async () => {
    await openAboutEditForm();

    const countryInput = screen.getByLabelText(/Country code/i) as HTMLInputElement;
    await commitGazetteerField(/Country code/i, "United States");
    fireEvent.change(countryInput, { target: { value: "XX" } });
    fireEvent.blur(countryInput);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(countryInput.value).toBe("United States");
    expect(updateHumanProfile).not.toHaveBeenCalled();
  });

  it("hides map picker until country is set", async () => {
    await openAboutEditForm();

    fireEvent.change(screen.getByLabelText(/Discoverable as/i), {
      target: { value: "nearby" },
    });
    expect(document.querySelector(".nearby-map-grid")).toBeNull();

    await commitGazetteerField(/Country code/i, "United States");

    expect(await screen.findByRole("button", { name: /Pick on map/i })).toBeDefined();
  });

  it("map click stores 5-char geohash at nearby precision", async () => {
    await openAboutEditForm();

    await commitGazetteerField(/Country code/i, "United States");

    fireEvent.change(screen.getByLabelText(/Discoverable as/i), {
      target: { value: "nearby" },
    });

    const map = await screen.findByRole("button", { name: /Pick on map/i });
    fireEvent.click(map);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`geohash.*[0-9b-hjkmnp-z]{${NEARBY_GEOHASH_PRECISION}}`, "i"))).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => {
      const call = updateHumanProfile.mock.calls.at(-1)?.[0];
      expect(call?.discoveryLocation?.geohash).toHaveLength(NEARBY_GEOHASH_PRECISION);
      expect(call?.discoveryLocationPrecision).toBe("nearby");
    });
  });

  it("view mode shows localized city in zh locale", async () => {
    humanProfile = {
      ...humanProfile!,
      discoveryLocation: { countryCode: "US", regionCode: "MA", city: "Boston" },
      discoveryLocationPrecision: "city",
    };

    renderWithI18n(<ProfileView />, { locale: "zh" });
    fireEvent.click(screen.getByRole("button", { name: "关于" }));

    const section = await screen.findByText(/^位置$/);
    const locationBlock = section.closest(".profile-section");
    expect(locationBlock).toBeDefined();
    expect(within(locationBlock as HTMLElement).getByText(/波士顿/)).toBeDefined();
  });
});
