import { describe, expect, it } from "vitest";
import { isLibp2pPeerId } from "../src/profile-sync-outbound.js";

describe("isLibp2pPeerId", () => {
  it("accepts libp2p peer ids and rejects Envoy envelope ids", () => {
    expect(isLibp2pPeerId("12D3KooWTestPeerIdForProfileSync")).toBe(true);
    expect(isLibp2pPeerId("envoy_1KoMqLW3ZC7LAhZGVvWvu7vsSYe7wHnkiVQmby3v_Y0")).toBe(false);
    expect(isLibp2pPeerId("envoy:owner:abc")).toBe(false);
  });
});
