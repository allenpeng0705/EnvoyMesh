import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addContentCommentInStore,
  loadContentEngagement,
  removeContentCommentInStore,
  summarizeEngagement,
  toggleContentStarInStore,
} from "../src/content-engagement-store.js";

describe("content-engagement-store", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function freshDir(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), "engage-"));
    dirs.push(d);
    return d;
  }

  it("toggles stars and adds comments", async () => {
    const dir = await freshDir();
    const url = "envoy://envoy:owner:alice/feeds/hello.md";
    await toggleContentStarInStore(dir, url, "envoy:owner:bob");
    let rec = await loadContentEngagement(dir, url);
    expect(rec.stars).toEqual(["envoy:owner:bob"]);
    await toggleContentStarInStore(dir, url, "envoy:owner:bob");
    rec = await loadContentEngagement(dir, url);
    expect(rec.stars).toEqual([]);

    await addContentCommentInStore(dir, url, "envoy:owner:bob", "Nice post", "comment-bob-1");
    await addContentCommentInStore(dir, url, "envoy:owner:carol", "Also nice");
    // Explicit commentId is idempotent on retry.
    await addContentCommentInStore(dir, url, "envoy:owner:bob", "Nice post", "comment-bob-1");
    rec = await loadContentEngagement(dir, url);
    expect(rec.comments).toHaveLength(2);
    expect(rec.comments.find((c) => c.authorOwnerId === "envoy:owner:bob")!.id).toBe("comment-bob-1");

    const bobCommentId = rec.comments.find((c) => c.authorOwnerId === "envoy:owner:bob")!.id;
    const carolCommentId = rec.comments.find((c) => c.authorOwnerId === "envoy:owner:carol")!.id;

    await toggleContentStarInStore(dir, url, "envoy:owner:bob");
    await toggleContentStarInStore(dir, url, "envoy:owner:carol");
    rec = await loadContentEngagement(dir, url);
    const summary = summarizeEngagement(rec, "envoy:owner:bob");
    expect(summary.starOwnerIds).toEqual(["envoy:owner:bob", "envoy:owner:carol"]);
    expect(summary.starredByMe).toBe(true);

    // Stranger cannot remove someone else's comment.
    await expect(
      removeContentCommentInStore(dir, url, "envoy:owner:dave", carolCommentId, "envoy:owner:alice"),
    ).rejects.toThrow(/only the comment author or post author/);

    // Comment author can remove their own.
    await removeContentCommentInStore(dir, url, "envoy:owner:bob", bobCommentId, "envoy:owner:alice");
    rec = await loadContentEngagement(dir, url);
    expect(rec.comments.map((c) => c.id)).toEqual([carolCommentId]);

    // Post (Feed) author can remove any comment under the post.
    await removeContentCommentInStore(dir, url, "envoy:owner:alice", carolCommentId, "envoy:owner:alice");
    rec = await loadContentEngagement(dir, url);
    expect(rec.comments).toHaveLength(0);
  });
});
