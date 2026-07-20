/**
 * @vitest-environment jsdom
 * E2E (UI integration): Discover → By published topic (Phase 45E).
 *
 * Mocks searchPeers — avoids live DHT flake.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { HumanProfile, PeerSearchResult } from "@envoymesh/api";
import { SearchView } from "../../src/components/views/SearchView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const searchPeers = vi.fn();
const runCapabilityDiscovery = vi.fn().mockResolvedValue(undefined);
const getMorningReport = vi.fn().mockResolvedValue([]);
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
    getSetupSponsorFriendStatus: vi.fn().mockResolvedValue({
      config: null,
      state: {},
      sponsorProofTokenRequired: false,
    }),
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
    bonds: [{ peerOwnerId: "envoy:owner:bonded" }],
    nodeStatus: "running",
    nodeConfig: stableNodeConfig,
    refreshNodeConfig: vi.fn(),
    sendHello: vi.fn(),
    discoveredPeers: [],
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
  };
  getMorningReport.mockResolvedValue([]);
  searchPeers.mockResolvedValue([]);
});

function openPublishPanel() {
  renderWithI18n(<SearchView embedded />);
  const subTabs = screen.getByRole("tablist", { name: /Search type/i });
  fireEvent.click(within(subTabs).getByRole("button", { name: /By published topic/i }));
}

describe("E2E Discover publish topic", () => {
  it("normalizes free text to publish:<slug> and calls searchPeers", async () => {
    openPublishPanel();

    expect(screen.getByText(/publish web posts tagged with a topic/i)).toBeDefined();

    const input = screen.getByPlaceholderText(/What people publish about/i);
    fireEvent.change(input, { target: { value: "Photography Tips" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({
          topic: "publish:photography-tips",
          maxResults: 20,
        });
      },
      { timeout: 3000 },
    );
  });

  it("passes through an already-prefixed publish: topic", async () => {
    openPublishPanel();

    fireEvent.change(screen.getByPlaceholderText(/What people publish about/i), {
      target: { value: "publish:Cooking" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({
          topic: "publish:cooking",
          maxResults: 20,
        });
      },
      { timeout: 3000 },
    );
  });

  it("does not call searchPeers for empty slug after normalize", async () => {
    openPublishPanel();

    fireEvent.change(screen.getByPlaceholderText(/What people publish about/i), {
      target: { value: "!!!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        // handleSearch still runs (spinner delay); empty topic → [] without searchPeers
        expect(searchPeers).not.toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it("renders peer results from publish-topic search", async () => {
    const peer: PeerSearchResult = {
      nodeId: "12D3KooWPeer",
      ownerId: "envoy:owner:alice",
      displayName: "Photo Alice",
      username: "photoalice",
      interests: [],
      bio: "",
      trustLevel: "unknown",
      discoverySource: "dht-capability-topic",
    };
    searchPeers.mockResolvedValue([peer]);

    openPublishPanel();
    fireEvent.change(screen.getByPlaceholderText(/What people publish about/i), {
      target: { value: "photography" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    expect(await screen.findByText("Photo Alice")).toBeDefined();
  });
});
