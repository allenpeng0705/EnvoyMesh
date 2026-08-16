/**
 * @vitest-environment jsdom
 *
 * Explore → People (non-bonded discovery + mesh sample).
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
const sendHello = vi.fn();
const on = vi.fn(() => () => undefined);

beforeEach(() => {
  listFeedNotifications.mockResolvedValue([]);
  requestAgentCard.mockResolvedValue({ ok: true });
  searchPeers.mockResolvedValue([]);
  runCapabilityDiscovery.mockResolvedValue(undefined);
  listAgentCards.mockResolvedValue([]);
  sendHello.mockResolvedValue(undefined);
  libraryRead.mockResolvedValue({
    status: "not_found",
    peerOwnerId: "envoy:owner:x",
    libp2pPeerId: "12D3",
    latencyMs: 1,
  });
  on.mockReturnValue(() => undefined);
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    libraryRead,
    listFeedNotifications,
    requestAgentCard,
    searchPeers,
    runCapabilityDiscovery,
    listAgentCards,
    getPeerProfile: vi.fn(async () => null),
    requestPeerProfile: vi.fn(async () => undefined),
    on,
    isConnected: true,
  }),
  useAgentCards: () => [],
  useTransportWsOpen: () => true,
}));

const EMPTY_DISCOVERED: never[] = [];

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [
      {
        peerOwnerId: "envoy:owner:alice",
        displayName: "Alice",
        level: "direct",
      },
    ],
    humanProfile: {
      ownerId: "envoy:owner:self",
      displayName: "Self",
      hobbies: ["music"],
      knowledge: [],
    },
    discoveredPeers: EMPTY_DISCOVERED,
    sendHello,
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
import { clearPeopleSessionCache, savePeopleSessionCache } from "../../src/lib/people-session-cache.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  clearPeopleSessionCache();
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

describe("BrowserBazaarView People", () => {
  it("samples the mesh on mount and excludes bonded contacts", async () => {
    searchPeers.mockImplementation(async (q: { topic?: string; interests?: string[] }) => {
      if (q.topic === "capability:envoymesh.web-content") {
        return [
          {
            nodeId: "12D3KooWAlice",
            ownerId: "envoy:owner:alice",
            displayName: "Alice",
            interests: [],
            profileVisibility: "public",
          },
          {
            nodeId: "12D3KooWBob",
            ownerId: "envoy:owner:bob",
            displayName: "Bob",
            interests: ["photography"],
            profileVisibility: "public",
          },
        ];
      }
      return [];
    });

    renderWithI18n(<BrowserBazaarView onOpenUrl={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("people-results")).toBeTruthy();
    });
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("searches publish topics and opens profile / blog / hello", async () => {
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

    await waitFor(() => expect(searchPeers).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("people-search-input"), {
      target: { value: "photography" },
    });
    fireEvent.click(screen.getByTestId("people-search-go"));

    await waitFor(() => {
      expect(searchPeers).toHaveBeenCalledWith({
        topic: "publish:photography",
        maxResults: 20,
      });
    });

    expect(screen.getByTestId("people-results")).toBeTruthy();
    fireEvent.click(screen.getByTestId("people-open-profile"));
    expect(onOpenUrl).toHaveBeenCalledWith(webContentUrl("envoy:owner:bob", "profile"));
    fireEvent.click(screen.getByTestId("people-open-blog"));
    expect(onOpenUrl).toHaveBeenCalledWith(webContentUrl("envoy:owner:bob", "blog"));
    fireEvent.click(screen.getByTestId("people-say-hello"));
    await waitFor(() => {
      expect(sendHello).toHaveBeenCalled();
    });
  });

  it("falls back to mesh sample when topic search is empty", async () => {
    searchPeers.mockImplementation(async (q: { topic?: string }) => {
      if (q.topic === "publish:empty-topic") return [];
      if (q.topic === "capability:envoymesh.web-content") {
        return [
          {
            nodeId: "12D3KooWCarol",
            ownerId: "envoy:owner:carol",
            displayName: "Carol",
            interests: [],
            profileVisibility: "public",
          },
        ];
      }
      return [];
    });

    renderWithI18n(<BrowserBazaarView onOpenUrl={vi.fn()} />);
    await waitFor(() => expect(searchPeers).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("people-search-input"), {
      target: { value: "empty-topic" },
    });
    fireEvent.click(screen.getByTestId("people-search-go"));

    await waitFor(() => {
      expect(screen.getByText("Carol")).toBeTruthy();
      expect(screen.getByTestId("people-status").textContent).toMatch(/No matches|showing other/i);
    });
  });

  it("loads public blog posts and opens them from the People card", async () => {
    searchPeers.mockImplementation(async (q: { topic?: string }) => {
      if (q.topic === "capability:envoymesh.web-content") {
        return [
          {
            nodeId: "12D3KooWBob",
            ownerId: "envoy:owner:bob",
            displayName: "Bob",
            interests: ["photography"],
            profileVisibility: "public",
          },
        ];
      }
      return [];
    });
    libraryRead.mockResolvedValue({
      status: "ok",
      peerOwnerId: "envoy:owner:bob",
      libp2pPeerId: "12D3KooWBob",
      body: `# Blog

- [Street Light](envoy://envoy:owner:bob/blog/posts/street.md) (2026-07-20) — dusk
`,
      contentType: "text/markdown",
      byteLength: 80,
      latencyMs: 1,
    });

    const onOpenUrl = vi.fn();
    renderWithI18n(<BrowserBazaarView onOpenUrl={onOpenUrl} />);

    await waitFor(() => {
      expect(screen.getByTestId("people-blog-preview")).toBeTruthy();
    });
    expect(libraryRead).toHaveBeenCalledWith(
      expect.objectContaining({
        targetOwnerId: "envoy:owner:bob",
        path: "blog/index.md",
      }),
    );
    fireEvent.click(screen.getByTestId("people-blog-post"));
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:bob/blog/posts/street.md");
  });
});

describe("BrowserView Explore modes", () => {
  it("defaults to People mode", async () => {
    searchPeers.mockResolvedValue([]);
    renderWithI18n(<BrowserView />);
    expect(screen.getByTestId("browser-mode-people")).toBeTruthy();
    expect(screen.getByTestId("browser-people")).toBeTruthy();
    expect(screen.queryByTestId("browser-address-bar")).toBeNull();
  });

  it("keeps People results when switching Open → People", async () => {
    searchPeers.mockImplementation(async (q: { topic?: string }) => {
      if (q.topic === "capability:envoymesh.web-content") {
        return [
          {
            nodeId: "12D3KooWBob",
            ownerId: "envoy:owner:bob",
            displayName: "Bob",
            interests: [],
            profileVisibility: "public",
          },
        ];
      }
      return [];
    });

    renderWithI18n(<BrowserView />);
    await waitFor(() => {
      expect(screen.getByText("Bob")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("browser-mode-open"));
    expect(screen.getByTestId("browser-address-bar")).toBeTruthy();
    // People pane stays mounted (hidden) so results survive tab switches.
    expect(screen.getByTestId("browser-people-pane").hidden).toBe(true);

    fireEvent.click(screen.getByTestId("browser-mode-people"));
    expect(screen.getByTestId("browser-people-pane").hidden).toBe(false);
    expect(screen.getByText("Bob")).toBeTruthy();
  });

  it("restores cached People results on remount then refreshes", async () => {
    savePeopleSessionCache({
      searchMode: "topic",
      query: "",
      results: [
        {
          nodeId: "12D3KooWCached",
          ownerId: "envoy:owner:cached",
          displayName: "Cached Peer",
          interests: [],
          profileVisibility: "public",
        },
      ],
      resultSource: "sample",
      error: null,
      blogPreviews: {},
    });
    searchPeers.mockImplementation(async () => [
      {
        nodeId: "12D3KooWFresh",
        ownerId: "envoy:owner:fresh",
        displayName: "Fresh Peer",
        interests: [],
        profileVisibility: "public",
      },
    ]);

    renderWithI18n(<BrowserBazaarView onOpenUrl={vi.fn()} />);
    expect(screen.getByText("Cached Peer")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Fresh Peer")).toBeTruthy();
    });
  });
});
