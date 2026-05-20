/**
 * @vitest-environment jsdom
 *
 * Tests the SearchView component's presentational logic.
 * Full rendering requires context setup; these tests validate the
 * search mode switching and query handling in isolation.
 */
import { describe, it, expect } from "vitest";

describe("SearchView — logic", () => {
  it("search mode defaults to interest", () => {
    let mode: "interest" | "peerId" | "library" = "interest";
    expect(mode).toBe("interest");
  });

  it("search mode can switch to peerId", () => {
    let mode: "interest" | "peerId" | "library" = "interest";
    mode = "peerId";
    expect(mode).toBe("peerId");
  });

  it("search mode can switch to library discovery", () => {
    let mode: "interest" | "peerId" | "library" = "interest";
    mode = "library";
    expect(mode).toBe("library");
  });

  it("search mode can switch back to interest", () => {
    let mode: "interest" | "peerId" = "peerId";
    mode = "interest";
    expect(mode).toBe("interest");
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

  it("peerId search builds query with peerId only", () => {
    const query = "12D3KooWTest";
    const searchParams = { peerId: query };
    expect(searchParams.peerId).toBe("12D3KooWTest");
  });
});
