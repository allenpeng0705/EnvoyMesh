/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { BondRecord, PeerSearchResult } from "@envoymesh/api";
import { NearbyPeersPanel } from "../../src/components/discover/NearbyPeersPanel.js";

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, params?: Record<string, string>) => {
    const map: Record<string, string> = {
      "discover.nearby.title": "People on this network",
      "discover.nearby.lede": "Shows other Envoy users on the same Wi‑Fi.",
      "discover.nearby.offline": "offline",
      "discover.nearby.empty": "No one nearby yet.",
      "discover.nearby.someoneNearby": "Someone nearby",
      "discover.nearby.subtitle": "Nearby on your network",
      "discover.nearby.refresh": "Refresh",
      "discover.nearby.refreshing": "Scanning…",
      "common.sayHello": "Say hello",
      "common.connected": "Connected",
      "common.helloSentWaiting": "Hello sent",
    };
    return map[key] ?? key;
  },
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    refreshDiscoveredPeers: vi.fn(async () => ({ peered: 0, resolved: 0, unreachable: 0 })),
  }),
}));

vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: ({ fallbackLabel }: { fallbackLabel?: string }) => (
    <div data-testid="avatar">{fallbackLabel}</div>
  ),
}));

function peer(partial: Partial<PeerSearchResult> & Pick<PeerSearchResult, "nodeId">): PeerSearchResult {
  return {
    ownerId: "",
    displayName: "",
    interests: [],
    profileVisibility: "public",
    ...partial,
  };
}

describe("NearbyPeersPanel", () => {
  afterEach(() => cleanup());

  it("does not list nameless pending peers as cards", () => {
    render(
      <NearbyPeersPanel
        discoveredPeers={[
          peer({ nodeId: "12D3KooWPending1", profileStatus: "pending" }),
          peer({ nodeId: "12D3KooWPending2", profileStatus: "pending" }),
        ]}
        bonds={[]}
        outboundHellos={new Set()}
        nodeStatus="running"
        onSayHello={() => {}}
      />,
    );
    expect(screen.queryByTestId("nearby-peers-list")).toBeNull();
    expect(screen.getByText("No one nearby yet.")).toBeTruthy();
  });

  it("shows bonded contact by name instead of stuck identifying when mDNS peer matches bond", () => {
    const bonds: BondRecord[] = [
      {
        peerOwnerId: "envoy:owner:alice",
        displayName: "Alice",
        libp2pPeerId: "12D3KooWAliceNode",
        level: "direct",
        createdAt: new Date().toISOString(),
      },
    ];
    render(
      <NearbyPeersPanel
        discoveredPeers={[peer({ nodeId: "12D3KooWAliceNode", profileStatus: "pending" })]}
        bonds={bonds}
        outboundHellos={new Set()}
        nodeStatus="running"
        onSayHello={() => {}}
      />,
    );
    expect(screen.getByTestId("nearby-peers-list").textContent).toContain("Alice");
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByTestId("discover-open-profile")).toBeTruthy();
  });

  it("ignores unreachable noise in the empty state", () => {
    render(
      <NearbyPeersPanel
        discoveredPeers={[
          peer({ nodeId: "12D3KooWFail1", profileStatus: "unreachable" }),
          peer({ nodeId: "12D3KooWFail2", profileStatus: "unreachable" }),
        ]}
        bonds={[]}
        outboundHellos={new Set()}
        nodeStatus="running"
        onSayHello={() => {}}
      />,
    );
    expect(screen.queryByTestId("nearby-peers-list")).toBeNull();
    expect(screen.queryByTestId("nearby-status-note")).toBeNull();
    expect(screen.getByText("No one nearby yet.")).toBeTruthy();
  });

  it("lists only identifiable people with Say hello", () => {
    const onSayHello = vi.fn();
    render(
      <NearbyPeersPanel
        discoveredPeers={[
          peer({ nodeId: "12D3KooWNoise", profileStatus: "unreachable" }),
          peer({
            nodeId: "12D3KooWAlice",
            ownerId: "envoy:owner:alice",
            displayName: "Alice",
            profileStatus: "resolved",
          }),
        ]}
        bonds={[]}
        outboundHellos={new Set()}
        nodeStatus="running"
        onSayHello={onSayHello}
      />,
    );
    const list = screen.getByTestId("nearby-peers-list");
    expect(list.textContent).toContain("Alice");
    expect(list.textContent).not.toContain("Someone nearby");
    expect(screen.getByRole("button", { name: "Say hello" })).toBeTruthy();
    expect(screen.queryByTestId("nearby-status-note")).toBeNull();
  });
});
