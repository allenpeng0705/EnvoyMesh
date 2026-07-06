import { describe, it, expect } from "vitest";
import { computePublicDiscoveryTopics } from "../src/node-service-identity.js";

describe("computePublicDiscoveryTopics", () => {
  it("returns lowercase trimmed interests from hobbies + knowledge", () => {
    const result = computePublicDiscoveryTopics({
      hobbies: ["Music", "  tech  "],
      knowledge: ["Science"],
      username: "alice",
    });
    expect(result.interests).toEqual(["music", "tech", "science"]);
  });

  it("builds username topic when username is present", () => {
    const result = computePublicDiscoveryTopics({
      hobbies: [],
      username: "Alice",
    });
    expect(result.usernameTopic).toBe("username:alice");
  });

  it("returns empty username topic when username is missing", () => {
    const result = computePublicDiscoveryTopics({ hobbies: [] });
    expect(result.usernameTopic).toBe("");
  });

  it("returns empty interests when profile has no hobbies/knowledge", () => {
    const result = computePublicDiscoveryTopics({ username: "x" });
    expect(result.interests).toEqual([]);
  });

  it("derives capability topics from profile capability tags", () => {
    const result = computePublicDiscoveryTopics({
      capabilities: [{ tag: "coding-help" }, { tag: "lang:en" }, { tag: "" }],
    });
    expect(result.capabilityTopics.some((t) => t.includes("coding-help"))).toBe(true);
  });

  it("handles full profile (terminal-like)", () => {
    const result = computePublicDiscoveryTopics({
      hobbies: ["music", "tech", "science", "travel", "food", "books"],
      knowledge: [],
      username: "shileipeng",
      discoveryLocation: { countryCode: "CN", regionCode: "BJ" },
      discoveryLocationPrecision: "country",
      capabilities: [
        { tag: "coding-help" },
        { tag: "lang:en" },
        { tag: "expertise:python" },
      ],
    });
    expect(result.interests).toHaveLength(6);
    expect(result.usernameTopic).toBe("username:shileipeng");
    expect(result.locationTopics.length).toBeGreaterThan(0);
    expect(result.capabilityTopics.length).toBeGreaterThan(0);
  });
});