/**
 * Regression: opening Inbox must clear the unread badge without wiping the
 * peer-Feed timeline (same store powers Content → Feed / Explore → Following).
 */
import { describe, expect, it, vi } from "vitest";

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
};
vi.mock("node:fs/promises", () => mockFs);

const {
  dismissAllFeedNotifyInboxItems,
  dismissFeedNotifyInboxItem,
  isFeedNotifyUnread,
} = await import("../src/feed-notify-store.js");

describe("dismissAllFeedNotifyInboxItems", () => {
  it("returns [] without writing when the inbox is already empty", async () => {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]) as never);
    const result = await dismissAllFeedNotifyInboxItems("/tmp/fake-profile");
    expect(result).toEqual([]);
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("marks all rows read instead of deleting them", async () => {
    const seeded = [
      {
        id: "a",
        messageId: "m1",
        url: "envoy://x/feeds/1.md",
        kind: "feed",
        receivedAt: "2026-07-01T00:00:00.000Z",
        publisherOwnerId: "envoy:owner:x",
        publishedAt: "2026-07-01T00:00:00.000Z",
        title: "One",
        visibility: "bonded",
        senderPeerId: "12D3KooW",
      },
      {
        id: "b",
        messageId: "m2",
        url: "envoy://y/feeds/2.md",
        kind: "feed",
        receivedAt: "2026-07-01T00:00:00.000Z",
        publisherOwnerId: "envoy:owner:y",
        publishedAt: "2026-07-01T00:00:00.000Z",
        title: "Two",
        visibility: "bonded",
        senderPeerId: "12D3KooW",
        readAt: "2026-07-01T01:00:00.000Z",
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    mockFs.writeFile.mockResolvedValueOnce(undefined as never);
    mockFs.rename.mockResolvedValueOnce(undefined as never);
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);

    const result = await dismissAllFeedNotifyInboxItems("/tmp/fake-profile");
    expect(result).toHaveLength(2);
    expect(result.every((row) => !isFeedNotifyUnread(row))).toBe(true);
    expect(mockFs.writeFile).toHaveBeenCalledOnce();
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string) as Array<{
      id: string;
      readAt?: string;
    }>;
    expect(written).toHaveLength(2);
    expect(written[0]?.readAt).toBeTruthy();
    expect(written[1]?.readAt).toBe("2026-07-01T01:00:00.000Z");
  });

  it("marks a single row read without removing it", async () => {
    const seeded = [
      {
        id: "a",
        messageId: "m1",
        url: "envoy://x/feeds/1.md",
        kind: "feed",
        receivedAt: "2026-07-01T00:00:00.000Z",
        publisherOwnerId: "envoy:owner:x",
        publishedAt: "2026-07-01T00:00:00.000Z",
        title: "One",
        visibility: "bonded",
        senderPeerId: "12D3KooW",
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    mockFs.writeFile.mockResolvedValueOnce(undefined as never);
    mockFs.rename.mockResolvedValueOnce(undefined as never);
    mockFs.mkdir.mockResolvedValueOnce(undefined as never);

    const result = await dismissFeedNotifyInboxItem("/tmp/fake-profile", "a");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("a");
    expect(result[0]?.readAt).toBeTruthy();
  });
});
