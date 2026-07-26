import { describe, expect, it } from "vitest";
import { webContentUrl, sectionContentUrl } from "../src/lib/web-content-urls.js";

const OWNER = "envoy:owner:abc123";

describe("webContentUrl", () => {
  it("builds profile root URL", () => {
    expect(webContentUrl(OWNER, "profile")).toBe(`envoy://${OWNER}/`);
  });

  it("builds blog listing URL", () => {
    expect(webContentUrl(OWNER, "blog")).toBe(`envoy://${OWNER}/blog/`);
  });

  it("builds photowall listing URL", () => {
    expect(webContentUrl(OWNER, "photowall")).toBe(`envoy://${OWNER}/photos/wall/`);
  });

  it("builds notes listing URL", () => {
    expect(webContentUrl(OWNER, "notes")).toBe(`envoy://${OWNER}/notes/`);
  });

  it("builds feeds listing URL", () => {
    expect(webContentUrl(OWNER, "feeds")).toBe(`envoy://${OWNER}/feeds/`);
  });

  it("builds custom section URL", () => {
    expect(sectionContentUrl(OWNER, "market")).toBe(`envoy://${OWNER}/market/`);
    expect(sectionContentUrl(OWNER, "/market/")).toBe(`envoy://${OWNER}/market/`);
  });
});
