import { describe, expect, it } from "vitest";
import { buildEnvoyContactQrUri, buildEnvoyContactUri, parseEnvoyContactUri } from "../src/envoy-contact-link.js";
import { encodeWanJoinInviteV1 } from "../src/wan-join-invite.js";

describe("envoy-contact-link", () => {
  const joinToken = encodeWanJoinInviteV1({
    v: 1,
    createdAt: "2026-05-28T00:00:00.000Z",
    bootstrapPeers: ["/ip4/10.0.0.1/tcp/4001/p2p/peer-a"],
    bootstrapPresets: ["cn-relay"],
  });

  it("round-trips contact URI fields", () => {
    const uri = buildEnvoyContactUri({
      peerId: "12D3KooWPeerExample",
      joinToken,
      displayName: "Alice",
      ownerId: "envoy:owner:alice",
    });
    expect(uri.startsWith("envoy://contact?")).toBe(true);
    const parsed = parseEnvoyContactUri(uri);
    expect(parsed.peerId).toBe("12D3KooWPeerExample");
    expect(parsed.joinToken).toBe(joinToken);
    expect(parsed.displayName).toBe("Alice");
    expect(parsed.ownerId).toBe("envoy:owner:alice");
  });

  it("accepts embedded envoy://join in join param", () => {
    const uri = buildEnvoyContactUri({
      joinToken: `envoy://join?token=${joinToken}`,
      peerId: "12D3KooWPeerExample",
    });
    const parsed = parseEnvoyContactUri(uri);
    expect(parsed.joinToken).toBe(joinToken);
  });

  it("buildEnvoyContactQrUri omits join token for QR-safe payload", () => {
    const qrUri = buildEnvoyContactQrUri({
      peerId: "12D3KooWPeerExample",
      displayName: "Alice",
      ownerId: "envoy:owner:alice",
    });
    expect(qrUri).not.toContain("join=");
    expect(qrUri.length).toBeLessThan(300);
    const parsed = parseEnvoyContactUri(qrUri);
    expect(parsed.peerId).toBe("12D3KooWPeerExample");
    expect(parsed.joinToken).toBeUndefined();
  });
});
