import { describe, expect, it } from "vitest";
import type { BondRecord, MorningReportEntry } from "@envoymesh/api";
import {
  filterFriendSuggestions,
  formatFriendSuggestionReason,
  friendSuggestionDisplayName,
  isActionableFriendSuggestion,
  isBondedOwner,
} from "../../src/lib/discover-friend-suggestion.js";

const t = ((key: string, params?: Record<string, string | number>) => {
  const table: Record<string, string> = {
    "discoverCards.suggestionUnknownName": "Someone on the network",
    "discoverCards.suggestionReferred": "Introduced through someone you know",
    "discoverCards.suggestionOnNetwork": "Recently seen on the network",
    "discoverCards.suggestionMatchedOnce": "Matched your search once",
    "discoverCards.suggestionMatchedMany": `Matched your search ${params?.count ?? 0} times`,
    "discoverCards.suggestionFriendOfFriend": "May be a friend of a friend",
    "discoverCards.suggestionActiveRecently": "Active in the last few minutes",
  };
  return table[key] ?? key;
}) as never;

describe("discover-friend-suggestion", () => {
  it("filters out bonded contacts from suggestions", () => {
    const entry: MorningReportEntry = {
      ownerId: "envoy:owner:alice",
      trustLevel: "unknown",
      score: 80,
      reason: "",
      discoveryMatchCount: 5,
    };
    const bonds: BondRecord[] = [
      {
        peerOwnerId: "envoy:owner:alice",
        level: "direct",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(isBondedOwner(entry, bonds)).toBe(true);
    expect(filterFriendSuggestions([entry], bonds)).toEqual([]);
  });

  it("filters out anyone already in the trust store", () => {
    const entry: MorningReportEntry = {
      ownerId: "envoy:owner:alice",
      trustLevel: "direct",
      score: 80,
      reason: "",
      discoveryMatchCount: 5,
    };
    expect(isActionableFriendSuggestion(entry)).toBe(false);
  });

  it("keeps unknown peers with discovery matches", () => {
    const entry: MorningReportEntry = {
      ownerId: "envoy:owner:carol",
      trustLevel: "unknown",
      score: 20,
      reason: "",
      discoveryMatchCount: 2,
    };
    expect(isActionableFriendSuggestion(entry)).toBe(true);
  });

  it("uses display name when present", () => {
    expect(
      friendSuggestionDisplayName(
        {
          ownerId: "envoy:owner:bob",
          displayName: "Bob",
          trustLevel: "public",
          score: 1,
          reason: "",
          discoveryMatchCount: 1,
        },
        t,
      ),
    ).toBe("Bob");
  });

  it("formats a human-readable reason", () => {
    const reason = formatFriendSuggestionReason(
      {
        ownerId: "envoy:owner:carol",
        displayName: "Carol",
        trustLevel: "unknown",
        score: 1,
        reason: "",
        discoveryMatchCount: 2,
        hopDistance: 2,
        lastSeenAt: new Date().toISOString(),
      },
      t,
    );
    expect(reason).toContain("Matched your search 2 times");
    expect(reason).toContain("May be a friend of a friend");
    expect(reason).not.toContain("trust=");
  });
});
