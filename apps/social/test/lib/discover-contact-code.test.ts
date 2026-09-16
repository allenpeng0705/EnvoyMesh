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

describe("another app's pairing code", () => {
  it("is refused before a connection is attempted, in the user's words", () => {
    // The node cannot refuse this: the token inside the code is opaque and app-local,
    // so a cross-app pairing only ever arrives as "someone scanned the wrong code and
    // the app dialled the URL in it". The scanner is therefore the enforcement point.
    const parsed = parseContactCode("envoy://pair?wsUrl=ws%3A%2F%2F127.0.0.1%3A4040%2Fws&token=t&app=EnvoyDev");
    expect(parsed.kind).toBe("invalid");
    const message = parsed.kind === "invalid" ? parsed.message : "";
    expect(message).toContain("EnvoyDev");
    expect(message).toMatch(/show its pairing code|install/i);
  });

  it("still accepts its own app, and a code that names none", () => {
    expect(parseContactCode("envoy://pair?wsUrl=ws%3A%2F%2Fx&token=t&app=EnvoyMesh").kind).toBe("pair");
    // Codes minted before the field existed keep working.
    expect(parseContactCode("envoy://pair?wsUrl=ws%3A%2F%2Fx&token=t").kind).toBe("pair");
  });

  it("does not throw on a malformed pair URI", () => {
    // A paste handler must never surface an exception because someone typed junk.
    expect(() => parseContactCode("envoy://pair?%%%")).not.toThrow();
  });
});
});
