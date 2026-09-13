import { describe, expect, it } from "vitest";
import { buildEnvoyPairUri, parseEnvoyPairUri } from "../src/envoy-pair-uri.js";

describe("parseEnvoyPairUri", () => {
  it("parses a full envoy://pair URI", () => {
    const uri =
      "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000&token=tok123&ownerPublicKey=-----BEGIN%20PUBLIC%20KEY-----&ownerId=envoy%3Aowner%3Aabc&agentPeerId=envoy_agent_x&agentName=HomeClaw&homeNodePeerId=home-peer";
    expect(parseEnvoyPairUri(uri)).toEqual({
      wsUrl: "ws://relay.example:9000",
      token: "tok123",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----",
      ownerId: "envoy:owner:abc",
      relayPeerId: undefined,
      agentPeerId: "envoy_agent_x",
      agentPubKey: undefined,
      agentName: "HomeClaw",
      homeNodePeerId: "home-peer",
    });
  });

  it("accepts raw query strings", () => {
    const parsed = parseEnvoyPairUri(
      "wsUrl=ws://relay:9000&token=abc&ownerPublicKey=pk&ownerId=envoy:owner:1",
    );
    expect(parsed.wsUrl).toBe("ws://relay:9000");
    expect(parsed.token).toBe("abc");
  });

  it("rejects missing required fields", () => {
    expect(() => parseEnvoyPairUri("envoy://pair?wsUrl=ws://relay:9000")).toThrow(/token/i);
  });

  it("parses lanWsUrl when present (preferred for same-WiFi pairing)", () => {
    const uri =
      "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000%2Fws&token=tok123&ownerPublicKey=pk&ownerId=envoy%3Aowner%3Aabc&lanWsUrl=ws%3A%2F%2F192.168.1.100%3A3030%2Fws";
    const parsed = parseEnvoyPairUri(uri);
    expect(parsed.wsUrl).toBe("ws://relay.example:9000/ws");
    expect(parsed.lanWsUrl).toBe("ws://192.168.1.100:3030/ws");
  });
});

describe("relay fallback in the URI form (§7.4 upstream change)", () => {
  it("round-trips relayWsUrls, which the compact codec and the contract already carried", () => {
    // The gap this closes: `PairingPayload.relayWsUrls` existed in the contract and in the compact
    // token codec, but the `envoy://pair` URI could not express it — so a QR code could not offer a
    // relay fallback at all. Found while building EnvoyCoder (guide §7.4: contract changes travel
    // upstream, never into a product).
    const uri = buildEnvoyPairUri({
      wsUrl: "wss://relay.example:9000/ws",
      token: "tok",
      ownerPublicKey: "pk",
      ownerId: "envoy:owner:abc",
      app: "EnvoyCoder",
      relayPeerId: "12D3KooWrelay",
      relayWsUrls: ["wss://relay-a.example/ws", "wss://relay-b.example/ws"],
    });
    const parsed = parseEnvoyPairUri(uri);
    expect(parsed.relayWsUrls).toEqual([
      "wss://relay-a.example/ws",
      "wss://relay-b.example/ws",
    ]);
    expect(parsed.relayPeerId).toBe("12D3KooWrelay");
    // The app claim survives the round trip, which is what keeps the family's apps apart.
    expect(parsed.app).toBe("EnvoyCoder");
  });

  it("omits the field when there is nothing to advertise, and tolerates an empty list", () => {
    const uri = buildEnvoyPairUri({
      wsUrl: "ws://127.0.0.1:3030/ws",
      token: "t",
      ownerPublicKey: "pk",
      ownerId: "o",
      relayWsUrls: [],
    });
    expect(uri).not.toContain("relayWsUrls");
    expect(parseEnvoyPairUri(uri).relayWsUrls).toBeUndefined();
  });

  it("ignores blank entries rather than producing an empty relay URL", () => {
    const parsed = parseEnvoyPairUri(
      "envoy://pair?wsUrl=ws%3A%2F%2Fh%3A1%2Fws&token=t&ownerPublicKey=pk&ownerId=o&relayWsUrls=%20%2C%20wss%3A%2F%2Frelay.example%2Fws%20%2C%20",
    );
    expect(parsed.relayWsUrls).toEqual(["wss://relay.example/ws"]);
  });
});
