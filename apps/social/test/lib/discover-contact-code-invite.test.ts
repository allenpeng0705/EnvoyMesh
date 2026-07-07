/**
 * Tests for envoy://invite parsing in parseContactCode — the P0 fix that
 * unblocked company/kiosk invite redemption for joiners.
 */
import { describe, it, expect } from "vitest";
import { parseContactCode } from "../../src/lib/discover-contact-code.js";

describe("parseContactCode — envoy://invite parsing", () => {
  it("parses a full envoy://invite URI with token + wsUrl + ownerId", () => {
    const uri = "envoy://invite?token=abc123secret&wsUrl=ws%3A%2F%2Fhome.node%3A3030%2Fws&ownerId=envoy%3Aowner%3Aabc";
    const result = parseContactCode(uri);
    expect(result.kind).toBe("invite");
    if (result.kind !== "invite") return;
    expect(result.token).toBe("abc123secret");
    expect(result.wsUrl).toBe("ws://home.node:3030/ws");
    expect(result.ownerId).toBe("envoy:owner:abc");
  });

  it("parses a minimal envoy://invite with only token", () => {
    const result = parseContactCode("envoy://invite?token=only-token");
    expect(result.kind).toBe("invite");
    if (result.kind !== "invite") return;
    expect(result.token).toBe("only-token");
    expect(result.wsUrl).toBeUndefined();
  });

  it("parses the lenient invite?token= form (no envoy:// prefix)", () => {
    const result = parseContactCode("invite?token=lenient-form&wsUrl=ws%3A%2F%2Fhost");
    expect(result.kind).toBe("invite");
    if (result.kind !== "invite") return;
    expect(result.token).toBe("lenient-form");
  });

  it("returns invite-invalid for an envoy://invite without a token", () => {
    const result = parseContactCode("envoy://invite?wsUrl=ws%3A%2F%2Fhost");
    expect(result.kind).toBe("invite-invalid");
  });

  it("returns invite-invalid for a malformed envoy://invite URI", () => {
    const result = parseContactCode("envoy://invite?token="); // empty token
    expect(result.kind).toBe("invite-invalid");
  });

  it("does NOT confuse envoy://invite with envoy://pair or envoy://contact", () => {
    expect(parseContactCode("envoy://pair?token=x").kind).toBe("pair");
    expect(parseContactCode("envoy://contact?peerId=12D3KooW").kind).toBe("contact");
    expect(parseContactCode("envoy://join?token=x").kind).toBe("wan-join");
  });

  it("does NOT accept arbitrary schemes as invites (clipboard-injection guard)", () => {
    // A random URL with token= should NOT be treated as an invite.
    expect(parseContactCode("https://evil.com?token=stolen").kind).not.toBe("invite");
    expect(parseContactCode("ownerPublicKey=PEM&token=x").kind).not.toBe("invite");
  });
});
