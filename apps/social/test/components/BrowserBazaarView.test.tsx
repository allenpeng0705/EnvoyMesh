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
    getPeerProfile: vi.fn(async () => null),
    requestPeerProfile: vi.fn(async () => undefined),
    on,
    isConnected: true,
  }),
  useAgentCards: () => [],
  useIsInProcessMobileNode: () => false,
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
});

describe("BrowserView Explore modes", () => {
  it("defaults to People mode", async () => {
    searchPeers.mockResolvedValue([]);
    renderWithI18n(<BrowserView />);
    expect(screen.getByTestId("browser-mode-people")).toBeTruthy();
    expect(screen.getByTestId("browser-people")).toBeTruthy();
    expect(screen.queryByTestId("browser-address-bar")).toBeNull();
  });
});
