import { describe, expect, it, vi } from "vitest";
import {
  classifySponsorError,
  runSetupSponsorFriendViaRuntime,
} from "../src/node-service-setup-sponsor-friend.js";

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
      loadNodeProfile: async () => undefined,
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

describe("classifySponsorError", () => {
  it("classifies 'No reachable path' as network-unreachable", () => {
    expect(
      classifySponsorError(
        "Failed to send hello: No reachable path to 12D3KooWQsD3… before call send",
      ),
    ).toBe("network-unreachable");
  });

  it("classifies transport-layer reachability errors as network-unreachable", () => {
    expect(classifySponsorError("connect ECONNREFUSED 1.2.3.4:4001")).toBe(
      "network-unreachable",
    );
    expect(classifySponsorError("dial tcp: i/o timeout")).toBe(
      "network-unreachable",
    );
    expect(classifySponsorError("relay tunnel: connection closed")).toBe(
      "network-unreachable",
    );
  });

  it("classifies proof-of-context errors as proof-token-mismatch", () => {
    expect(classifySponsorError("proof of context mismatch")).toBe(
      "proof-token-mismatch",
    );
    expect(classifySponsorError("bond.request rejected: invalid proof token")).toBe(
      "proof-token-mismatch",
    );
  });

  it("falls back to 'other' for unrecognized errors", () => {
    expect(classifySponsorError("rate limited")).toBe("other");
    expect(classifySponsorError(undefined)).toBe("other");
  });
});

describe("runSetupSponsorFriendViaRuntime — error kind", () => {
  it("persists lastErrorKind='network-unreachable' when transport can't reach sponsor", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => {
      throw new Error("Failed to send hello: No reachable path to 12D3KooWQsD3… before call send");
    });

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
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
    });

    expect(result.ok).toBe(false);
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastError: expect.stringContaining("No reachable path"),
        setupSponsorFriendLastErrorKind: "network-unreachable",
      }),
    );
  });

  it("persists lastErrorKind='proof-token-mismatch' when proof is wrong", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => {
      throw new Error("bond.request rejected: invalid proof token");
    });

    await runSetupSponsorFriendViaRuntime({
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
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
    });

    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastError: expect.stringContaining("invalid proof token"),
        setupSponsorFriendLastErrorKind: "proof-token-mismatch",
      }),
    );
  });
});
