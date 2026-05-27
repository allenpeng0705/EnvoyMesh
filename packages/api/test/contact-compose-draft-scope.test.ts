import { describe, expect, it } from "vitest";
import { contactComposeDraftSyncScope, isContactComposeDraftSyncScope } from "@envoymesh/api";

describe("contact compose draft sync scope", () => {
  it("builds stable per-contact scope", () => {
    expect(contactComposeDraftSyncScope("envoy:owner:abc")).toBe(
      "contact-compose-draft:v1:envoy:owner:abc",
    );
  });

  it("detects contact compose scopes", () => {
    expect(isContactComposeDraftSyncScope("contact-compose-draft:v1:envoy:owner:x")).toBe(true);
    expect(isContactComposeDraftSyncScope("assistant-draft:v1")).toBe(false);
  });
});
