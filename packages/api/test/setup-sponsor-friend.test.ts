import { describe, expect, it } from "vitest";
import {
  parseSetupSponsorFriendConfig,
  resolveSetupSponsorFriendConfig,
} from "../src/setup-sponsor-friend.js";

describe("setup-sponsor-friend", () => {
  it("resolves contact URI fields from bundled config", () => {
    const resolved = resolveSetupSponsorFriendConfig({
      bundled: {
        enabled: true,
        contactUri:
          "envoy://contact?v=1&ownerId=envoy:owner:abc&peerId=12D3KooGTest&join=token123&name=Sponsor",
        proofOfContext: "secret",
      },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.ownerId).toBe("envoy:owner:abc");
    expect(resolved.peerId).toBe("12D3KooGTest");
    expect(resolved.joinToken).toBe("token123");
    expect(resolved.proofOfContext).toBe("secret");
    expect(resolved.source).toBe("bundled");
  });

  it("persisted overrides bundled", () => {
    const resolved = resolveSetupSponsorFriendConfig({
      bundled: {
        enabled: true,
        ownerId: "envoy:owner:bundled",
        helloMessage: "Hi bundled",
      },
      persisted: {
        enabled: true,
        ownerId: "envoy:owner:persisted",
        helloMessage: "Hi persisted",
      },
    });
    expect(resolved.ownerId).toBe("envoy:owner:persisted");
    expect(resolved.helloMessage).toBe("Hi persisted");
    expect(resolved.source).toBe("merged");
  });

  it("parseSetupSponsorFriendConfig rejects missing enabled", () => {
    expect(parseSetupSponsorFriendConfig({ ownerId: "x" })).toBeUndefined();
  });

  it("resolveSetupSponsorFriendConfig surfaces proofOfContext for the UI hint", () => {
    const resolved = resolveSetupSponsorFriendConfig({
      bundled: {
        enabled: true,
        ownerId: "envoy:owner:abc",
        proofOfContext: "shared-secret-token",
        helloMessage: "Hi!",
      },
    });
    expect(resolved.enabled).toBe(true);
    expect(resolved.proofOfContext).toBe("shared-secret-token");
    // The UI uses this to decide whether to surface the
    // "ask the sponsor to set bondAutonomy.sponsorProofToken" hint.
    expect(Boolean(resolved.proofOfContext)).toBe(true);
  });

  it("resolveSetupSponsorFriendConfig leaves proofOfContext undefined when not bundled", () => {
    const resolved = resolveSetupSponsorFriendConfig({
      bundled: {
        enabled: true,
        ownerId: "envoy:owner:abc",
        helloMessage: "Hi!",
      },
    });
    expect(resolved.proofOfContext).toBeUndefined();
    // No proofOfContext → no auto-accept gate on the sponsor side, so
    // the UI should NOT surface the "configure sponsorProofToken" hint.
    expect(Boolean(resolved.proofOfContext)).toBe(false);
  });
});
