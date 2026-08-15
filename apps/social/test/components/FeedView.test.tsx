/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { FeedView } from "../../src/components/views/FeedView.js";

const listFeedTimeline = vi.fn();
const publishWebContentEntry = vi.fn();
const deleteWebContentEntry = vi.fn();
const libraryRead = vi.fn();
const on = vi.fn(() => () => undefined);

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listFeedTimeline,
    publishWebContentEntry,
    deleteWebContentEntry,
    libraryRead,
    on,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [{ peerOwnerId: "envoy:owner:bob", level: "direct", displayName: "Bob" }],
    humanProfile: { ownerId: "envoy:owner:alice", displayName: "Alice" },
  }),
}));

vi.mock("../../src/components/ProfilePhotoAvatar.js", () => ({
  ProfilePhotoAvatar: ({ fallbackLabel }: { fallbackLabel: string }) => (
    <span data-testid="profile-avatar">{fallbackLabel}</span>
  ),
}));

vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: ({ fallbackLabel }: { fallbackLabel: string }) => (
    <span data-testid="peer-avatar">{fallbackLabel}</span>
  ),
}));

vi.mock("../../src/components/FeedMediaGrid.js", () => ({
  FeedMediaGrid: ({ urls }: { urls: string[] }) => (
    <div data-testid="feed-media-grid">{urls.join(",")}</div>
  ),
}));

vi.mock("../../src/components/ContentEngagementBar.js", () => ({
  ContentEngagementBar: ({ meta, leading }: { meta?: React.ReactNode; leading?: React.ReactNode }) => (
    <div data-testid="engagement">
      {leading}
      {meta}
    </div>
  ),
}));

describe("FeedView", () => {
  beforeEach(() => {
    listFeedTimeline.mockReset();
    publishWebContentEntry.mockReset();
    deleteWebContentEntry.mockReset();
    libraryRead.mockReset();
    on.mockReset();
    on.mockImplementation(() => () => undefined);
    libraryRead.mockResolvedValue({ status: "ok", body: "" });
    listFeedTimeline.mockResolvedValue({
      items: [
        {
          source: "own",
          key: "own:feeds/hello.md",
          path: "feeds/hello.md",
          url: "envoy://envoy:owner:alice/feeds/hello.md",
          title: "Hello",
          body: "My update",
          publishedAt: "2026-07-26T01:00:00.000Z",
          visibility: "bonded",
          imageUrls: [],
          publisherOwnerId: "envoy:owner:alice",
        },
        {
          source: "peer",
          key: "peer:n1",
          url: "envoy://envoy:owner:bob/feeds/bob.md",
          title: "Bob post",
          body: "From Bob",
          publishedAt: "2026-07-26T02:00:00.000Z",
          visibility: "bonded",
          imageUrls: [],
          publisherOwnerId: "envoy:owner:bob",
        },
      ],
      hasMore: true,
      nextBefore: "2026-07-26T01:00:00.000Z",
      nextBeforeUrl: "envoy://envoy:owner:alice/feeds/hello.md",
    });
    publishWebContentEntry.mockResolvedValue({
      path: "feeds/new.md",
      url: "envoy://envoy:owner:alice/feeds/new.md",
      title: "New",
      visibility: "bonded",
    });
    deleteWebContentEntry.mockResolvedValue({ path: "feeds/hello.md", deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders own and bonded feed posts", async () => {
    renderWithI18n(<FeedView />);
    expect(await screen.findByTestId("feed-timeline")).toBeTruthy();
    expect(screen.getByText("My update")).toBeTruthy();
    expect(screen.getByText("From Bob")).toBeTruthy();
    expect(screen.getAllByText("Bob").length).toBeGreaterThan(0);
  });

  it("requests the next page when Load more is clicked", async () => {
    listFeedTimeline.mockImplementation(async (params?: { before?: string }) => {
      if (params?.before) {
        return {
          items: [
            {
              source: "own",
              key: "own:feeds/old.md",
              path: "feeds/old.md",
              url: "envoy://envoy:owner:alice/feeds/old.md",
              title: "Old",
              body: "Older post",
              publishedAt: "2026-07-20T00:00:00.000Z",
              visibility: "bonded",
              imageUrls: [],
              publisherOwnerId: "envoy:owner:alice",
            },
          ],
          hasMore: false,
        };
      }
      return {
        items: [
          {
            source: "peer",
            key: "peer:n1",
            url: "envoy://envoy:owner:bob/feeds/bob.md",
            title: "Bob post",
            body: "From Bob",
            publishedAt: "2026-07-26T02:00:00.000Z",
            visibility: "bonded",
            imageUrls: [],
            publisherOwnerId: "envoy:owner:bob",
          },
        ],
        hasMore: true,
        nextBefore: "2026-07-26T02:00:00.000Z",
        nextBeforeUrl: "envoy://envoy:owner:bob/feeds/bob.md",
      };
    });

    renderWithI18n(<FeedView />);
    await screen.findByText("From Bob");
    fireEvent.click(await screen.findByTestId("feed-load-more"));
    await waitFor(() => {
      expect(
        listFeedTimeline.mock.calls.some(
          (call) => (call[0] as { before?: string } | undefined)?.before === "2026-07-26T02:00:00.000Z",
        ),
      ).toBe(true);
    });
  });

  it("publishes a bonded feed post from composer", async () => {
    renderWithI18n(<FeedView />);
    await screen.findByTestId("feed-timeline");
    fireEvent.click(screen.getByTestId("feed-compose-open"));
    fireEvent.change(screen.getByTestId("feed-compose-text"), {
      target: { value: "Coffee time" },
    });
    expect((screen.getByTestId("feed-visibility") as HTMLSelectElement).value).toBe("bonded");
    fireEvent.click(screen.getByTestId("feed-publish"));
    await waitFor(() => {
      expect(publishWebContentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "feed-post",
          visibility: "bonded",
          body: "Coffee time",
        }),
      );
    });
  });

  it("deletes an own post after confirm", async () => {
    renderWithI18n(<FeedView />);
    await screen.findByTestId("feed-timeline");
    fireEvent.click(screen.getByTestId("feed-delete"));
    await waitFor(() => {
      expect(deleteWebContentEntry).toHaveBeenCalledWith({ path: "feeds/hello.md" });
    });
  });

  it("enriches peer cards missing imageUrls from post markdown", async () => {
    libraryRead.mockResolvedValue({
      peerOwnerId: "envoy:owner:bob",
      libp2pPeerId: "12D3",
      status: "ok",
      body: [
        "# Bob",
        "",
        "From Bob",
        "",
        "![p](envoy://envoy:owner:bob/feeds/media/bob/0.jpg)",
        "",
      ].join("\n"),
    });
    renderWithI18n(<FeedView />);
    await screen.findByText("From Bob");
    await waitFor(() => {
      expect(libraryRead).toHaveBeenCalledWith(
        expect.objectContaining({
          targetOwnerId: "envoy:owner:bob",
          path: "feeds/bob.md",
        }),
      );
    });
    expect((await screen.findByTestId("feed-media-grid")).textContent).toContain(
      "envoy://envoy:owner:bob/feeds/media/bob/0.jpg",
    );
  });

  it("upgrades an existing timeline row when feed:notify brings imageUrls", async () => {
    const handlers = new Map<string, (data: unknown) => void>();
    on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    });
    renderWithI18n(<FeedView />);
    await screen.findByText("From Bob");
    expect(screen.queryByTestId("feed-media-grid")).toBeNull();

    handlers.get("feed:notify")?.({
      id: "n1",
      receivedAt: "2026-07-26T02:00:00.000Z",
      messageId: "m1",
      publisherOwnerId: "envoy:owner:bob",
      publishedAt: "2026-07-26T02:00:00.000Z",
      title: "Bob post",
      url: "envoy://envoy:owner:bob/feeds/bob.md",
      kind: "feed",
      visibility: "bonded",
      summary: "From Bob",
      senderPeerId: "12D3",
      imageUrls: ["envoy://envoy:owner:bob/feeds/media/bob/0.jpg"],
    });

    expect((await screen.findByTestId("feed-media-grid")).textContent).toContain(
      "envoy://envoy:owner:bob/feeds/media/bob/0.jpg",
    );
  });
});
