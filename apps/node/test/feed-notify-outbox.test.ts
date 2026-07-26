/**
 * Publisher feed.notify outbox — enqueue / dedup / cap / remove / TTL prune.
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
  enqueueFeedNotifyOutboxItem,
  removeFeedNotifyOutboxItem,
  listFeedNotifyOutboxForRecipient,
  loadFeedNotifyOutbox,
  MAX_OUTBOX_ITEMS,
  MAX_OUTBOX_AGE_MS,
  pruneFeedNotifyOutboxItems,
} = await import("../src/feed-notify-outbox.js");

function meta(url: string) {
  return {
    publisherOwnerId: "envoy:owner:mac",
    publishedAt: "2026-07-20T00:00:00.000Z",
    title: "Hi",
    url,
    kind: "feed" as const,
    visibility: "bonded" as const,
  };
}

function recentIso(offsetSec = 0): string {
  return new Date(Date.now() - offsetSec * 1000).toISOString();
}

describe("feed-notify-outbox", () => {
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

  it("returns [] when outbox file is missing", async () => {
    mockFs.readFile.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await expect(loadFeedNotifyOutbox("/tmp/p")).resolves.toEqual([]);
  });

  it("enqueues and dedupes by recipientOwnerId + url", async () => {
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify([]) as never);
    await enqueueFeedNotifyOutboxItem("/tmp/p", {
      recipientOwnerId: "envoy:owner:win",
      url: "envoy://mac/feeds/a.md",
      meta: meta("envoy://mac/feeds/a.md"),
    });
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string);
    expect(written).toHaveLength(1);

    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(written) as never);
    await enqueueFeedNotifyOutboxItem("/tmp/p", {
      recipientOwnerId: "envoy:owner:win",
      url: "envoy://mac/feeds/a.md",
      meta: { ...meta("envoy://mac/feeds/a.md"), title: "Updated" },
    });
    const written2 = JSON.parse(mockFs.writeFile.mock.calls[1]![1] as string);
    expect(written2).toHaveLength(1);
    expect(written2[0].meta.title).toBe("Updated");
  });

  it("caps at MAX_OUTBOX_ITEMS dropping oldest", async () => {
    const seeded = Array.from({ length: MAX_OUTBOX_ITEMS }, (_, i) => ({
      recipientOwnerId: "envoy:owner:win",
      url: `envoy://mac/feeds/${i}.md`,
      meta: meta(`envoy://mac/feeds/${i}.md`),
      enqueuedAt: recentIso(MAX_OUTBOX_ITEMS - i),
    }));
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    await enqueueFeedNotifyOutboxItem("/tmp/p", {
      recipientOwnerId: "envoy:owner:win",
      url: "envoy://mac/feeds/new.md",
      meta: meta("envoy://mac/feeds/new.md"),
    });
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string);
    expect(written).toHaveLength(MAX_OUTBOX_ITEMS);
    expect(written[0].url).toBe("envoy://mac/feeds/new.md");
  });

  it("listForRecipient filters and remove deletes the row", async () => {
    const seeded = [
      {
        recipientOwnerId: "envoy:owner:win",
        url: "envoy://mac/feeds/a.md",
        meta: meta("envoy://mac/feeds/a.md"),
        enqueuedAt: recentIso(2),
      },
      {
        recipientOwnerId: "envoy:owner:other",
        url: "envoy://mac/feeds/b.md",
        meta: meta("envoy://mac/feeds/b.md"),
        enqueuedAt: recentIso(1),
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    const forWin = await listFeedNotifyOutboxForRecipient("/tmp/p", "envoy:owner:win");
    expect(forWin).toHaveLength(1);

    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    await removeFeedNotifyOutboxItem("/tmp/p", "envoy:owner:win", "envoy://mac/feeds/a.md");
    const written = JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string);
    expect(written).toHaveLength(1);
    expect(written[0].recipientOwnerId).toBe("envoy:owner:other");
  });

  it("prune drops rows older than MAX_OUTBOX_AGE_MS", () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const staleAt = new Date(now - MAX_OUTBOX_AGE_MS - 60_000).toISOString();
    const freshAt = new Date(now - 60_000).toISOString();
    const pruned = pruneFeedNotifyOutboxItems(
      [
        {
          recipientOwnerId: "envoy:owner:win",
          url: "envoy://mac/feeds/old.md",
          meta: meta("envoy://mac/feeds/old.md"),
          enqueuedAt: staleAt,
        },
        {
          recipientOwnerId: "envoy:owner:win",
          url: "envoy://mac/feeds/new.md",
          meta: meta("envoy://mac/feeds/new.md"),
          enqueuedAt: freshAt,
        },
      ],
      now,
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.url).toContain("new.md");
  });

  it("deletes the file when the last row is removed", async () => {
    const seeded = [
      {
        recipientOwnerId: "envoy:owner:win",
        url: "envoy://mac/feeds/a.md",
        meta: meta("envoy://mac/feeds/a.md"),
        enqueuedAt: recentIso(),
      },
    ];
    mockFs.readFile.mockResolvedValueOnce(JSON.stringify(seeded) as never);
    await removeFeedNotifyOutboxItem("/tmp/p", "envoy:owner:win", "envoy://mac/feeds/a.md");
    expect(mockFs.unlink).toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
  });
});
