/**
 * @vitest-environment jsdom
 *
 * Phase 45 Pass 3 — Browser Bazaar tab.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const libraryRead = vi.fn();
const listFeedNotifications = vi.fn();
const requestAgentCard = vi.fn();
const searchPeers = vi.fn();
const runCapabilityDiscovery = vi.fn();
const listAgentCards = vi.fn();
const on = vi.fn(() => () => undefined);

beforeEach(() => {
  listFeedNotifications.mockResolvedValue([]);
  requestAgentCard.mockResolvedValue({ ok: true });
  searchPeers.mockResolvedValue([]);
  runCapabilityDiscovery.mockResolvedValue(undefined);
  listAgentCards.mockResolvedValue([]);
  on.mockReturnValue(() => undefined);
  libraryRead.mockResolvedValue({
    status: "ok",
    peerOwnerId: "envoy:owner:alice",
    libp2pPeerId: "12D3KooWAlice",
    body: "# Hello",
    contentType: "text/markdown",
    byteLength: 7,
    latencyMs: 1,
  });
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    libraryRead,
    listFeedNotifications,
    requestAgentCard,
    searchPeers,
    runCapabilityDiscovery,
    listAgentCards,
    on,
    isConnected: true,
  }),
  useAgentCards: () => [
    {
      ownerId: "envoy:owner:alice",
      publicTopics: ["publish:photography"],
      webContentRoot: "envoy://envoy:owner:alice/profile",
    },
  ],
  useIsInProcessMobileNode: () => false,
  useTransportWsOpen: () => true,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [
      {
        peerOwnerId: "envoy:owner:alice",
        displayName: "Alice",
        level: "direct",
      },
    ],
    humanProfile: { ownerId: "envoy:owner:self" },
  }),
}));

vi.mock("../../src/hooks/useToast.js", () => ({
  useToast: () => ({ showToast: vi.fn(), toasts: [] }),
  useToastOptional: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import {
  BrowserBazaarView,
  publishSearchTopic,
} from "../../src/components/views/BrowserBazaarView.js";
import { BrowserView } from "../../src/components/views/BrowserView.js";
import { webContentUrl } from "../../src/lib/web-content-urls.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("publishSearchTopic", () => {
  it("slugifies free text into publish: topics", () => {
    expect(publishSearchTopic("Photography")).toBe("publish:photography");
    expect(publishSearchTopic("  cook books! ")).toBe("publish:cook-books");
    expect(publishSearchTopic("publish:Travel")).toBe("publish:travel");
    expect(publishSearchTopic("   ")).toBe("");
  });

  it("keeps CJK topic tags", () => {
    expect(publishSearchTopic("摄影")).toBe("publish:摄影");
    expect(publishSearchTopic("publish:烹饪")).toBe("publish:烹饪");
    expect(publishSearchTopic("摄影 tips")).toBe("publish:摄影-tips");
  });
});

describe("BrowserBazaarView", () => {
  it("loads contact feed and shelves on mount", async () => {
    listFeedNotifications.mockResolvedValue([
      {
        id: "n1",
        receivedAt: "2026-07-01T00:00:00.000Z",
        messageId: "m1",
        publisherOwnerId: "envoy:owner:alice",
        publishedAt: "2026-07-01T00:00:00.000Z",
        title: "Sunset notes",
        url: "envoy://envoy:owner:alice/blog/posts/sunset.md",
        listingUrl: "envoy://envoy:owner:alice/blog/",
        kind: "blog",
        visibility: "bonded",
        senderPeerId: "12D3KooWAlice",
      },
    ]);

    const onOpenUrl = vi.fn();
    renderWithI18n(<BrowserBazaarView onOpenUrl={onOpenUrl} />);

    await waitFor(() => {
      expect(listFeedNotifications).toHaveBeenCalled();
    });

    expect(screen.getByTestId("bazaar-feed-list")).toBeTruthy();
    expect(screen.getByText("Sunset notes")).toBeTruthy();
    expect(screen.getByTestId("bazaar-shelves")).toBeTruthy();
    expect(screen.getByText("Alice")).toBeTruthy();

    fireEvent.click(screen.getByTestId("bazaar-feed-open"));
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:alice/blog/posts/sunset.md");
    expect(onOpenUrl).not.toHaveBeenCalledWith("envoy://envoy:owner:alice/blog/");
  });

  it("shows empty feed copy when bonded contacts have no posts", async () => {
    renderWithI18n(<BrowserBazaarView onOpenUrl={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("bazaar-feed-empty")).toBeTruthy();
    });
  });

  it("searches publish topics and opens profile shortcuts", async () => {
    searchPeers.mockResolvedValue([
      {
        nodeId: "12D3KooWBob",
        ownerId: "envoy:owner:bob",
        displayName: "Bob",
        interests: ["photography"],
        profileVisibility: "public",
      },
    ]);

    const onOpenUrl = vi.fn();
    renderWithI18n(<BrowserBazaarView onOpenUrl={onOpenUrl} />);

    fireEvent.change(screen.getByTestId("bazaar-topic-input"), {
      target: { value: "photography" },
    });
    fireEvent.click(screen.getByTestId("bazaar-topic-search"));

    await waitFor(() => {
      expect(searchPeers).toHaveBeenCalledWith({
        topic: "publish:photography",
        maxResults: 20,
      });
    });

    expect(screen.getByTestId("bazaar-topic-results")).toBeTruthy();
    fireEvent.click(
      screen.getByTestId("bazaar-topic-results").querySelector("button")!,
    );
    expect(onOpenUrl).toHaveBeenCalledWith(webContentUrl("envoy:owner:bob", "profile"));
  });
});

describe("BrowserView Bazaar mode", () => {
  it("switches Browse | Bazaar and opens feed items back into Browse", async () => {
    listFeedNotifications.mockResolvedValue([
      {
        id: "n1",
        receivedAt: "2026-07-01T00:00:00.000Z",
        messageId: "m1",
        publisherOwnerId: "envoy:owner:alice",
        publishedAt: "2026-07-01T00:00:00.000Z",
        title: "Hello mesh",
        url: "envoy://envoy:owner:alice/blog/hello",
        kind: "blog",
        visibility: "bonded",
        senderPeerId: "12D3KooWAlice",
      },
    ]);

    renderWithI18n(<BrowserView />);
    expect(screen.getByTestId("browser-mode-browse")).toBeTruthy();
    expect(screen.getByTestId("browser-address-bar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("browser-mode-bazaar"));
    await waitFor(() => {
      expect(screen.getByTestId("browser-bazaar")).toBeTruthy();
    });
    expect(screen.queryByTestId("browser-address-bar")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("Hello mesh")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("bazaar-feed-open"));
    await waitFor(() => {
      expect(screen.getByTestId("browser-address-bar")).toBeTruthy();
      expect((screen.getByTestId("browser-address-bar") as HTMLInputElement).value).toBe(
        "envoy://envoy:owner:alice/blog/hello",
      );
    });
  });
});
