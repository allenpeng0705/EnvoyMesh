/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { FeedView } from "../../src/components/views/FeedView.js";

const listFeedPosts = vi.fn();
const listFeedNotifications = vi.fn();
const publishWebContentEntry = vi.fn();
const deleteWebContentEntry = vi.fn();
const on = vi.fn(() => () => undefined);

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listFeedPosts,
    listFeedNotifications,
    publishWebContentEntry,
    deleteWebContentEntry,
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
  FeedMediaGrid: () => null,
}));

describe("FeedView", () => {
  beforeEach(() => {
    listFeedPosts.mockReset();
    listFeedNotifications.mockReset();
    publishWebContentEntry.mockReset();
    deleteWebContentEntry.mockReset();
    listFeedPosts.mockResolvedValue([
      {
        path: "feeds/hello.md",
        url: "envoy://envoy:owner:alice/feeds/hello.md",
        title: "Hello",
        bodyPreview: "My update",
        publishedAt: "2026-07-26T01:00:00.000Z",
        visibility: "bonded",
        imageUrls: [],
        publisherOwnerId: "envoy:owner:alice",
      },
    ]);
    listFeedNotifications.mockResolvedValue([
      {
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
        senderPeerId: "peer-bob",
      },
    ]);
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

  it("requires selecting contacts and passes contactIds", async () => {
    renderWithI18n(<FeedView />);
    await screen.findByTestId("feed-timeline");
    fireEvent.click(screen.getByTestId("feed-compose-open"));
    fireEvent.change(screen.getByTestId("feed-compose-text"), {
      target: { value: "For Bob only" },
    });
    fireEvent.change(screen.getByTestId("feed-visibility"), {
      target: { value: "contacts" },
    });
    expect(screen.getByTestId("feed-contacts")).toBeTruthy();
    expect((screen.getByTestId("feed-publish") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("feed-contact-checkbox"));
    expect((screen.getByTestId("feed-publish") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("feed-publish"));
    await waitFor(() => {
      expect(publishWebContentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          template: "feed-post",
          visibility: "contacts",
          contactIds: ["envoy:owner:bob"],
          body: "For Bob only",
        }),
      );
    });
  });

  it("deletes an own feed post", async () => {
    renderWithI18n(<FeedView />);
    await screen.findByTestId("feed-timeline");
    fireEvent.click(screen.getByTestId("feed-delete"));
    await waitFor(() => {
      expect(deleteWebContentEntry).toHaveBeenCalledWith({ path: "feeds/hello.md" });
    });
  });
});
