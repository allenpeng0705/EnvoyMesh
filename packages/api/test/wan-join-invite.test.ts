import { describe, expect, it } from "vitest";
import {
  buildEnvoyJoinUri,
  decodeWanJoinInviteV1,
  encodeWanJoinInviteV1,
  mergeWanJoinInviteBootstrap,
  parseEnvoyJoinUri,
  assertWanJoinInviteNotExpired,
} from "../src/wan-join-invite.js";

describe("wan-join-invite", () => {
  const sample = {
    v: 1 as const,
    createdAt: "2026-05-20T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    bootstrapPeers: ["/ip4/10.0.0.1/tcp/4001/p2p/peer-a"],
    bootstrapPresets: ["public-libp2p-am6"],
    targetPeerId: "12D3KooWPeer",
  };

  it("round-trips encode/decode", () => {
    const token = encodeWanJoinInviteV1(sample);
    const decoded = decodeWanJoinInviteV1(token);
    expect(decoded.bootstrapPeers).toEqual(sample.bootstrapPeers);
    expect(decoded.targetPeerId).toBe("12D3KooWPeer");
  });

  it("builds and parses envoy://join URI", () => {
    const token = encodeWanJoinInviteV1(sample);
    const uri = buildEnvoyJoinUri(token);
    expect(uri.startsWith("envoy://join?")).toBe(true);
    expect(parseEnvoyJoinUri(uri)).toBe(token);
    expect(parseEnvoyJoinUri(token)).toBe(token);
  });

  it("merges bootstrap without duplicates", () => {
    const merged = mergeWanJoinInviteBootstrap({
      bootstrapPeers: ["/ip4/10.0.0.1/tcp/4001/p2p/peer-a"],
      bootstrapPresets: ["cn-relay"],
      invite: sample,
    });
    expect(merged.bootstrapPeers).toContain("/ip4/10.0.0.1/tcp/4001/p2p/peer-a");
    expect(merged.bootstrapPeers).toContain("12D3KooWPeer");
    expect(merged.bootstrapPresets).toEqual(["cn-relay", "public-libp2p-am6"]);
  });

  it("rejects expired invites", () => {
    expect(() =>
      assertWanJoinInviteNotExpired(
        {
          ...sample,
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
        Date.parse("2026-05-20T00:00:00.000Z"),
      ),
    ).toThrow(/expired/i);
  });
});
