import { describe, expect, it } from "vitest";
import {
  profileCapabilityDiscoveryTopics,
  profileCapabilityTags,
  syncProfileTagsToManifestCapabilities,
} from "../src/profile-capabilities.js";

describe("profile-capabilities", () => {
  it("extracts tag and descriptor entries", () => {
    expect(
      profileCapabilityTags([
        { tag: "coding-help" },
        { tag: " Expertise:Rust " },
        { descriptor: "custom-offer" },
        { type: "ignored", confidence: 1 },
      ]),
    ).toEqual(["coding-help", "expertise:rust", "custom-offer"]);
  });

  it("builds DHT topics for raw tag and capability prefix", () => {
    expect(profileCapabilityDiscoveryTopics(["coding-help"])).toEqual([
      "coding-help",
      "capability:coding-help",
    ]);
  });

  it("adds new profile tags and removes dropped tags from manifest capabilities", () => {
    expect(
      syncProfileTagsToManifestCapabilities({
        manifestCapabilities: ["mesh.listen", "coding-help", "expertise:rust", "manual-cap"],
        previousProfileTags: ["coding-help", "expertise:rust"],
        nextProfileTags: ["coding-help", "design-review"],
      }),
    ).toEqual({
      changed: true,
      capabilities: ["mesh.listen", "coding-help", "manual-cap", "design-review"],
    });
  });

  it("removes all previously profile-synced tags when profile chips are cleared", () => {
    expect(
      syncProfileTagsToManifestCapabilities({
        manifestCapabilities: ["mesh.listen", "coding-help"],
        previousProfileTags: ["coding-help"],
        nextProfileTags: [],
      }),
    ).toEqual({
      changed: true,
      capabilities: ["mesh.listen"],
    });
  });

  it("does not remove manifest capabilities that were never on the profile", () => {
    expect(
      syncProfileTagsToManifestCapabilities({
        manifestCapabilities: ["mesh.listen", "manual-cap"],
        previousProfileTags: ["coding-help"],
        nextProfileTags: [],
      }),
    ).toEqual({
      changed: false,
      capabilities: ["mesh.listen", "manual-cap"],
    });
  });
});
