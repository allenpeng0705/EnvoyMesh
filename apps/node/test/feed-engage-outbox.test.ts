/**
 * feed.engage outbox — enqueue / coalesce / ordered flush list.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
};
vi.mock("node:fs/promises", () => mockFs);

const {
  enqueueFeedEngageOutboxItem,
  removeFeedEngageOutboxItem,
  listFeedEngageOutboxForRecipient,
  loadFeedEngageOutbox,
  MAX_OUTBOX_AGE_MS,
  pruneFeedEngageOutboxItems,
} = await import("../src/feed-engage-outbox.js");

function recentIso(offsetSec = 0): string {
  return new Date(Date.now() - offsetSec * 1000).toISOString();
}

describe("feed-engage-outbox", () => {
  beforeEach(() => {
    mockFs.readFile.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.rename.mockReset();
    mockFs.mkdir.mockReset();
    mockFs.unlink.mockReset();
    mockFs.mkdir.mockResolvedValue(undefined as never);
    mockFs.writeFile.mockResolvedValue(undefined as never);
    mockFs.rename.mockResolvedValue(undefined as never);
    mockFs.unlink.mockResolvedValue(undefined as never);
  });

  it("returns [] when missing", async () => {
    mockFs.readFile.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(loadFeedEngageOutbox("/tmp/p")).resolves.toEqual([]);
  });

  it("coalesces star/unstar for the same url", async () => {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]) as never);
    await enqueueFeedEngageOutboxItem("/tmp/p", {
      targetOwnerId: "envoy:owner:win",
      url: "envoy://envoy:owner:win/feeds/a.md",
      action: "star",
      actorOwnerId: "envoy:owner:mac",
    });
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string);
    expect(written).toHaveLength(1);

    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(written) as never);
    await enqueueFeedEngageOutboxItem("/tmp/p", {
      targetOwnerId: "envoy:owner:win",
      url: "envoy://envoy:owner:win/feeds/a.md",
      action: "unstar",
      actorOwnerId: "envoy:owner:mac",
    });
    const written2 = JSON.parse(mockFs.writeFile.mock.calls[1]![1] as string);
    expect(written2).toHaveLength(1);
    expect(written2[0].action).toBe("unstar");
  });

  it("drops pending comment when uncomment arrives first", async () => {
    const seeded = [
      {
        targetOwnerId: "envoy:owner:win",
        url: "envoy://envoy:owner:win/feeds/a.md",
        action: "comment",
        actorOwnerId: "envoy:owner:mac",
        text: "hi",
        commentId: "c1",
        enqueuedAt: recentIso(),
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    await enqueueFeedEngageOutboxItem("/tmp/p", {
      targetOwnerId: "envoy:owner:win",
      url: "envoy://envoy:owner:win/feeds/a.md",
      action: "uncomment",
      actorOwnerId: "envoy:owner:mac",
      commentId: "c1",
    });
    expect(mockFs.unlink).toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });

  it("lists oldest-first for a recipient and remove deletes by enqueuedAt", async () => {
    const seeded = [
      {
        targetOwnerId: "envoy:owner:win",
        url: "envoy://envoy:owner:win/feeds/b.md",
        action: "star",
        actorOwnerId: "envoy:owner:mac",
        enqueuedAt: recentIso(1),
      },
      {
        targetOwnerId: "envoy:owner:win",
        url: "envoy://envoy:owner:win/feeds/a.md",
        action: "comment",
        actorOwnerId: "envoy:owner:mac",
        text: "x",
        commentId: "c1",
        enqueuedAt: recentIso(10),
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    const listed = await listFeedEngageOutboxForRecipient("/tmp/p", "envoy:owner:win");
    expect(listed.map((r) => r.url)).toEqual([
      "envoy://envoy:owner:win/feeds/a.md",
      "envoy://envoy:owner:win/feeds/b.md",
    ]);

    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    await removeFeedEngageOutboxItem("/tmp/p", seeded[1]!);
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].url).toContain("feeds/b.md");
  });

  it("prune drops rows older than MAX_OUTBOX_AGE_MS", () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const staleAt = new Date(now - MAX_OUTBOX_AGE_MS - 60_000).toISOString();
    const freshAt = new Date(now - 60_000).toISOString();
    const pruned = pruneFeedEngageOutboxItems(
      [
        {
          targetOwnerId: "envoy:owner:win",
          url: "envoy://envoy:owner:win/feeds/old.md",
          action: "star",
          actorOwnerId: "envoy:owner:mac",
          enqueuedAt: staleAt,
        },
        {
          targetOwnerId: "envoy:owner:win",
          url: "envoy://envoy:owner:win/feeds/new.md",
          action: "star",
          actorOwnerId: "envoy:owner:mac",
          enqueuedAt: freshAt,
        },
      ],
      now,
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.url).toContain("new.md");
  });
});
