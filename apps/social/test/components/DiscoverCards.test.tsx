/**
 * @vitest-environment jsdom
 *
 * Tests for `DiscoverCards.tsx`. Focuses on the trust/sent-state UX that the
 * user will see in the Discover tab when auto-discovery sends a hello and the
 * recipient hasn't accepted yet — the bug surface from 2026-07-11 where
 * "Hello sent — waiting" was the only signal and there was no way to recover
 * from a lost hello.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MorningReportEntry } from "@envoymesh/api";
import { PeerResultCard, FriendSuggestionsPanel } from "../../src/components/discover/DiscoverCards.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const mockGetPeerProfile = vi.fn();
const mockRequestPeerProfile = vi.fn();
const mockOn = vi.fn(() => () => {});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getPeerProfile: mockGetPeerProfile,
    requestPeerProfile: mockRequestPeerProfile,
    on: mockOn,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockGetPeerProfile.mockResolvedValue(undefined);
  mockRequestPeerProfile.mockResolvedValue({ ok: true });
});

const baseResult = {
  nodeId: "12D3KooWResult",
  ownerId: "envoy:owner:bob",
  displayName: "Bob",
  username: "bob",
  bio: "Likes music",
  interests: ["music"],
  profileVisibility: "public" as const,
  trustLevel: "public" as const,
  signedRecordValid: true,
};

describe("PeerResultCard — sent state UX", () => {
  it("renders the resend button alongside the waiting badge when helloState='sent'", () => {
    render(
      <I18nTestProvider>
        <PeerResultCard result={baseResult} index={0} helloState="sent" onSayHello={() => {}} />
      </I18nTestProvider>,
    );
    // The badge is still the primary visual signal.
    expect(screen.getByText(/waiting for them to accept/i)).toBeDefined();
    // New affordance: a resend button next to the badge.
    const resendBtn = screen.getByRole("button", { name: /^resend$/i });
    expect(resendBtn).toBeDefined();
  });

  it("calls onSayHello with the result ownerId when the resend button is clicked", () => {
    const onSayHello = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nTestProvider>
        <PeerResultCard result={baseResult} index={0} helloState="sent" onSayHello={onSayHello} />
      </I18nTestProvider>,
    );
    const resendBtn = screen.getByRole("button", { name: /^resend$/i });
    fireEvent.click(resendBtn);
    expect(onSayHello).toHaveBeenCalledTimes(1);
    expect(onSayHello).toHaveBeenCalledWith("envoy:owner:bob");
  });

  it("renders 'Connected' when helloState='connected'", () => {
    render(
      <I18nTestProvider>
        <PeerResultCard result={baseResult} index={0} helloState="connected" onSayHello={() => {}} />
      </I18nTestProvider>,
    );
    expect(screen.getByText(/connected/i)).toBeDefined();
    // No resend button in the connected state — the bond is established.
    expect(screen.queryByRole("button", { name: /^resend$/i })).toBeNull();
  });

  it("renders the 'Say hello' button when helloState='none'", () => {
    render(
      <I18nTestProvider>
        <PeerResultCard result={baseResult} index={0} helloState="none" onSayHello={() => {}} />
      </I18nTestProvider>,
    );
    const btn = screen.getByRole("button", { name: /say hello/i });
    expect(btn).toBeDefined();
    // No resend button in the initial state — there is nothing to resend yet.
    expect(screen.queryByRole("button", { name: /^resend$/i })).toBeNull();
  });

  it("exposes a tooltip explaining the waiting state on the badge", () => {
    render(
      <I18nTestProvider>
        <PeerResultCard result={baseResult} index={0} helloState="sent" onSayHello={() => {}} />
      </I18nTestProvider>,
    );
    const badge = screen.getByText(/waiting for them to accept/i);
    expect(badge.getAttribute("title")).toMatch(/accept on their side/i);
  });
});

describe("FriendSuggestionsPanel — sent state UX", () => {
  // filterFriendSuggestions requires trustLevel === "unknown" and
  // discoveryMatchCount > 0; that's how the panel decides whether to render
  // an entry at all.
  const baseEntry: MorningReportEntry = {
    ownerId: "envoy:owner:carol",
    peerId: "12D3KooWCarol",
    trustLevel: "unknown",
    score: 0.5,
    reason: "shared interest in art",
    discoveryMatchCount: 2,
  };

  it("renders the resend button alongside the waiting badge when the friend is in 'sent' state", () => {
    const onSayHello = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nTestProvider>
        <FriendSuggestionsPanel
          entries={[baseEntry]}
          bonds={[]}
          outboundHellos={new Set(["envoy:owner:carol"])}
          onSayHello={onSayHello}
        />
      </I18nTestProvider>,
    );
    expect(screen.getByText(/waiting for them to accept/i)).toBeDefined();
    const resendBtn = screen.getByRole("button", { name: /resend/i });
    expect(resendBtn).toBeDefined();
    fireEvent.click(resendBtn);
    expect(onSayHello).toHaveBeenCalledWith("envoy:owner:carol");
  });

  it("renders the 'Say hello' button when the friend is in 'none' state", () => {
    render(
      <I18nTestProvider>
        <FriendSuggestionsPanel
          entries={[baseEntry]}
          bonds={[]}
          outboundHellos={new Set()}
          onSayHello={vi.fn()}
        />
      </I18nTestProvider>,
    );
    expect(screen.getByRole("button", { name: /say hello/i })).toBeDefined();
  });

  it("renders nothing for entries that are already bonded (panel filters them out)", () => {
    const bondedRecord = {
      peerOwnerId: "envoy:owner:carol",
      libp2pPeerId: "12D3KooWCarol",
    };
    const { container } = render(
      <I18nTestProvider>
        <FriendSuggestionsPanel
          entries={[baseEntry]}
          bonds={[bondedRecord as never]}
          outboundHellos={new Set()}
          onSayHello={vi.fn()}
        />
      </I18nTestProvider>,
    );
    // The panel shows bonded contacts elsewhere (ContactList), not here. So an
    // already-bonded entry should produce no friend-suggestion card.
    expect(container.querySelector(".friend-suggestion-card")).toBeNull();
  });
});