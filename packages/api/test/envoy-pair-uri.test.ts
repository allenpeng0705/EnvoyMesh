import { describe, expect, it } from "vitest";
import { parseEnvoyPairUri } from "../src/envoy-pair-uri.js";

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
});
