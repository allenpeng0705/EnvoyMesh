import { describe, expect, it, vi } from "vitest";
import {
  classifySponsorError,
  runSetupSponsorFriendViaRuntime,
} from "../src/node-service-setup-sponsor-friend.js";

/**
 * The runtime is fire-and-forget: the RPC kicks off the retry loop and
 * returns immediately. Tests that need to assert post-loop state must
 * wait until the mocked deps settle. `flushSponsorLoop` drains pending
 * microtasks + a few macrotask ticks (the loop awaits at least one
 * `sleep` between attempts and several awaited deps per attempt) so
 * `saveNodeConfig` calls land before the assertion.
 */
async function flushSponsorLoop() {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

describe("runSetupSponsorFriendViaRuntime", () => {
  it("returns { running: true } immediately and runs the loop in the background", async () => {
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const saveNodeConfig = vi.fn(async () => {});

    // The RPC returns immediately with `running: true`, NOT after the
    // retry loop completes. The UI then polls getSetupSponsorFriendStatus
    // (which reads the persisted state) to see the final outcome.
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
    expect(result.running).toBe(true);
    expect(result.ownerId).toBe("envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I");

    // Now wait for the background loop to actually call sendHello.
    await flushSponsorLoop();
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

describe("runSetupSponsorFriendViaRuntime — error kind (background loop)", () => {
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

    expect(result.running).toBe(true);
    await flushSponsorLoop();
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

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastError: expect.stringContaining("invalid proof token"),
        setupSponsorFriendLastErrorKind: "proof-token-mismatch",
      }),
    );
  });

  it("persists lastError when assertOnline() throws (e.g. node still 'starting')", async () => {
    // Regression: SetupView/NodeStateContext may call runSetupSponsorFriend
    // right after startNode() or after the Tauri node process restart for
    // OpenClaw provider env. The node is in `"starting"` state at that
    // moment, so _assertOnline() throws "Node is starting. Start the node
    // first." Before the fix, the throw escaped the for-loop's catch
    // block and no setupSponsorFriend* fields landed in node-config.json —
    // leaving the tile stuck on "Not started yet" with no actionable hint.
    const saveNodeConfig = vi.fn(async () => {});
    const assertOnline = vi.fn(() => {
      throw new Error("Node is starting. Start the node first.");
    });

    // Lower maxAttempts + retryDelayMs via the persisted config so the
    // test doesn't have to wait 12 × 5s for the loop to exhaust itself.
    // The bundled config (loaded from <repo>/bundled-sponsor-friend.json
    // by the runtime's loader) provides enabled + ownerId; persisted
    // overrides tune the retry budget.
    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => ({
        version: "0.1",
        profileDir: "/tmp/profile",
        discoveryProfile: "wan-default",
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
        setupSponsorFriendEnabled: true,
        setupSponsorFriendOwnerId: "envoy:owner:test",
        setupSponsorFriendPeerId: "12D3KooWTest",
        setupSponsorFriendMaxAttempts: 1,
        setupSponsorFriendRetryDelayMs: 0,
      }),
      saveNodeConfig,
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello: vi.fn(async () => ({ messageId: "msg-1" })),
      loadHelloProfile: async () => ({
        displayName: "New User",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      loadNodeProfile: async () => undefined,
      assertOnline,
    });

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastError: expect.stringContaining("Node is starting"),
        // "starting" is not in the network/proof regex; classify as "other"
        setupSponsorFriendLastErrorKind: "other",
      }),
    );
  });

  it("persists lastError when loadHelloProfile() throws", async () => {
    // Companion to the assertOnline regression — if the human profile
    // isn't initialized yet, the runtime should surface that as a clear
    // error in the tile instead of an opaque "Not started yet".
    const saveNodeConfig = vi.fn(async () => {});
    const loadHelloProfile = vi.fn(async () => {
      throw new Error("Human profile not initialized");
    });

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => ({
        version: "0.1",
        profileDir: "/tmp/profile",
        discoveryProfile: "wan-default",
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
        setupSponsorFriendEnabled: true,
        setupSponsorFriendOwnerId: "envoy:owner:test",
        setupSponsorFriendPeerId: "12D3KooWTest",
        setupSponsorFriendMaxAttempts: 1,
        setupSponsorFriendRetryDelayMs: 0,
      }),
      saveNodeConfig,
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello: vi.fn(async () => ({ messageId: "msg-1" })),
      loadHelloProfile,
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
    });

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastError: expect.stringContaining("Human profile not initialized"),
      }),
    );
  });
});
