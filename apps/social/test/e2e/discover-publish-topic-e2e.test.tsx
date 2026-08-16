/**
 * @vitest-environment jsdom
 * E2E (UI integration): Discover → By topic (interest + publish:<slug> in parallel).
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
  };
  getMorningReport.mockResolvedValue([]);
  searchPeers.mockResolvedValue([]);
});

function openTopicPanel() {
  renderWithI18n(<SearchView embedded />);
  const subTabs = screen.getByRole("tablist", { name: /Search type/i });
  fireEvent.click(within(subTabs).getByRole("button", { name: /^By topic$/i }));
}

describe("E2E Discover By topic (interest + publish)", () => {
  it("searches interest and publish:<slug> in parallel", async () => {
    openTopicPanel();

    expect(
      screen.getByText(/interest\/capability or publishing web posts/i),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /By published topic/i })).toBeNull();

    const input = screen.getByPlaceholderText(/Interest, capability, or published topic/i);
    fireEvent.change(input, { target: { value: "Photography Tips" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({ topic: "Photography Tips" });
        expect(searchPeers).toHaveBeenCalledWith({
          topic: "publish:photography-tips",
          maxResults: 20,
        });
      },
      { timeout: 3000 },
    );
  });

  it("passes through an already-prefixed publish: topic on the publish leg", async () => {
    openTopicPanel();

    fireEvent.change(
      screen.getByPlaceholderText(/Interest, capability, or published topic/i),
      { target: { value: "publish:Cooking" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({ topic: "publish:Cooking" });
        expect(searchPeers).toHaveBeenCalledWith({
          topic: "publish:cooking",
          maxResults: 20,
        });
      },
      { timeout: 3000 },
    );
  });

  it("skips publish search when slug normalizes empty; still searches interest", async () => {
    openTopicPanel();

    fireEvent.change(
      screen.getByPlaceholderText(/Interest, capability, or published topic/i),
      { target: { value: "!!!" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    await waitFor(
      () => {
        expect(searchPeers).toHaveBeenCalledWith({ topic: "!!!" });
        expect(searchPeers).not.toHaveBeenCalledWith(
          expect.objectContaining({ topic: expect.stringMatching(/^publish:/) }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("merges and dedupes peer results from both legs", async () => {
    const interestPeer: PeerSearchResult = {
      nodeId: "12D3KooWInterest",
      ownerId: "envoy:owner:alice",
      displayName: "Interest Alice",
      username: "alice",
      interests: ["photography"],
      bio: "",
      trustLevel: "unknown",
      discoverySource: "dht-capability-topic",
    };
    const publishPeer: PeerSearchResult = {
      nodeId: "12D3KooWPublish",
      ownerId: "envoy:owner:alice",
      displayName: "Publish Alice",
      username: "alice",
      interests: [],
      bio: "",
      trustLevel: "unknown",
      discoverySource: "dht-capability-topic",
    };
    const otherPeer: PeerSearchResult = {
      nodeId: "12D3KooWBob",
      ownerId: "envoy:owner:bob",
      displayName: "Photo Bob",
      username: "photobob",
      interests: [],
      bio: "",
      trustLevel: "unknown",
      discoverySource: "dht-capability-topic",
    };
    searchPeers.mockImplementation(async (opts: { topic?: string }) => {
      if (opts.topic?.startsWith("publish:")) return [publishPeer, otherPeer];
      return [interestPeer];
    });

    openTopicPanel();
    fireEvent.change(
      screen.getByPlaceholderText(/Interest, capability, or published topic/i),
      { target: { value: "photography" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Search$/i }));

    expect(await screen.findByText("Interest Alice")).toBeDefined();
    expect(await screen.findByText("Photo Bob")).toBeDefined();
    expect(screen.queryByText("Publish Alice")).toBeNull();
  });
});
