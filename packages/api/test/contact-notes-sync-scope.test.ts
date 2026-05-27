import { describe, expect, it } from "vitest";
import { contactNotesSyncScope, isContactNotesSyncScope } from "@envoymesh/api";

describe("contact notes sync scope", () => {
  it("builds stable per-contact scope", () => {
    expect(contactNotesSyncScope("envoy:owner:abc")).toBe("contact-notes:v1:envoy:owner:abc");
  });

  it("detects contact notes scopes", () => {
    expect(isContactNotesSyncScope("contact-notes:v1:envoy:owner:x")).toBe(true);
    expect(isContactNotesSyncScope("contact-compose-draft:v1:x")).toBe(false);
  });
});
