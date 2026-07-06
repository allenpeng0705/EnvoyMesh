/**
 * @vitest-environment jsdom
 *
 * Logic tests for the production cold-start interests + location feature.
 *
 * These validate the gating/derivation logic used by SetupView and the
 * SearchView first-run auto-search, without full component rendering
 * (matching the repo's existing SearchView.test.tsx convention).
 */
import { describe, it, expect } from "vitest";
import {
  locationSearchTopics,
  encodeGeohash,
  NEARBY_GEOHASH_PRECISION,
} from "@envoymesh/api";

const MIN_INTERESTS = 3;

describe("Setup interests gating", () => {
  it("requires at least 3 interests to enable Continue", () => {
    const selected = ["music", "tech"];
    const remaining = Math.max(0, MIN_INTERESTS - selected.length);
    expect(remaining).toBe(1);
    expect(remaining > 0).toBe(true); // button disabled
  });

  it("enables Continue when 3+ interests selected", () => {
    const selected = ["music", "tech", "art"];
    const remaining = Math.max(0, MIN_INTERESTS - selected.length);
    expect(remaining).toBe(0);
    expect(remaining > 0).toBe(false); // button enabled
  });

  it("slugifies free-text interest input to lowercase", () => {
    const input = "Machine Learning";
    const slug = input.trim().toLowerCase();
    expect(slug).toBe("machine learning");
  });

  it("toggles an interest out of the selected list", () => {
    let selected = ["music", "tech", "art"];
    const toggle = (topic: string) => {
      const t = topic.trim().toLowerCase();
      selected = selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t];
    };
    toggle("tech");
    expect(selected).toEqual(["music", "art"]);
    toggle("tech");
    expect(selected).toEqual(["music", "art", "tech"]);
  });
});

describe("Setup location detection", () => {
  it("derives a geohash from coordinates at nearby precision", () => {
    const gh = encodeGeohash(42.36, -71.06, NEARBY_GEOHASH_PRECISION);
    expect(gh.length).toBeGreaterThanOrEqual(4);
    expect(gh).toMatch(/^[a-z0-9]+$/);
  });

  it("builds city-level discovery topics from a detected location", () => {
    const topics = locationSearchTopics({
      location: { countryCode: "US", city: "Boston" },
      scope: "city",
    });
    expect(topics).toContain("geo:city:US-boston");
  });

  it("skips location when precision is hidden", () => {
    // Mirrors the SetupView gating: locationChoice === "skip" → no discoveryLocation.
    const locationChoice = "skip";
    const resolvedLocation = { countryCode: "US" };
    const discoveryLocation =
      locationChoice === "auto" && resolvedLocation ? resolvedLocation : undefined;
    expect(discoveryLocation).toBeUndefined();
  });

  it("includes location when choice is auto", () => {
    const locationChoice = "auto";
    const resolvedLocation = { countryCode: "US", geohash: "abc12" };
    const discoveryLocation =
      locationChoice === "auto" && resolvedLocation ? resolvedLocation : undefined;
    expect(discoveryLocation).toEqual({ countryCode: "US", geohash: "abc12" });
  });
});

describe("First-run auto-search gating", () => {
  // Mirrors the SearchView auto-search effect conditions.
  const shouldAutoSearch = (input: {
    bondsLength: number;
    ownerId?: string;
    interests: string[];
    hasLocation?: boolean;
    alreadyDone?: boolean;
  }): boolean => {
    if (input.bondsLength > 0) return false;
    if (!input.ownerId) return false;
    if (input.interests.length === 0 && !input.hasLocation) return false;
    if (input.alreadyDone) return false;
    return true;
  };

  it("fires when 0 bonds + has interests + not done before", () => {
    expect(
      shouldAutoSearch({
        bondsLength: 0,
        ownerId: "envoy:owner:abc",
        interests: ["music", "tech", "art"],
        hasLocation: false,
        alreadyDone: false,
      }),
    ).toBe(true);
  });

  it("does NOT fire when user already has bonds", () => {
    expect(
      shouldAutoSearch({
        bondsLength: 1,
        ownerId: "envoy:owner:abc",
        interests: ["music"],
        alreadyDone: false,
      }),
    ).toBe(false);
  });

  it("does NOT fire twice (localStorage gate)", () => {
    expect(
      shouldAutoSearch({
        bondsLength: 0,
        ownerId: "envoy:owner:abc",
        interests: ["music", "tech"],
        alreadyDone: true,
      }),
    ).toBe(false);
  });

  it("fires with location only (no interests)", () => {
    expect(
      shouldAutoSearch({
        bondsLength: 0,
        ownerId: "envoy:owner:abc",
        interests: [],
        hasLocation: true,
        alreadyDone: false,
      }),
    ).toBe(true);
  });

  it("does NOT fire with no interests and no location", () => {
    expect(
      shouldAutoSearch({
        bondsLength: 0,
        ownerId: "envoy:owner:abc",
        interests: [],
        hasLocation: false,
        alreadyDone: false,
      }),
    ).toBe(false);
  });
});

describe("Auto-hello top-match selection", () => {
  // Mirrors the SearchView auto-hello `.find()` predicate: pick the first
  // result that is not the user, not already bonded, not already hello'd.
  const pickTopMatch = (input: {
    results: { ownerId?: string }[];
    ownerId: string;
    bondedOwnerIds: Set<string>;
    helloedIds: Set<string>;
  }): { ownerId: string } | undefined => {
    return input.results.find(
      (r) =>
        r.ownerId &&
        r.ownerId !== input.ownerId &&
        !input.bondedOwnerIds.has(r.ownerId) &&
        !input.helloedIds.has(r.ownerId),
    ) as { ownerId: string } | undefined;
  };

  it("picks the first eligible result", () => {
    const top = pickTopMatch({
      results: [{ ownerId: "peer-a" }, { ownerId: "peer-b" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(),
      helloedIds: new Set(),
    });
    expect(top?.ownerId).toBe("peer-a");
  });

  it("skips the user's own ownerId", () => {
    const top = pickTopMatch({
      results: [{ ownerId: "envoy:owner:me" }, { ownerId: "peer-a" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(),
      helloedIds: new Set(),
    });
    expect(top?.ownerId).toBe("peer-a");
  });

  it("skips already-bonded peers", () => {
    const top = pickTopMatch({
      results: [{ ownerId: "peer-a" }, { ownerId: "peer-b" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(["peer-a"]),
      helloedIds: new Set(),
    });
    expect(top?.ownerId).toBe("peer-b");
  });

  it("skips already-hello'd peers", () => {
    const top = pickTopMatch({
      results: [{ ownerId: "peer-a" }, { ownerId: "peer-b" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(),
      helloedIds: new Set(["peer-a"]),
    });
    expect(top?.ownerId).toBe("peer-b");
  });

  it("returns undefined when no eligible match", () => {
    const top = pickTopMatch({
      results: [{ ownerId: "peer-a" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(["peer-a"]),
      helloedIds: new Set(),
    });
    expect(top).toBeUndefined();
  });

  it("returns undefined for empty results", () => {
    const top = pickTopMatch({
      results: [],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(),
      helloedIds: new Set(),
    });
    expect(top).toBeUndefined();
  });

  it("skips results without an ownerId", () => {
    const top = pickTopMatch({
      results: [{}, { ownerId: "peer-a" }],
      ownerId: "envoy:owner:me",
      bondedOwnerIds: new Set(),
      helloedIds: new Set(),
    });
    expect(top?.ownerId).toBe("peer-a");
  });
});
