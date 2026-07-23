import { describe, expect, it } from "vitest";
import {
  createFeedNotifyPayload,
  parseFeedNotifyPayload,
  evaluateEnvelopeRolePolicy,
} from "../src/index.js";

describe("feed.notify payload (Phase 45E)", () => {
  it("round-trips via create + parse", () => {
    const created = createFeedNotifyPayload({
      publisherOwnerId: "envoy:owner:alice",
      publishedAt: "2026-07-20T12:00:00.000Z",
      title: "Hello mesh",
      url: "envoy://envoy:owner:alice/blog/posts/hello.md",
      kind: "article",
      visibility: "bonded",
      summary: "A short post",
      tags: ["music", "travel"],
      contentHash: "abc123",
      listingUrl: "envoy://envoy:owner:alice/blog/",
    });
    expect(parseFeedNotifyPayload(created)).toEqual(created);
  });

  it("requires title, url, publisherOwnerId", () => {
    expect(() =>
      createFeedNotifyPayload({
        publisherOwnerId: "",
        publishedAt: "2026-07-20T12:00:00.000Z",
        title: "x",
        url: "envoy://x/a",
        kind: "note",
        visibility: "public",
      }),
    ).toThrow();
  });

  it("allows kind section (custom site pages)", () => {
    const created = createFeedNotifyPayload({
      publisherOwnerId: "envoy:owner:alice",
      publishedAt: "2026-07-20T12:00:00.000Z",
      title: "Market",
      url: "envoy://envoy:owner:alice/market/",
      kind: "section",
      visibility: "bonded",
      tags: ["market"],
      listingUrl: "envoy://envoy:owner:alice/market/",
    });
    expect(parseFeedNotifyPayload(created).kind).toBe("section");
  });

  it("allows human→human and denies agent→human", () => {
    expect(evaluateEnvelopeRolePolicy("feed.notify", "human", "human")).toEqual({ ok: true });
    expect(evaluateEnvelopeRolePolicy("feed.notify", "agent", "human").ok).toBe(false);
  });
});
