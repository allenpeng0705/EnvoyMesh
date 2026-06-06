import { describe, expect, it } from "vitest";

import { assertEnvoyPairQrText } from "../src/lib/decode-envoy-pair-qr.js";

describe("assertEnvoyPairQrText", () => {
  it("accepts a valid envoy pair URI", () => {
    const uri =
      "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000&token=tok123&ownerPublicKey=-----BEGIN%20PUBLIC%20KEY-----&ownerId=envoy%3Aowner%3Aabc&agentPeerId=envoy_agent_x&agentName=HomeClaw&homeNodePeerId=home-peer";
    expect(assertEnvoyPairQrText(uri)).toBe(uri);
  });

  it("rejects non-pair QR text", () => {
    expect(() => assertEnvoyPairQrText("https://example.com")).toThrow();
  });
});
