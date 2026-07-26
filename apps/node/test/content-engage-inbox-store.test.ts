import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendContentEngageInboxItem,
  dismissContentEngageInbox,
  loadContentEngageInbox,
  surfaceForContentUrl,
} from "../src/content-engage-inbox-store.js";

describe("content-engage-inbox-store", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function freshDir(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "engage-inbox-"));
    dirs.push(d);
    return d;
  }

  it("maps urls to feed/blog surfaces", () => {
    expect(surfaceForContentUrl("envoy://envoy:owner:a/feeds/hello.md")).toBe("feed");
    expect(surfaceForContentUrl("envoy://envoy:owner:a/blog/posts/x.md")).toBe("blog");
    expect(surfaceForContentUrl("envoy://envoy:owner:a/photos/1.jpg")).toBeUndefined();
  });

  it("appends and dismisses by surface", async () => {
    const dir = await freshDir();
    await appendContentEngageInboxItem(dir, {
      messageId: "m1",
      url: "envoy://envoy:owner:a/feeds/a.md",
      surface: "feed",
      action: "star",
      actorOwnerId: "envoy:owner:bob",
      senderPeerId: "envoy_x",
    });
    await appendContentEngageInboxItem(dir, {
      messageId: "m2",
      url: "envoy://envoy:owner:a/blog/posts/b.md",
      surface: "blog",
      action: "comment",
      actorOwnerId: "envoy:owner:carol",
      text: "Nice",
      senderPeerId: "envoy_y",
    });
    let items = await loadContentEngageInbox(dir);
    expect(items).toHaveLength(2);

    await dismissContentEngageInbox(dir, "feed");
    items = await loadContentEngageInbox(dir);
    expect(items.map((i) => i.surface)).toEqual(["blog"]);

    await dismissContentEngageInbox(dir, "all");
    items = await loadContentEngageInbox(dir);
    expect(items).toHaveLength(0);
  });

  it("prune drops rows older than TTL", async () => {
    const { pruneContentEngageInboxItems, MAX_INBOX_AGE_MS } = await import(
      "../src/content-engage-inbox-store.js"
    );
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const staleAt = new Date(now - MAX_INBOX_AGE_MS - 60_000).toISOString();
    const freshAt = new Date(now - 60_000).toISOString();
    const pruned = pruneContentEngageInboxItems(
      [
        {
          id: "1",
          receivedAt: staleAt,
          messageId: "m-old",
          url: "envoy://envoy:owner:a/feeds/old.md",
          surface: "feed",
          action: "star",
          actorOwnerId: "envoy:owner:bob",
          senderPeerId: "x",
        },
        {
          id: "2",
          receivedAt: freshAt,
          messageId: "m-new",
          url: "envoy://envoy:owner:a/feeds/new.md",
          surface: "feed",
          action: "star",
          actorOwnerId: "envoy:owner:bob",
          senderPeerId: "x",
        },
      ],
      now,
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0]!.messageId).toBe("m-new");
  });
});
