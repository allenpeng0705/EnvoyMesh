/**
 * Regression: opening Inbox must clear the unread badge without wiping the
 * peer-Feed timeline (same store powers Content → Feed / Explore → Following).
 */
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  appendFeedNotifyInboxItem,
  dismissAllFeedNotifyInboxItems,
  dismissFeedNotifyInboxItem,
  isFeedNotifyUnread,
  loadFeedNotifyInbox,
  listFeedNotifyRecent,
} from "../src/feed-notify-store.js";

async function tempProfile(): Promise<string> {
  return mkdtemp(join(tmpdir(), "envoymesh-feed-store-"));
}

function item(partial: {
  id: string;
  messageId: string;
  url: string;
  publisherOwnerId?: string;
  publishedAt?: string;
}): Parameters<typeof appendFeedNotifyInboxItem>[1] {
  return {
    id: partial.id,
    messageId: partial.messageId,
    url: partial.url,
    kind: "feed",
    receivedAt: "2026-07-01T00:00:00.000Z",
    publisherOwnerId: partial.publisherOwnerId ?? "envoy:owner:x",
    publishedAt: partial.publishedAt ?? "2026-07-01T00:00:00.000Z",
    title: "Post",
    visibility: "bonded",
    senderPeerId: "12D3KooW",
  };
}

describe("feed-notify durable store", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await tempProfile();
  });

  it("migrates legacy inbox.json once and preserves readAt", async () => {
    await mkdir(profileDir, { recursive: true });
    await writeFile(
      join(profileDir, "feed-notify-inbox.json"),
      JSON.stringify([
        {
          ...item({ id: "a", messageId: "m1", url: "envoy://x/feeds/1.md" }),
          readAt: "2026-07-02T00:00:00.000Z",
        },
        item({ id: "b", messageId: "m2", url: "envoy://y/feeds/2.md" }),
      ]),
      "utf8",
    );
    const loaded = await loadFeedNotifyInbox(profileDir);
    expect(loaded).toHaveLength(2);
    expect(loaded.find((r) => r.id === "a")?.readAt).toBe("2026-07-02T00:00:00.000Z");
    expect(loaded.find((r) => r.id === "b")?.readAt).toBeUndefined();
  });

  it("marks all rows read instead of deleting them", async () => {
    await appendFeedNotifyInboxItem(
      profileDir,
      item({ id: "a", messageId: "m1", url: "envoy://x/feeds/1.md" }),
    );
    await appendFeedNotifyInboxItem(
      profileDir,
      item({ id: "b", messageId: "m2", url: "envoy://y/feeds/2.md" }),
    );
    const result = await dismissAllFeedNotifyInboxItems(profileDir);
    expect(result).toHaveLength(2);
    expect(result.every((r) => !isFeedNotifyUnread(r))).toBe(true);
    const again = await loadFeedNotifyInbox(profileDir);
    expect(again).toHaveLength(2);
  });

  it("dedupes by url on append", async () => {
    await appendFeedNotifyInboxItem(
      profileDir,
      item({ id: "a", messageId: "m1", url: "envoy://x/feeds/1.md" }),
    );
    await appendFeedNotifyInboxItem(
      profileDir,
      item({ id: "b", messageId: "m2-retry", url: "envoy://x/feeds/1.md" }),
    );
    const rows = await loadFeedNotifyInbox(profileDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.messageId).toBe("m1");
  });

  it("dismiss one by id keeps history", async () => {
    await appendFeedNotifyInboxItem(
      profileDir,
      item({ id: "a", messageId: "m1", url: "envoy://x/feeds/1.md" }),
    );
    await dismissFeedNotifyInboxItem(profileDir, "a");
    const rows = await loadFeedNotifyInbox(profileDir);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.readAt).toBeTruthy();
  });

  it("listFeedNotifyRecent returns newest slice", async () => {
    for (let i = 0; i < 5; i++) {
      await appendFeedNotifyInboxItem(
        profileDir,
        item({
          id: `id-${i}`,
          messageId: `m-${i}`,
          url: `envoy://x/feeds/${i}.md`,
          publishedAt: `2026-07-01T00:0${i}:00.000Z`,
        }),
      );
    }
    const recent = await listFeedNotifyRecent(profileDir, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]!.url).toContain("/4.md");
  });
});
