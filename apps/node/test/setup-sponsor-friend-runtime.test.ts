import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  classifySponsorError,
  runSetupSponsorFriendViaRuntime,
  __resetActiveSponsorLoopsForTests,
} from "../src/node-service-setup-sponsor-friend.js";

/**
 * The runtime is fire-and-forget: the RPC kicks off the retry loop and
 * returns immediately. Tests that need to assert post-loop state must
 * wait until the mocked deps settle. `flushSponsorLoop` drains pending
 * microtasks + a few macrotask ticks (the loop awaits at least one
 * `sleep` between attempts and several awaited deps per attempt) so
 * `saveNodeConfig` calls land before the assertion.
 *
 * The runtime also tracks in-flight loops in a module-level Set
 * (single-flight). If a test's loop hasn't fully released the lock
 * before the next test starts, the next test would skip the loop
 * entirely (returning `running: true` with no actual work). Reset
 * the set in `beforeEach` so each test starts clean.
 */
async function flushSponsorLoop() {
  for (let i = 0; i < 10; i++) {
    await new Promise<void>((r) => setTimeout(r, 0));
  }
}

beforeEach(() => {
  __resetActiveSponsorLoopsForTests();
});

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

  it("deduplicates concurrent calls (single-flight) so duplicate loops don't race on saveNodeConfig", async () => {
    // Regression: SetupView's auto-trigger and NodeStateContext's auto-trigger
    // can both fire around the same time (right after startNode, or when the
    // user clicks Retry during a running cycle). Without single-flight, two
    // loops would race on saveNodeConfig and dial-queue resources, doing up
    // to 24×30s of duplicated work. The first call must spawn the loop;
    // the second call must return `running: true` without spawning.
    //
    // Use a controlled `sendHello` defer so we can assert dedup BEFORE
    // releasing the single-flight lock — otherwise the lock release
    // happens in the background and races with the next test.
    let releaseSendHello: (() => void) | undefined;
    const sendHelloStarted = new Promise<void>((resolve) => {
      // Resolve on the first microtask after sendHello is called; the
      // test awaits this to know the first loop is mid-attempt, then
      // fires the second call.
      releaseSendHello = () => resolve();
    });
    const sendHelloGate = new Promise<void>((resolve) => {
      // Holds sendHello until the test explicitly releases it.
      const original = resolve;
      // Stash for the test to call.
      (sendHelloGate as unknown as { _release?: () => void })._release = original;
    });

    const sendHello = vi.fn(async () => {
      releaseSendHello?.();
      await sendHelloGate;
      return { messageId: "msg-1" };
    });

    const makeDeps = () => ({
      loadNodeConfig: async () => ({
        version: "0.1" as const,
        profileDir: "/tmp/profile",
        discoveryProfile: "wan-default" as const,
        enableMdns: true,
        relayEnabled: true,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" as const },
        chatAssistEnabled: false,
        contactAiPreferences: [],
        updatedAt: new Date().toISOString(),
        setupSponsorFriendEnabled: true,
        setupSponsorFriendOwnerId: "envoy:owner:dedup-test",
        setupSponsorFriendPeerId: "12D3KooWDedupTest",
        setupSponsorFriendMaxAttempts: 1,
        setupSponsorFriendRetryDelayMs: 0,
      }),
      saveNodeConfig: vi.fn(async () => {}),
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello,
      loadHelloProfile: async () => ({
        displayName: "Test",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
    });

    // Fire the first call. It returns `running: true` immediately and
    // spawns a background loop that blocks in sendHello.
    const first = runSetupSponsorFriendViaRuntime(makeDeps());
    // Wait until the background loop has entered sendHello (i.e. the
    // first call has cleared the single-flight guard and is mid-attempt).
    await sendHelloStarted;
    // NOW fire the second call. The single-flight guard must refuse to
    // spawn a duplicate loop and return `running: true` instead.
    const second = await runSetupSponsorFriendViaRuntime(makeDeps());

    // Await both calls' synchronous returns.
    const firstResult = await first;
    expect(firstResult.running).toBe(true);
    expect(second.running).toBe(true);

    // The second call must NOT have entered sendHello — only the first
    // loop's one attempt did.
    expect(sendHello).toHaveBeenCalledTimes(1);

    // Release the first loop's sendHello so the loop completes and the
    // .finally() releases the single-flight lock. Without this, the
    // lock would leak into the next test and break the bundled-config
    // tests that share an ownerId.
    (sendHelloGate as unknown as { _release?: () => void })._release?.();
    await new Promise((r) => setTimeout(r, 10));
  });
});
