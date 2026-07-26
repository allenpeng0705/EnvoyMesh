/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PeerSearchResult } from "@envoymesh/api";
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
      "discover.nearby.subtitleIdentifying": "Heard on this Wi‑Fi — identifying…",
      "discover.nearby.subtitleUnreachable": "Heard on this Wi‑Fi — couldn't identify yet",
      "discover.nearby.statusIdentifying": "Identifying…",
      "discover.nearby.statusUnreachable": "Unreachable",
      "discover.nearby.identifying": "Heard someone on this Wi‑Fi — identifying…",
      "discover.nearby.heardUnreachable": `Heard ${params?.count ?? "?"} device(s) — couldn't identify`,
      "discover.nearby.someUnreachable": `${params?.count ?? "?"} unreachable`,
      "common.sayHello": "Say hello",
      "common.connected": "Connected",
      "common.helloSentWaiting": "Hello sent",
    };
    return map[key] ?? key;
  },
}));

vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: () => <div data-testid="avatar" />,
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

  it("shows unresolved peers as Someone nearby with Identifying status", () => {
    render(
      <NearbyPeersPanel
        discoveredPeers={[peer({ nodeId: "12D3KooWPending", profileStatus: "pending" })]}
        bonds={[]}
        outboundHellos={new Set()}
        nodeStatus="running"
        onSayHello={() => {}}
      />,
    );
    expect(screen.getByTestId("nearby-peers-list").textContent).toContain("Someone nearby");
    expect(screen.getByText("Identifying…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Say hello" })).toBeNull();
    expect(screen.getByTestId("nearby-status-note").textContent).toMatch(/identifying/i);
  });

  it("shows diagnostic when mDNS heard peers but profile probe failed", () => {
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
    expect(screen.getByTestId("nearby-status-note").textContent).toContain("Heard 2");
    expect(screen.getAllByText("Unreachable")).toHaveLength(2);
  });

  it("enables Say hello only after ownerId is known", () => {
    const onSayHello = vi.fn();
    render(
      <NearbyPeersPanel
        discoveredPeers={[
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
    expect(screen.getByRole("button", { name: "Say hello" })).toBeTruthy();
    expect(screen.queryByTestId("nearby-status-note")).toBeNull();
  });
});
