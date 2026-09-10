/**
 * Discover peer card — dialability affordance.
 *
 * Relay-roster hits can carry `hasHopSlot: false`: the person is checked in on
 * the relay (so they belong in Discover) but holds no live circuit hop yet, so
 * a hello has no transport path. The card must keep listing them while making
 * clear they are not reachable *yet*, instead of offering a Say Hello that
 * fails.
 *
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { PeerSearchResult } from "@envoymesh/api";
import { DiscoverPeerCard } from "../../src/components/discover/DiscoverPeerCard.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

// The card only needs a service context for the avatar; stub it so this test
// stays focused on the dialability affordance.
vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: () => null,
}));

function peer(partial: Partial<PeerSearchResult> = {}): PeerSearchResult {
  return {
    nodeId: "12D3KooWPeerA",
    ownerId: "envoy:owner:peer-a",
    displayName: "Emily",
    interests: [],
    profileVisibility: "public",
    discoverySource: "relay-roster-topic",
    ...partial,
  } as PeerSearchResult;
}

afterEach(() => {
  cleanup();
});

describe("DiscoverPeerCard dialability", () => {
  it("offers Say Hello when hoppability is unknown (LAN/DHT/local hits)", () => {
    const onSayHello = vi.fn();
    const { getByText, queryByTestId } = renderWithI18n(
      <DiscoverPeerCard peer={peer()} helloState="none" onSayHello={onSayHello} />,
    );
    expect(queryByTestId("discover-peer-pending-hop")).toBeNull();
    fireEvent.click(getByText(/say hello/i));
    expect(onSayHello).toHaveBeenCalledTimes(1);
  });

  it("offers Say Hello for relay hits with a live hop slot", () => {
    const onSayHello = vi.fn();
    const { getByText, queryByTestId } = renderWithI18n(
      <DiscoverPeerCard peer={peer({ hasHopSlot: true })} helloState="none" onSayHello={onSayHello} />,
    );
    expect(queryByTestId("discover-peer-pending-hop")).toBeNull();
    fireEvent.click(getByText(/say hello/i));
    expect(onSayHello).toHaveBeenCalledTimes(1);
  });

  it("shows a pending-hop badge and suppresses Say Hello when hasHopSlot is false", () => {
    const onSayHello = vi.fn();
    const { getByTestId, queryByText } = renderWithI18n(
      <DiscoverPeerCard peer={peer({ hasHopSlot: false })} helloState="none" onSayHello={onSayHello} />,
    );
    const badge = getByTestId("discover-peer-pending-hop");
    expect(badge.textContent).toMatch(/reachable in a moment/i);
    expect(queryByText(/say hello/i)).toBeNull();
    expect(onSayHello).not.toHaveBeenCalled();
  });

  it("keeps the real hello state authoritative (sent/connected win over pending hop)", () => {
    const sent = renderWithI18n(
      <DiscoverPeerCard peer={peer({ hasHopSlot: false })} helloState="sent" onSayHello={() => undefined} />,
    );
    expect(sent.queryByTestId("discover-peer-pending-hop")).toBeNull();
    cleanup();
    const connected = renderWithI18n(
      <DiscoverPeerCard peer={peer({ hasHopSlot: false })} helloState="connected" onSayHello={() => undefined} />,
    );
    expect(connected.queryByTestId("discover-peer-pending-hop")).toBeNull();
  });

  it("renders a plain card (no action) when there is no hello handler", () => {
    const { queryByTestId, queryByText } = renderWithI18n(
      <DiscoverPeerCard peer={peer({ hasHopSlot: false })} helloState="none" />,
    );
    expect(queryByTestId("discover-peer-pending-hop")).toBeNull();
    expect(queryByText(/say hello/i)).toBeNull();
  });
});
