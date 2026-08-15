import { buildFeedIndexMarkdown } from "@envoymesh/api";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  backfillBondedPeerFeed,
  resetFeedBackfillInFlightForTests,
  scheduleFeedBackfillForMissingPeers,
} from "../src/feed-backfill.js";
import {
  appendFeedNotifyInboxItem,
  isFeedNotifyUnread,
  loadFeedNotifyInbox,
} from "../src/feed-notify-store.js";

const PEER = "envoy:owner:allenpeng01";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "feed-backfill-"));
  resetFeedBackfillInFlightForTests();
});

afterEach(async () => {
  resetFeedBackfillInFlightForTests();
  await rm(profileDir, { recursive: true, force: true });
});

describe("backfillBondedPeerFeed", () => {
  it("seeds timeline from feeds/index.md and marks rows read", async () => {
    const md = buildFeedIndexMarkdown(PEER, [
      {
        path: "feeds/one.md",
        title: "One",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
        summary: "First",
      },
      {
        path: "feeds/two.md",
        title: "Two",
        updatedAt: "2026-07-15T00:00:00.000Z",
        publishedAt: "2026-07-15T00:00:00.000Z",
      },
    ]);
    const emitted: { url: string; readAt?: string }[] = [];
    const result = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      libraryRead: async () => ({
        peerOwnerId: PEER,
        libp2pPeerId: "12D3KooWpeer",
        status: "ok",
        body: md,
      }),
      emit: (item) => emitted.push({ url: item.url, readAt: item.readAt }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);

    const inbox = await loadFeedNotifyInbox(profileDir);
    expect(inbox).toHaveLength(2);
    expect(inbox.every((row) => !isFeedNotifyUnread(row))).toBe(true);
    expect(inbox[0]?.messageId.startsWith("backfill:")).toBe(true);
    expect(emitted).toHaveLength(2);
    expect(emitted.every((e) => Boolean(e.readAt))).toBe(true);
  });

  it("is idempotent on second run (url / backfill messageId dedupe)", async () => {
    const md = buildFeedIndexMarkdown(PEER, [
      {
        path: "feeds/one.md",
        title: "One",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    const libraryRead = async () => ({
      peerOwnerId: PEER,
      libp2pPeerId: "12D3KooWpeer",
      status: "ok" as const,
      body: md,
    });
    const first = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      libraryRead,
    });
    const second = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      libraryRead,
    });
    expect(first.ok && first.inserted).toBe(1);
    expect(second.ok && second.inserted).toBe(0);
    expect(second.ok && second.skipped).toBe(1);
    expect(await loadFeedNotifyInbox(profileDir)).toHaveLength(1);
  });

  it("caps seeded posts", async () => {
    const posts = Array.from({ length: 5 }, (_, i) => ({
      path: `feeds/p${i}.md`,
      title: `P${i}`,
      updatedAt: `2026-08-0${i + 1}T00:00:00.000Z`,
      publishedAt: `2026-08-0${i + 1}T00:00:00.000Z`,
    }));
    const md = buildFeedIndexMarkdown(PEER, posts);
    const result = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      maxPosts: 2,
      libraryRead: async () => ({
        peerOwnerId: PEER,
        libp2pPeerId: "12D3KooWpeer",
        status: "ok",
        body: md,
      }),
    });
    expect(result.ok && result.inserted).toBe(2);
    expect(await loadFeedNotifyInbox(profileDir)).toHaveLength(2);
  });

  it("tolerates library.read not_found without failing hard", async () => {
    const result = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      libraryRead: async () => ({
        peerOwnerId: PEER,
        libp2pPeerId: "",
        status: "not_found",
      }),
    });
    expect(result).toEqual({
      ok: true,
      inserted: 0,
      skipped: 0,
      patched: 0,
      reason: "not_found",
    });
  });

  it("stores imageUrls from post markdown bodies during backfill", async () => {
    const postUrl = `envoy://${PEER}/feeds/pics.md`;
    const indexMd = buildFeedIndexMarkdown(PEER, [
      {
        path: "feeds/pics.md",
        title: "Pics",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
        summary: "2 photo(s)",
      },
    ]);
    const postMd = [
      "# Pics",
      "",
      "Hello",
      "",
      `![photo](envoy://${PEER}/feeds/media/pics/0.jpg)`,
      `![photo](envoy://${PEER}/feeds/media/pics/1.jpg)`,
      "",
    ].join("\n");
    const result = await backfillBondedPeerFeed({
      profileDir,
      peerOwnerId: PEER,
      libraryRead: async (params) => {
        if (params.path.includes("index.md")) {
          return {
            peerOwnerId: PEER,
            libp2pPeerId: "12D3KooWpeer",
            status: "ok",
            body: indexMd,
          };
        }
        return {
          peerOwnerId: PEER,
          libp2pPeerId: "12D3KooWpeer",
          status: "ok",
          body: postMd,
        };
      },
    });
    expect(result.ok && result.inserted).toBe(1);
    const inbox = await loadFeedNotifyInbox(profileDir);
    expect(inbox[0]?.url).toBe(postUrl);
    expect(inbox[0]?.imageUrls).toEqual([
      `envoy://${PEER}/feeds/media/pics/0.jpg`,
      `envoy://${PEER}/feeds/media/pics/1.jpg`,
    ]);
    expect(inbox[0]?.summary).toContain("Hello");
  });

  it("scheduleFeedBackfillForMissingPeers seeds only peers with no local feed rows", async () => {
    const md = buildFeedIndexMarkdown(PEER, [
      {
        path: "feeds/one.md",
        title: "One",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    let reads = 0;
    scheduleFeedBackfillForMissingPeers({
      profileDir,
      bondedOwnerIds: [PEER, "envoy:owner:otherpeer01"],
      libraryRead: async (params) => {
        reads += 1;
        if (params.targetOwnerId === PEER) {
          return {
            peerOwnerId: PEER,
            libp2pPeerId: "12D3KooWpeer",
            status: "ok",
            body: md,
          };
        }
        return {
          peerOwnerId: params.targetOwnerId,
          libp2pPeerId: "",
          status: "not_found",
        };
      },
    });
    for (let i = 0; i < 40 && (await loadFeedNotifyInbox(profileDir)).length < 1; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(reads).toBeGreaterThanOrEqual(1);
    const inbox = await loadFeedNotifyInbox(profileDir);
    expect(inbox.some((row) => row.publisherOwnerId === PEER)).toBe(true);

    const readsBefore = reads;
    scheduleFeedBackfillForMissingPeers({
      profileDir,
      bondedOwnerIds: [PEER],
      libraryRead: async () => {
        reads += 1;
        return { peerOwnerId: PEER, libp2pPeerId: "", status: "ok", body: md };
      },
    });
    await new Promise((r) => setTimeout(r, 80));
    // Already has feed rows → no second library.read for PEER
    expect(reads).toBe(readsBefore);
  });

  it("scheduleFeedBackfill still seeds when peer only has non-feed inbox rows", async () => {
    await appendFeedNotifyInboxItem(profileDir, {
      id: "blog-only",
      receivedAt: "2026-08-01T00:00:00.000Z",
      messageId: "blog-1",
      publisherOwnerId: PEER,
      publishedAt: "2026-08-01T00:00:00.000Z",
      title: "Essay",
      url: `envoy://${PEER}/blog/posts/essay.md`,
      kind: "article",
      visibility: "bonded",
      senderPeerId: "12D3KooWpeer",
    });
    const md = buildFeedIndexMarkdown(PEER, [
      {
        path: "feeds/one.md",
        title: "One",
        updatedAt: "2026-08-01T00:00:00.000Z",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    let reads = 0;
    scheduleFeedBackfillForMissingPeers({
      profileDir,
      bondedOwnerIds: [PEER],
      libraryRead: async () => {
        reads += 1;
        return {
          peerOwnerId: PEER,
          libp2pPeerId: "12D3KooWpeer",
          status: "ok",
          body: md,
        };
      },
    });
    for (let i = 0; i < 40; i++) {
      const inbox = await loadFeedNotifyInbox(profileDir);
      if (inbox.some((row) => row.url.includes("/feeds/"))) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(reads).toBeGreaterThanOrEqual(1);
    const inbox = await loadFeedNotifyInbox(profileDir);
    expect(inbox.some((row) => row.url.includes("/feeds/"))).toBe(true);
  });
});
