import { describe, expect, it } from "vitest";
import { matchWebContentEntries, normalizePublishTopicSlugs } from "../src/discovery-library-match.js";
import type { WebContentEntry } from "../src/web-content-store.js";

const entries: WebContentEntry[] = [
  {
    path: "blog/posts/a.md",
    contentHash: "h1",
    byteLength: 10,
    title: "Music post",
    kind: "article",
    mimeType: "text/markdown",
    visibility: "public",
    updatedAt: "2026-07-20T00:00:00Z",
    tags: ["Music", "live"],
  },
  {
    path: "notes/b.md",
    contentHash: "h2",
    byteLength: 10,
    title: "Cooking note",
    kind: "note",
    mimeType: "text/markdown",
    visibility: "public",
    updatedAt: "2026-07-20T00:00:00Z",
    tags: ["cooking"],
  },
];

describe("matchWebContentEntries publish topics (Phase 45E)", () => {
  it("filters by requestedPublishTopics slug intersection", () => {
    const matches = matchWebContentEntries({
      entries,
      requestedPublishTopics: ["publish:music"],
      maxResults: 10,
      allowedVisibility: ["public", "bonded"],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.title).toBe("Music post");
  });

  it("accepts raw tags as publish topics", () => {
    const matches = matchWebContentEntries({
      entries,
      requestedPublishTopics: ["Cooking"],
      maxResults: 10,
      allowedVisibility: ["public"],
    });
    expect(matches.map((m) => m.title)).toEqual(["Cooking note"]);
  });

  it("normalizePublishTopicSlugs strips prefix", () => {
    expect([...normalizePublishTopicSlugs(["publish:Music", "Travel"])].sort()).toEqual([
      "music",
      "travel",
    ]);
  });
});
