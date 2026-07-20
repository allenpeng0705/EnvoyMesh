import { describe, expect, it } from "vitest";
import {
  recipientInterestsOverlap,
  selectFeedNotifyRecipients,
  normalizeInterestSlugs,
} from "../src/feed-notify-recipients.js";

describe("selectFeedNotifyRecipients", () => {
  const bonds = [
    { peerOwnerId: "envoy:owner:alice", level: "direct" as const },
    { peerOwnerId: "envoy:owner:bob", level: "referred" as const },
    { peerOwnerId: "envoy:owner:stranger", level: "public" as const },
    { peerOwnerId: "envoy:owner:blocked", level: "blocked" as const },
  ];

  it("skips private visibility", () => {
    expect(
      selectFeedNotifyRecipients({ visibility: "private", bonds, applyInterestFilter: false }),
    ).toEqual([]);
  });

  it("bonded/public push only to direct+referred", () => {
    expect(
      selectFeedNotifyRecipients({ visibility: "bonded", bonds, applyInterestFilter: false }).sort(),
    ).toEqual(["envoy:owner:alice", "envoy:owner:bob"]);
    expect(
      selectFeedNotifyRecipients({ visibility: "public", bonds, applyInterestFilter: false }).sort(),
    ).toEqual(["envoy:owner:alice", "envoy:owner:bob"]);
  });

  it("contacts intersects contactIds with eligible bonds", () => {
    expect(
      selectFeedNotifyRecipients({
        visibility: "contacts",
        contactIds: ["envoy:owner:bob", "envoy:owner:stranger"],
        bonds,
        applyInterestFilter: false,
      }),
    ).toEqual(["envoy:owner:bob"]);
  });

  it("interest overlap filters when publisher has tags", () => {
    const interests = new Map([
      ["envoy:owner:alice", ["Music"]],
      ["envoy:owner:bob", ["cooking"]],
    ]);
    expect(
      selectFeedNotifyRecipients({
        visibility: "bonded",
        bonds,
        publisherTags: ["music"],
        recipientInterestsByOwnerId: interests,
      }),
    ).toEqual(["envoy:owner:alice"]);
  });

  it("keeps recipients with empty interests when publisher has tags", () => {
    const interests = new Map<string, string[]>([["envoy:owner:alice", []]]);
    expect(
      selectFeedNotifyRecipients({
        visibility: "bonded",
        bonds: [{ peerOwnerId: "envoy:owner:alice", level: "direct" }],
        publisherTags: ["music"],
        recipientInterestsByOwnerId: interests,
      }),
    ).toEqual(["envoy:owner:alice"]);
  });
});

describe("recipientInterestsOverlap", () => {
  it("broadcasts when publisher tags empty", () => {
    expect(recipientInterestsOverlap({ publisherTags: [], recipientInterests: ["x"] })).toBe(true);
  });

  it("requires slug intersection when both sides non-empty", () => {
    expect(
      recipientInterestsOverlap({
        publisherTags: ["Machine Learning"],
        recipientInterests: ["machine-learning"],
      }),
    ).toBe(true);
    expect(
      recipientInterestsOverlap({
        publisherTags: ["music"],
        recipientInterests: ["cooking"],
      }),
    ).toBe(false);
  });
});

describe("normalizeInterestSlugs", () => {
  it("slugifies and dedupes", () => {
    expect(normalizeInterestSlugs(["Music", "music", "!!!"]).sort()).toEqual(["music"]);
  });
});
