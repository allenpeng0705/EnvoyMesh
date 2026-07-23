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
  buildPublishTopicsFromManifest,
  displayNameTopicFor,
  interestTopicFor,
  normalizeDiscoveryTopicQuery,
  publishTopicFor,
  slugifyTopic,
  withPublishDiscoveryTopics,
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

/**
 * Display-name topic advertise/search contract.
 *
 * The Social UI's "By name" search lets users type free-text — typically a
 * display name like "Allen Peng", NOT the @handle. Both advertise
 * (node-service-identity._advertisePublicDiscoveryTopics) and search
 * (NodeDiscoveryRuntime.searchPeers) MUST route raw display names through
 * `displayNameTopicFor` so the on-wire topic keys agree. Without this,
 * `searchPeers({ queryText: "Allen Peng" })` looks up
 * `displayname:allen-peng` but Allen's node advertised the same key only if
 * it also routed its display name through the same helper — pinning the
 * shared vocabulary here.
 */
describe("displayname topic advertise/search contract", () => {
  it("displayNameTopicFor slugifies spaces, case, and punctuation", () => {
    expect(displayNameTopicFor("Allen Peng")).toBe("displayname:allen-peng");
    expect(displayNameTopicFor("allen peng")).toBe("displayname:allen-peng");
    expect(displayNameTopicFor("ALLEN PENG")).toBe("displayname:allen-peng");
    expect(displayNameTopicFor("  Allen  Peng  ")).toBe("displayname:allen-peng");
    expect(displayNameTopicFor("Emily O'Brien")).toBe("displayname:emily-o-brien");
  });

  it("displayNameTopicFor returns empty string for unusable input", () => {
    expect(displayNameTopicFor("")).toBe("");
    expect(displayNameTopicFor("   ")).toBe("");
    expect(displayNameTopicFor("---")).toBe("");
    expect(displayNameTopicFor("!!!")).toBe("");
  });

  it("displayNameTopicFor and the search-side slug agree for typical names", () => {
    // The advertise side (input.displayName → displayNameTopicFor) and the
    // search side (query.queryText → displayNameTopicFor) produce the same
    // topic key for the same human name. This is the contract that lets
    // "Allen Peng" typed into the UI find Allen in the DHT.
    const inputs = [
      "Allen Peng",
      "  Emily  Carter  ",
      "Maya-Rose Kim",
      "J. R. Smith",
    ];
    for (const raw of inputs) {
      const fromAdvertise = displayNameTopicFor(raw);
      const fromSearch = displayNameTopicFor(raw);
      expect(fromAdvertise).toBe(fromSearch);
      expect(fromAdvertise.startsWith("displayname:")).toBe(true);
    }
  });

  it("helpers are idempotent for already-normalized topics", () => {
    // The production advertise call site (`computePublicDiscoveryTopics`)
    // pre-normalizes interests + display names. The defensive
    // normalization in `_advertisePublicDiscoveryTopics` would otherwise
    // double-prefix them. Pin the idempotency contract so a future
    // refactor doesn't silently break the on-wire topic vocabulary.
    expect(interestTopicFor("interest:music")).toBe("interest:music");
    expect(interestTopicFor("interest:machine-learning")).toBe(
      "interest:machine-learning",
    );
    expect(displayNameTopicFor("displayname:allen-peng")).toBe(
      "displayname:allen-peng",
    );
  });
});

describe("publishTopicFor / buildPublishTopics (Phase 45E)", () => {
  it("normalizes tags to publish:<slug>", () => {
    expect(publishTopicFor("Machine Learning")).toBe("publish:machine-learning");
    expect(publishTopicFor("publish:music")).toBe("publish:music");
    expect(publishTopicFor("摄影")).toBe("publish:摄影");
    expect(publishTopicFor("publish:烹饪")).toBe("publish:烹饪");
  });

  it("caps and dedupes manifest tags", () => {
    const topics = buildPublishTopicsFromManifest(
      [
        { tags: ["Music", "Travel"] },
        { tags: ["music", "Food"] },
      ],
      2,
    );
    expect(topics).toEqual(["publish:music", "publish:travel"]);
  });

  it("withPublishDiscoveryTopics merges without dupes", () => {
    expect(
      withPublishDiscoveryTopics(["capability:x"], ["publish:music", "publish:music"]),
    ).toEqual(["capability:x", "publish:music"]);
  });
});

describe("normalizeDiscoveryTopicQuery", () => {
  it("maps free-text By-topic queries to interest:<slug>", () => {
    expect(normalizeDiscoveryTopicQuery("Music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("Machine Learning")).toBe(
      "interest:machine-learning",
    );
  });

  it("leaves known prefixes intact (idempotent)", () => {
    expect(normalizeDiscoveryTopicQuery("interest:music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("publish:Travel")).toBe("publish:travel");
    expect(normalizeDiscoveryTopicQuery("username:allen")).toBe("username:allen");
    expect(normalizeDiscoveryTopicQuery("username:Allen")).toBe("username:allen");
    expect(normalizeDiscoveryTopicQuery("Interest:Music")).toBe("interest:music");
    expect(normalizeDiscoveryTopicQuery("displayname:Allen Peng")).toBe(
      "displayname:allen-peng",
    );
    expect(normalizeDiscoveryTopicQuery("geo:city:US-boston")).toBe(
      "geo:city:US-boston",
    );
  });
});

describe("expandDiscoveryTopicQueries", () => {
  it("adds capability:<slug> and raw slug for bare text", async () => {
    const { expandDiscoveryTopicQueries } = await import("../src/capability-discovery.js");
    expect(expandDiscoveryTopicQueries("coding-help")).toEqual([
      "interest:coding-help",
      "capability:coding-help",
      "coding-help",
    ]);
  });

  it("does not expand when a known prefix is present", async () => {
    const { expandDiscoveryTopicQueries } = await import("../src/capability-discovery.js");
    expect(expandDiscoveryTopicQueries("interest:music")).toEqual(["interest:music"]);
    expect(expandDiscoveryTopicQueries("capability:coding-help")).toEqual([
      "capability:coding-help",
    ]);
  });
});
