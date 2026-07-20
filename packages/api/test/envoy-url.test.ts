import { describe, it, expect } from "vitest";
import {
  tryParseEnvoyUrl,
  parseEnvoyUrl,
  resolveEnvoyUrl,
  buildEnvoyUrl,
  isEnvoyContentUrl,
  isEnvoyContactUri,
  InvalidEnvoyUrlError,
  HandleRegistryNotImplementedError,
} from "../src/envoy-url.js";

const OWNER_A = "envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I";

describe("envoy-url parser", () => {
  describe("tryParseEnvoyUrl — owner-id form", () => {
    it("parses root URL (empty path)", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/`);
      expect(r).toEqual({
        kind: "content",
        owner: OWNER_A,
        ownerForm: "owner-id",
        path: "",
        raw: `envoy://${OWNER_A}/`,
      });
    });

    it("parses root URL without trailing slash", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}`);
      expect(r).toMatchObject({ kind: "content", owner: OWNER_A, path: "" });
    });

    it("parses single-segment path", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/hello.md`);
      expect(r).toMatchObject({ kind: "content", path: "hello.md" });
    });

    it("parses nested path", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/blog/posts/hello-world`);
      expect(r).toMatchObject({ kind: "content", path: "blog/posts/hello-world" });
    });

    it("parses path with trailing slash", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/blog/`);
      expect(r).toMatchObject({ kind: "content", path: "blog/" });
    });

    it("ownerForm is owner-id for envoy:owner: authority", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/x`);
      expect(r?.kind === "content" && r.ownerForm).toBe("owner-id");
    });
  });

  describe("tryParseEnvoyUrl — handle form (reserved for v2)", () => {
    it("parses @handle URL without throwing", () => {
      const r = tryParseEnvoyUrl("envoy://@allen/blog/hello");
      expect(r).toMatchObject({
        kind: "content",
        owner: "@allen",
        ownerForm: "handle",
        path: "blog/hello",
      });
    });

    it("parses @handle root URL", () => {
      const r = tryParseEnvoyUrl("envoy://@allen/");
      expect(r).toMatchObject({ kind: "content", owner: "@allen", ownerForm: "handle" });
    });
  });

  describe("tryParseEnvoyUrl — disambiguation from pairing URIs", () => {
    it("classifies envoy://contact?... as non-content", () => {
      const r = tryParseEnvoyUrl("envoy://contact?v=1&peerId=12D3KooWabc");
      expect(r?.kind).toBe("non-content");
    });

    it("classifies envoy://contact (no query) as non-content", () => {
      const r = tryParseEnvoyUrl("envoy://contact");
      expect(r?.kind).toBe("non-content");
    });

    it("returns null for empty input", () => {
      expect(tryParseEnvoyUrl("")).toBeNull();
      expect(tryParseEnvoyUrl("   ")).toBeNull();
    });

    it("returns null for non-envoy schemes", () => {
      expect(tryParseEnvoyUrl("https://example.com/foo")).toBeNull();
      expect(tryParseEnvoyUrl("http://foo")).toBeNull();
      expect(tryParseEnvoyUrl("file:///etc/passwd")).toBeNull();
    });

    it("returns null for envoy:// with unknown authority", () => {
      const r = tryParseEnvoyUrl("envoy://foo/bar");
      expect(r?.kind).toBe("non-content");
    });
  });

  describe("percent-encoding", () => {
    it("decodes percent-encoded CJK paths", () => {
      // 我的旅行 percent-encoded
      const r = tryParseEnvoyUrl(
        `envoy://${OWNER_A}/blog/posts/%E6%88%91%E7%9A%84%E6%97%85%E8%A1%8C`,
      );
      expect(r).toMatchObject({ path: "blog/posts/我的旅行" });
    });

    it("decodes percent-encoded spaces", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/hello%20world.md`);
      expect(r).toMatchObject({ path: "hello world.md" });
    });

    it("leaves already-decoded Unicode in path (URL parser accepts it)", () => {
      const r = tryParseEnvoyUrl(`envoy://${OWNER_A}/posts/我的旅行`);
      expect(r).toMatchObject({ path: "posts/我的旅行" });
    });
  });

  describe("parseEnvoyUrl — throwing variant", () => {
    it("parses valid content URL", () => {
      const r = parseEnvoyUrl(`envoy://${OWNER_A}/hello`);
      expect(r).toMatchObject({ owner: OWNER_A, path: "hello", ownerForm: "owner-id" });
    });

    it("throws InvalidEnvoyUrlError on empty input", () => {
      expect(() => parseEnvoyUrl("")).toThrow(InvalidEnvoyUrlError);
    });

    it("throws InvalidEnvoyUrlError on non-envoy input", () => {
      expect(() => parseEnvoyUrl("https://foo")).toThrow(InvalidEnvoyUrlError);
    });

    it("throws InvalidEnvoyUrlError on pairing URI", () => {
      expect(() => parseEnvoyUrl("envoy://contact?v=1")).toThrow(InvalidEnvoyUrlError);
    });

    it("throws InvalidEnvoyUrlError on unknown authority", () => {
      expect(() => parseEnvoyUrl("envoy://random/foo")).toThrow(InvalidEnvoyUrlError);
    });
  });

  describe("resolveEnvoyUrl", () => {
    it("resolves owner-id form to targetOwnerId + path", () => {
      const r = resolveEnvoyUrl(`envoy://${OWNER_A}/blog/hello`);
      expect(r).toEqual({ targetOwnerId: OWNER_A, path: "blog/hello" });
    });

    it("resolves root URL to empty path", () => {
      const r = resolveEnvoyUrl(`envoy://${OWNER_A}/`);
      expect(r).toEqual({ targetOwnerId: OWNER_A, path: "" });
    });

    it("throws HandleRegistryNotImplementedError on @handle form", () => {
      expect(() => resolveEnvoyUrl("envoy://@allen/blog/hello")).toThrow(
        HandleRegistryNotImplementedError,
      );
    });

    it("accepts a pre-parsed object", () => {
      const parsed = parseEnvoyUrl(`envoy://${OWNER_A}/x`);
      const r = resolveEnvoyUrl(parsed);
      expect(r).toEqual({ targetOwnerId: OWNER_A, path: "x" });
    });
  });

  describe("buildEnvoyUrl", () => {
    it("builds root URL for empty path", () => {
      expect(buildEnvoyUrl(OWNER_A)).toBe(`envoy://${OWNER_A}/`);
    });

    it("builds URL with single-segment path", () => {
      expect(buildEnvoyUrl(OWNER_A, "hello.md")).toBe(`envoy://${OWNER_A}/hello.md`);
    });

    it("builds URL with nested path", () => {
      expect(buildEnvoyUrl(OWNER_A, "blog/posts/hello-world")).toBe(
        `envoy://${OWNER_A}/blog/posts/hello-world`,
      );
    });

    it("percent-encodes spaces in path segments", () => {
      expect(buildEnvoyUrl(OWNER_A, "hello world.md")).toBe(
        `envoy://${OWNER_A}/hello%20world.md`,
      );
    });

    it("percent-encodes CJK in path segments", () => {
      expect(buildEnvoyUrl(OWNER_A, "posts/我的旅行")).toBe(
        `envoy://${OWNER_A}/posts/%E6%88%91%E7%9A%84%E6%97%85%E8%A1%8C`,
      );
    });

    it("accepts @handle owner form", () => {
      expect(buildEnvoyUrl("@allen", "blog/x")).toBe("envoy://@allen/blog/x");
    });

    it("throws on missing ownerId", () => {
      expect(() => buildEnvoyUrl("")).toThrow(InvalidEnvoyUrlError);
    });

    it("throws on ownerId without prefix", () => {
      expect(() => buildEnvoyUrl("allen", "x")).toThrow(InvalidEnvoyUrlError);
    });
  });

  describe("round-trip: build → parse → resolve", () => {
    it("round-trips a simple path", () => {
      const url = buildEnvoyUrl(OWNER_A, "blog/hello.md");
      const { targetOwnerId, path } = resolveEnvoyUrl(url);
      expect(targetOwnerId).toBe(OWNER_A);
      expect(path).toBe("blog/hello.md");
    });

    it("round-trips a CJK path", () => {
      const url = buildEnvoyUrl(OWNER_A, "posts/我的旅行");
      const { path } = resolveEnvoyUrl(url);
      expect(path).toBe("posts/我的旅行");
    });

    it("round-trips root URL", () => {
      const url = buildEnvoyUrl(OWNER_A);
      const { targetOwnerId, path } = resolveEnvoyUrl(url);
      expect(targetOwnerId).toBe(OWNER_A);
      expect(path).toBe("");
    });
  });

  describe("type guards", () => {
    it("isEnvoyContentUrl returns true for content URLs", () => {
      expect(isEnvoyContentUrl(`envoy://${OWNER_A}/hello`)).toBe(true);
      expect(isEnvoyContentUrl("envoy://@allen/x")).toBe(true);
    });

    it("isEnvoyContentUrl returns false for pairing URIs", () => {
      expect(isEnvoyContentUrl("envoy://contact?v=1")).toBe(false);
    });

    it("isEnvoyContentUrl returns false for non-envoy URLs", () => {
      expect(isEnvoyContentUrl("https://foo")).toBe(false);
      expect(isEnvoyContentUrl("")).toBe(false);
    });

    it("isEnvoyContactUri returns true for contact URIs", () => {
      expect(isEnvoyContactUri("envoy://contact?v=1&peerId=x")).toBe(true);
    });

    it("isEnvoyContactUri returns false for content URLs", () => {
      expect(isEnvoyContactUri(`envoy://${OWNER_A}/x`)).toBe(false);
    });
  });

  describe("malformed input handling", () => {
    it("tryParse returns non-content for envoy:// with no authority", () => {
      // `envoy:///path` has empty authority — not a content URL.
      // Returns non-content (not null) so callers can fall through to
      // the pairing URI parser if applicable.
      const r = tryParseEnvoyUrl("envoy:///path");
      expect(r?.kind).toBe("non-content");
    });

    it("tryParse returns non-content for double-slash-only input", () => {
      const r = tryParseEnvoyUrl("envoy://");
      expect(r?.kind).toBe("non-content");
    });

    it("parseEnvoyUrl throws on envoy:// with no authority", () => {
      expect(() => parseEnvoyUrl("envoy:///path")).toThrow(InvalidEnvoyUrlError);
    });
  });
});
