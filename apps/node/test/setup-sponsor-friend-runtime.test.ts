import { describe, expect, it, vi } from "vitest";
import { runSetupSponsorFriendViaRuntime } from "../src/node-service-setup-sponsor-friend.js";

describe("runSetupSponsorFriendViaRuntime", () => {
  it("passes bundled peerId to sendHello when owner is not in peer directory", async () => {
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const saveNodeConfig = vi.fn(async () => {});

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => undefined,
      saveNodeConfig,
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello,
      loadHelloProfile: async () => ({
        displayName: "New User",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      assertOnline: () => {},
    });

    expect(result.ok).toBe(true);
    expect(sendHello).toHaveBeenCalledWith(
      "envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I",
      expect.objectContaining({ displayName: "New User" }),
      "Hello!",
      expect.objectContaining({
        proofOfContext: "EsPf9Kx2mN7vQ4wR8jL3hT6yB1cF5aZ8dG",
        targetPeerId: "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR",
      }),
    );
  });
});
