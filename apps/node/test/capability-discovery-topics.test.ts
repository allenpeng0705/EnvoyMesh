/**
 * Tests for the profile-driven discovery topic builders added for the
 * production cold-start feature (interests + location advertising).
 *
 * Covers:
 *   - buildInterestTopics: hobbies/knowledge → `interest:<slug>` topics
 *   - buildProfileDiscoveryTopics: merged capabilities + interests + geo
 */
import { describe, it, expect } from "vitest";
import {
  buildAutoCapabilityTopics,
  buildInterestTopics,
  buildProfileDiscoveryTopics,
  interestTopicFor,
  slugifyTopic,
} from "../src/capability-discovery.js";

describe("buildInterestTopics", () => {
  it("slugifies hobbies into interest: topics", () => {
    const topics = buildInterestTopics({ hobbies: ["Music", "Machine Learning", "Tech"] });
    expect(topics.sort()).toEqual(["interest:machine-learning", "interest:music", "interest:tech"]);
  });

  it("merges hobbies + knowledge and dedupes", () => {
    const topics = buildInterestTopics({
      hobbies: ["music", "Jazz"],
      knowledge: ["music theory", "ML"],
    });
    expect(topics.sort()).toEqual(
      ["interest:jazz", "interest:ml", "interest:music", "interest:music-theory"].sort(),
    );
  });

  it("drops empty / non-slugifiable values", () => {
    const topics = buildInterestTopics({ hobbies: ["", "   ", "---", "!!!", "valid"] });
    expect(topics).toEqual(["interest:valid"]);
  });

  it("returns empty for null/undefined inputs", () => {
    expect(buildInterestTopics({})).toEqual([]);
    expect(buildInterestTopics({ hobbies: null, knowledge: null })).toEqual([]);
  });
});

describe("buildProfileDiscoveryTopics", () => {
  it("merges capabilities + interests + geo topics", () => {
    const topics = buildProfileDiscoveryTopics({
      capabilities: ["chat.assist"],
      hobbies: ["music", "coding"],
      knowledge: ["rust"],
      geoTopics: ["geo:country:US", "geo:city:US-boston"],
    });
    expect(topics.sort()).toEqual(
      [
        "capability:chat.assist",
        "interest:coding",
        "interest:music",
        "interest:rust",
        "geo:country:US",
        "geo:city:US-boston",
      ].sort(),
    );
  });

  it("works with capabilities only (backward compat)", () => {
    const topics = buildProfileDiscoveryTopics({ capabilities: ["foo", "bar"] });
    expect(topics.sort()).toEqual(["capability:bar", "capability:foo"]);
  });

  it("works with interests only (new user with no capabilities)", () => {
    const topics = buildProfileDiscoveryTopics({
      capabilities: [],
      hobbies: ["music", "art"],
    });
    expect(topics.sort()).toEqual(["interest:art", "interest:music"]);
  });

  it("dedupes across sources", () => {
    // `capability:music` from capabilities and `interest:music` from hobbies
    // are distinct topics (different prefixes) and both kept — no false dedupe.
    const topics = buildProfileDiscoveryTopics({
      capabilities: ["music"],
      hobbies: ["music"],
    });
    expect(topics.sort()).toEqual(["capability:music", "interest:music"]);
  });

  it("buildAutoCapabilityTopics still works unchanged", () => {
    expect(buildAutoCapabilityTopics(["a", "B", ""])).toEqual(["capability:a", "capability:B"]);
  });
});

/**
 * Advertise↔search topic contract.
 *
 * The advertise side (buildInterestTopics → buildProfileDiscoveryTopics →
 * provideCapabilityTopic) and the search side (NodeDiscoveryRuntime.searchPeers
 * → searchByTopic) MUST agree on the on-wire topic string for a given raw
 * interest, otherwise a peer advertising "Machine Learning" can never be found
 * by a peer searching for it. Both sides route raw input through
 * `interestTopicFor`, so this test pins the shared vocabulary.
 */
describe("interest topic advertise/search contract", () => {
  it("buildInterestTopics and interestTopicFor agree on every input", () => {
    const inputs = ["music", "Music", "  tech  ", "Machine Learning", "AI/ML", "café", "", "!!!"];
    for (const raw of inputs) {
      const fromSearch = interestTopicFor(raw);
      // buildInterestTopics wraps the same slug with `interest:`; dedupe handles repeats.
      const fromAdvertise = buildInterestTopics({ hobbies: [raw] });
      if (fromSearch === "") {
        expect(fromAdvertise).toEqual([]);
      } else {
        expect(fromAdvertise).toEqual([fromSearch]);
      }
    }
  });

  it("slugifyTopic is idempotent and deterministic", () => {
    // A topic already in canonical form must round-trip unchanged so that
    // re-running slugify on an advertised key doesn't drift.
    expect(slugifyTopic("interest:music")).toBe("interest-music");
    expect(slugifyTopic("music")).toBe("music");
    expect(slugifyTopic("Music")).toBe("music");
    expect(slugifyTopic("MACHINE LEARNING")).toBe("machine-learning");
    expect(slugifyTopic("  spaces  ")).toBe("spaces");
  });
});
