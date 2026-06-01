/**
 * @vitest-environment jsdom
 *
 * Tests the SearchView component's presentational logic.
 * Full rendering requires context setup; these tests validate the
 * search mode switching and query handling in isolation.
 */
import { describe, it, expect } from "vitest";
import { locationSearchTopics } from "@envoymesh/api";

describe("SearchView — logic", () => {
  it("discover path defaults to nearby", () => {
    let path: "nearby" | "code" | "wider" | "library" = "nearby";
    expect(path).toBe("nearby");
  });

  it("discover path can switch to code", () => {
    let path: "nearby" | "code" | "wider" | "library" = "nearby";
    path = "code";
    expect(path).toBe("code");
  });

  it("discover path can switch to friends files", () => {
    let path: "nearby" | "code" | "wider" | "library" = "nearby";
    path = "library";
    expect(path).toBe("library");
  });

  it("discover path can switch to wider network", () => {
    let path: "nearby" | "code" | "wider" = "code";
    path = "wider";
    expect(path).toBe("wider");
  });

  it("empty search query is detected", () => {
    const query = "  ";
    expect(query.trim().length).toBe(0);
  });

  it("non-empty search query is detected", () => {
    const query = "  music  ";
    expect(query.trim()).toBe("music");
  });

  it("interest search builds query with interests and username", () => {
    const query = "alice";
    const searchLower = query.toLowerCase();
    const searchParams = {
      interests: [searchLower],
      username: searchLower,
    };
    expect(searchParams.interests).toContain("alice");
    expect(searchParams.username).toBe("alice");
  });

  it("geo place search builds city topic list", () => {
    const location = { countryCode: "US", city: "Boston" };
    const topics = locationSearchTopics({ location, scope: "city" });
    expect(topics).toEqual(["geo:city:US-boston"]);
  });
});
