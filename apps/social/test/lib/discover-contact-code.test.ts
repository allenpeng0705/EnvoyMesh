import { describe, expect, it } from "vitest";
import { looksLikePeerId, parseContactCode } from "../../src/lib/discover-contact-code.js";

describe("parseContactCode", () => {
  it("extracts peer id from multiaddr", () => {
    expect(
      parseContactCode("/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWExamplePeerId"),
    ).toEqual({ kind: "peer-id", peerId: "12D3KooWExamplePeerId" });
  });

  it("recognizes unified contact URIs", () => {
    const parsed = parseContactCode("envoy://contact?v=1&peerId=12D3KooWExamplePeerId&join=abc");
    expect(parsed.kind).toBe("contact");
    if (parsed.kind === "contact") {
      expect(parsed.peerId).toBe("12D3KooWExamplePeerId");
      expect(parsed.wanJoinToken).toBe("abc");
    }
  });

  it("recognizes join invite URIs and extracts token", () => {
    expect(parseContactCode("envoy://join?token=abc")).toEqual({
      kind: "wan-join",
      inviteUri: "envoy://join?token=abc",
      wanJoinToken: "abc",
    });
  });

  it("recognizes pair URIs separately", () => {
    expect(parseContactCode("envoy://pair?token=xyz")).toEqual({
      kind: "pair",
      inviteUri: "envoy://pair?token=xyz",
      pairUri: "envoy://pair?token=xyz",
    });
  });

  it("accepts raw libp2p peer ids", () => {
    const peerId = "12D3KooWTestPeerRunEnoughForCheckingHere123456789ABCD";
    expect(parseContactCode(peerId)).toEqual({ kind: "peer-id", peerId });
  });

  it("rejects random text with a helpful message", () => {
    const parsed = parseContactCode("hello friend");
    expect(parsed.kind).toBe("invalid");
    if (parsed.kind === "invalid") {
      expect(parsed.message).toMatch(/contact code/i);
    }
  });
});

describe("looksLikePeerId", () => {
  it("accepts typical peer id prefixes", () => {
    expect(looksLikePeerId("12D3KooWTestPeerRunEnoughForCheckingHere123456789ABCD")).toBe(true);
  });

  it("rejects short strings", () => {
    expect(looksLikePeerId("hello")).toBe(false);
  });
});
