/**
 * @vitest-environment jsdom
 * E2E (UI integration): Discover → By place geo search.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { HumanProfile, MorningReportEntry, PeerSearchResult } from "@envoymesh/api";
import { SearchView } from "../../src/components/views/SearchView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const searchPeers = vi.fn();
const runCapabilityDiscovery = vi.fn().mockResolvedValue(undefined);
const getMorningReport = vi.fn();
const showToast = vi.fn();

let humanProfile: HumanProfile | null = null;

const stableNodeConfig = {
  discoveryProfile: "wan-default" as const,
  bootstrapPresets: ["public-libp2p"] as const,
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    searchPeers,
    runCapabilityDiscovery,
    getMorningReport,
    getPeerProfile: vi.fn().mockResolvedValue(null),
    getSetupSponsorFriendStatus: vi.fn().mockResolvedValue({ config: null, state: {}, sponsorProofTokenRequired: false }),
    requestMultiHopDiscovery: vi.fn(),
    getMultiHopDiscoverySession: vi.fn(),
    applyWanJoinInvite: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
  useIsInProcessMobileNode: () => false,
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast }),
  useToastOptional: () => ({ showToast }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile,
    bonds: [],
    nodeStatus: "running",
    nodeConfig: stableNodeConfig,
    refreshNodeConfig: vi.fn(),
    sendHello: vi.fn(),
    discoveredPeers: [],
    refreshDiscoveredPeers: vi.fn(async () => ({ peered: 0, resolved: 0, unreachable: 0 })),
    pendingHellOs: [],
    acceptHello: vi.fn(),
    declineHello: vi.fn(),
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
    discoveryLocation: { countryCode: "US", city: "Boston" },
    discoveryLocationPrecision: "city",
  };
  getMorningReport.mockResolvedValue([]);
  searchPeers.mockResolvedValue([]);
});

function openPlacePanel() {
  renderWithI18n(<SearchView embedded />);
  const subTabs = screen.getByRole("tablist", { name: /Search type/i });
  fireEvent.click(within(subTabs).getByRole("button", { name: /By place/i }));
}

describe("E2E Discover geo search", () => {
  it("Same city calls searchPeers with geo:city topic", async () => {
    openPlacePanel();
    fireEvent.click(screen.getByRole("button", { name: /^Same city$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({
          topics: ["geo:city:US-boston"],
          maxResults: 20,
        });
      },
      { timeout: 3000 },
    );
    expect(runCapabilityDiscovery).toHaveBeenCalledWith({ find: true });
  });

  it("shows toast when profile has no country for place search", async () => {
    humanProfile = {
      ...humanProfile!,
      discoveryLocation: undefined,
    };
    openPlacePanel();
    fireEvent.click(screen.getByRole("button", { name: /^Same city$/i }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.stringMatching(/Profile.*About/i),
        "error",
      );
    });
    expect(searchPeers).not.toHaveBeenCalled();
  });

  it("Near me uses profile geohash neighbor topics", async () => {
    humanProfile = {
      ...humanProfile!,
      discoveryLocation: { countryCode: "US", geohash: "drt2z" },
      discoveryLocationPrecision: "nearby",
    };
    openPlacePanel();
    fireEvent.click(screen.getByRole("button", { name: /^Near me$/i }));

    await waitFor(() => {
      expect(searchPeers).toHaveBeenCalledWith(
        expect.objectContaining({
          topics: expect.arrayContaining(["geo:geohash:drt2z"]),
          maxResults: 20,
        }),
      );
    });
  });

  it("renders peer results from geo search", async () => {
    const peer: PeerSearchResult = {
      nodeId: "12D3KooWPeer",
      ownerId: "envoy:owner:alice",
      displayName: "Boston Alice",
      username: "bostonalice",
      interests: [],
      bio: "",
      trustLevel: "unknown",
      discoverySource: "dht-capability-topic",
    };
    searchPeers.mockResolvedValue([peer]);

    openPlacePanel();
    fireEvent.click(screen.getByRole("button", { name: /^Same city$/i }));

    expect(await screen.findByText("Boston Alice")).toBeDefined();
  });

  it("shows morning report geo city summary on wider panel", async () => {
    const entries: MorningReportEntry[] = [
      {
        ownerId: "geo-city:US-Boston",
        displayName: "Boston",
        trustLevel: "unknown",
        score: 3,
        reason: "geo-city-summary",
        discoveryMatchCount: 3,
        geoCitySummary: { peerCount: 3, cityLabel: "Boston" },
      },
    ];
    getMorningReport.mockResolvedValue(entries);

    openPlacePanel();

    expect(await screen.findByText(/3 peers in Boston/i)).toBeDefined();
  });
});
