import { describe, expect, it } from "vitest";
import { buildProfilePortalHtml } from "@envoymesh/api";
import { parseProfilePortalHtml } from "../../src/lib/parse-profile-portal-html.js";

describe("parseProfilePortalHtml", () => {
  it("extracts profile fields and mosaic photos without Blog/Photos nav", () => {
    const html = buildProfilePortalHtml({
      ownerId: "envoy:owner:alice",
      displayName: "Alice",
      username: "alice",
      bio: "Hello & welcome",
      hobbies: ["hiking"],
      knowledge: ["maps"],
      capabilities: [{ tag: "guide" }],
      avatarUrl: "envoy://envoy:owner:alice/avatar.jpg",
      photos: [
        {
          title: "Trip",
          url: "envoy://envoy:owner:alice/photos/wall/gallery-1.jpg",
        },
      ],
    });

    const portal = parseProfilePortalHtml(html);
    expect(portal).not.toBeNull();
    expect(portal!.displayName).toBe("Alice");
    expect(portal!.username).toBe("alice");
    expect(portal!.bio).toBe("Hello & welcome");
    expect(portal!.avatarUrl).toBe("envoy://envoy:owner:alice/avatar.jpg");
    expect(portal!.interests).toEqual(["hiking"]);
    expect(portal!.knowledge).toEqual(["maps"]);
    expect(portal!.capabilities).toEqual(["guide"]);
    expect(portal!.photos).toEqual([
      {
        title: "Trip",
        url: "envoy://envoy:owner:alice/photos/wall/gallery-1.jpg",
      },
    ]);
    expect(html).not.toContain(">Blog<");
    expect(html).not.toContain("em-nav");
  });

  it("returns null for non-portal HTML", () => {
    expect(parseProfilePortalHtml("<html><body>hi</body></html>")).toBeNull();
  });
});
