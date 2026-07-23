/**
 * @vitest-environment jsdom
 * Light UI test: Inbox shows feed.notify rows and Open in Browser.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { FeedNotification } from "@envoymesh/api";
import { InboxView } from "../../src/components/views/InboxView.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const openBrowserAt = vi.fn();
const dismissFeed = vi.fn(async () => undefined);

const sampleNotify: FeedNotification = {
  id: "feed-1",
  receivedAt: new Date().toISOString(),
  messageId: "msg-1",
  publisherOwnerId: "envoy:owner:alice",
  publishedAt: new Date().toISOString(),
  title: "Alice’s photo wall",
  url: "envoy://envoy:owner:alice/photos/wall/",
  kind: "photo",
  visibility: "bonded",
  summary: "New photos",
  tags: ["travel"],
  senderPeerId: "envoy_alice",
};

let feedItems: FeedNotification[] = [];

vi.mock("../../src/lib/browser-nav.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    openBrowserAt: (...args: unknown[]) => openBrowserAt(...args),
  };
});

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    pendingHellOs: [],
    pendingIntroProposals: [],
    pendingMessages: [],
    humanProfile: null,
    acceptHello: vi.fn(),
    declineHello: vi.fn(),
    approveIntroCommitment: vi.fn(),
    declineIntroProposal: vi.fn(),
    sendHello: vi.fn(),
    clearPendingMessages: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({}),
  useShareOffers: () => ({ offers: [] }),
  useAgentShareProposals: () => ({ proposals: [], dismiss: vi.fn() }),
  usePendingApprovals: () => ({ items: [], approve: vi.fn(), reject: vi.fn() }),
  useFeedNotifications: () => ({ items: feedItems, dismiss: dismissFeed }),
}));

describe("Inbox feed.notify (Phase 45E)", () => {
  beforeEach(() => {
    feedItems = [sampleNotify];
    openBrowserAt.mockClear();
    dismissFeed.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders feed row and opens Browser", () => {
    renderWithI18n(
      <ToastProvider>
        <InboxView />
      </ToastProvider>,
    );
    expect(screen.getByTestId("feed-notify-row")).toBeTruthy();
    expect(screen.getByText("Alice’s photo wall")).toBeTruthy();
    fireEvent.click(screen.getByTestId("feed-notify-open-browser"));
    expect(openBrowserAt).toHaveBeenCalledWith(sampleNotify.url);
    expect(dismissFeed).toHaveBeenCalledWith("feed-1");
  });
});
