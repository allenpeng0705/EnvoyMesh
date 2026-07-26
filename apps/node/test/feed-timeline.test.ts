/**
 * listFeedTimeline merges own + peer posts and pages newest-first.
 */
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { appendFeedNotifyInboxItem } from "../src/feed-notify-store.js";
import { listFeedTimeline, isOlderThanCursor } from "../src/feed-timeline.js";
import { createWebContentStore } from "../src/web-content-store.js";

async function seedOwnFeed(profileDir: string, ownerId: string, posts: Array<{ path: string; publishedAt: string; title: string }>) {
  const webDir = join(profileDir, "web");
  await mkdir(webDir, { recursive: true });
  const store = createWebContentStore(webDir);
  for (const p of posts) {
    const abs = join(webDir, p.path);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, `# ${p.title}\n\nbody\n`, "utf8");
    await store.upsert({
      path: p.path,
      contentHash: "h",
      byteLength: 10,
      title: p.title,
      kind: "feed",
      mimeType: "text/markdown",
      visibility: "bonded",
      publishedAt: p.publishedAt,
      updatedAt: p.publishedAt,
    });
  }
}

describe("listFeedTimeline", () => {
  let profileDir: string;
  const ownerId = "envoy:owner:alice";

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-feed-timeline-"));
  });

  it("isOlderThanCursor respects publishedAt then url", () => {
    expect(
      isOlderThanCursor(
        { publishedAt: "2026-07-01T00:00:00.000Z", url: "a" },
        "2026-07-02T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      isOlderThanCursor(
        { publishedAt: "2026-07-02T00:00:00.000Z", url: "a" },
        "2026-07-02T00:00:00.000Z",
        "b",
      ),
    ).toBe(true);
    expect(
      isOlderThanCursor(
        { publishedAt: "2026-07-02T00:00:00.000Z", url: "c" },
        "2026-07-02T00:00:00.000Z",
        "b",
      ),
    ).toBe(false);
  });

  it("pages own + bonded peer posts", async () => {
    await seedOwnFeed(profileDir, ownerId, [
      { path: "feeds/own-new.md", publishedAt: "2026-07-03T00:00:00.000Z", title: "Own new" },
      { path: "feeds/own-old.md", publishedAt: "2026-07-01T00:00:00.000Z", title: "Own old" },
    ]);
    await appendFeedNotifyInboxItem(profileDir, {
      id: "p1",
      messageId: "m1",
      url: "envoy://envoy:owner:bob/feeds/bob.md",
      kind: "feed",
      receivedAt: "2026-07-02T00:00:00.000Z",
      publisherOwnerId: "envoy:owner:bob",
      publishedAt: "2026-07-02T00:00:00.000Z",
      title: "Bob",
      summary: "From Bob",
      visibility: "bonded",
      senderPeerId: "12D3KooW",
    });

    const bonds = [{ peerOwnerId: "envoy:owner:bob", level: "direct" as const }];
    const page1 = await listFeedTimeline({
      profileDir,
      ownerId,
      bonds,
      params: { limit: 2 },
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.items[0]!.source).toBe("own");
    expect(page1.items[0]!.path).toBe("feeds/own-new.md");
    expect(page1.items[1]!.source).toBe("peer");

    const page2 = await listFeedTimeline({
      profileDir,
      ownerId,
      bonds,
      params: {
        limit: 2,
        before: page1.nextBefore,
        beforeUrl: page1.nextBeforeUrl,
      },
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
    expect(page2.items[0]!.path).toBe("feeds/own-old.md");
  });

  it("excludes unbonded peer posts from the timeline", async () => {
    const isolated = await mkdtemp(join(tmpdir(), "envoymesh-feed-unbonded-"));
    await appendFeedNotifyInboxItem(isolated, {
      id: "p1",
      messageId: "m1",
      url: "envoy://envoy:owner:stranger/feeds/x.md",
      kind: "feed",
      receivedAt: "2026-07-02T00:00:00.000Z",
      publisherOwnerId: "envoy:owner:stranger",
      publishedAt: "2026-07-02T00:00:00.000Z",
      title: "Nope",
      visibility: "bonded",
      senderPeerId: "12D3KooW",
    });
    const page = await listFeedTimeline({
      profileDir: isolated,
      ownerId,
      bonds: [],
      params: { limit: 10 },
    });
    expect(page.items.every((i) => i.publisherOwnerId !== "envoy:owner:stranger")).toBe(true);
    expect(page.items.filter((i) => i.source === "peer")).toHaveLength(0);
  });
});
