/**
 * Publisher feed.notify outbox — enqueue / dedup / cap / remove.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockFs = {
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  mkdir: vi.fn(),
};
vi.mock("node:fs/promises", () => mockFs);

const {
  enqueueFeedNotifyOutboxItem,
  removeFeedNotifyOutboxItem,
  listFeedNotifyOutboxForRecipient,
  loadFeedNotifyOutbox,
  MAX_OUTBOX_ITEMS,
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

describe("feed-notify-outbox", () => {
  beforeEach(() => {
    mockFs.readFile.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.rename.mockReset();
    mockFs.mkdir.mockReset();
    mockFs.mkdir.mockResolvedValue(undefined as never);
    mockFs.writeFile.mockResolvedValue(undefined as never);
    mockFs.rename.mockResolvedValue(undefined as never);
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
      enqueuedAt: `2026-07-01T00:00:${String(i).padStart(2, "0")}.000Z`,
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
        enqueuedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        recipientOwnerId: "envoy:owner:other",
        url: "envoy://mac/feeds/b.md",
        meta: meta("envoy://mac/feeds/b.md"),
        enqueuedAt: "2026-07-01T00:00:00.000Z",
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
});
