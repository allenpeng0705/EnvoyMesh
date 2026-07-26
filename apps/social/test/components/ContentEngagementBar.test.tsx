/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ContentEngagementBar } from "../../src/components/ContentEngagementBar.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getContentEngagement = vi.fn();
const toggleContentStar = vi.fn();
const addContentComment = vi.fn();
const removeContentComment = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getContentEngagement,
    toggleContentStar,
    addContentComment,
    removeContentComment,
    getPeerProfile: vi.fn().mockResolvedValue(undefined),
    requestPeerProfile: vi.fn().mockResolvedValue(undefined),
    readLibraryItemContent: vi.fn().mockRejectedValue(new Error("no photo")),
    on: () => () => {},
  }),
}));

vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: ({ fallbackLabel }: { fallbackLabel: string }) => (
    <span data-testid="peer-avatar">{fallbackLabel[0]}</span>
  ),
}));

vi.mock("../../src/components/ProfilePhotoAvatar.js", () => ({
  ProfilePhotoAvatar: ({ fallbackLabel }: { fallbackLabel: string }) => (
    <span data-testid="self-avatar">{fallbackLabel[0]}</span>
  ),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [{ peerOwnerId: "envoy:owner:bob", displayName: "Bob" }],
    humanProfile: { ownerId: "envoy:owner:me", displayName: "Me" },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentEngagementBar", () => {
  it("shows Moments-style star names and ··· menu actions", async () => {
    getContentEngagement.mockResolvedValue({
      url: "envoy://envoy:owner:me/feeds/a.md",
      starCount: 2,
      starredByMe: true,
      starOwnerIds: ["envoy:owner:bob", "envoy:owner:me"],
      commentCount: 1,
      comments: [
        {
          id: "c1",
          authorOwnerId: "envoy:owner:bob",
          text: "Nice",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    toggleContentStar.mockResolvedValue({
      url: "envoy://envoy:owner:me/feeds/a.md",
      starCount: 1,
      starredByMe: false,
      starOwnerIds: ["envoy:owner:bob"],
      commentCount: 1,
      comments: [
        {
          id: "c1",
          authorOwnerId: "envoy:owner:bob",
          text: "Nice",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    renderWithI18n(<ContentEngagementBar url="envoy://envoy:owner:me/feeds/a.md" />);

    await waitFor(() => {
      expect(screen.getByTestId("content-engagement-moments")).toBeTruthy();
    });
    expect(screen.getByTestId("content-engagement-stars").textContent).toMatch(/Bob/);
    expect(screen.getByTestId("content-engagement-stars").textContent).toMatch(/You/);
    expect(screen.getByText(/Nice/)).toBeTruthy();
    expect(screen.getByTestId("content-engagement-more")).toBeTruthy();

    fireEvent.click(screen.getByTestId("content-engagement-more"));
    expect(screen.getByTestId("content-engagement-menu")).toBeTruthy();
    fireEvent.click(screen.getByTestId("content-engagement-like"));
    await waitFor(() => {
      expect(toggleContentStar).toHaveBeenCalled();
    });
  });
});
