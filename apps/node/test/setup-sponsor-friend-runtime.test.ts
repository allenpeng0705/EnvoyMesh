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

  it("skips when the local node is the sponsor owner (no retry loop)", async () => {
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => undefined,
      saveNodeConfig: vi.fn(async () => {}),
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello,
      loadHelloProfile: async () => ({
        displayName: "Allen",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      // Different peerId, same ownerId — owner self-check must win.
      loadNodeProfile: async () =>
        ({
          peerId: "12D3KooWDifferentDevicePeerIdxxxxxxxxxxxxxxxxxxxx",
          owner: { ownerId: "envoy:owner:diBymBI4fBdIe0V_bhwFXhEijf4FVd0uDvyIh_X1E9I" },
        }) as never,
      assertOnline: () => {},
    });
    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "sponsor-is-self-owner",
    });
    await flushSponsorLoop();
    expect(sendHello).not.toHaveBeenCalled();
  });

  it("skips and marks completed when the sponsor is already a bonded contact", async () => {
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const saveNodeConfig = vi.fn(async () => {});
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
        setupSponsorFriendOwnerId: "envoy:owner:already-friend",
        setupSponsorFriendPeerId: "12D3KooWAlreadyFriend",
        setupSponsorFriendMaxAttempts: 3,
        setupSponsorFriendRetryDelayMs: 0,
      }),
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
      isAlreadyBondedWith: async (ownerId) => ownerId === "envoy:owner:already-friend",
      assertOnline: () => {},
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "already-bonded",
      ownerId: "envoy:owner:already-friend",
    });
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCompletedAt: expect.any(String),
      }),
    );
    await flushSponsorLoop();
    expect(sendHello).not.toHaveBeenCalled();
  });

  it("marks completed and clears lastError when already bonded after a failed auto-run", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));

    const result = await runSetupSponsorFriendViaRuntime({
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
        setupSponsorFriendOwnerId: "envoy:owner:already-friend",
        setupSponsorFriendMaxAttempts: 3,
        setupSponsorFriendRetryDelayMs: 0,
        setupSponsorFriendLastError: "Failed to send hello: No reachable path",
        setupSponsorFriendLastErrorKind: "network-unreachable",
        setupSponsorFriendAttempts: 12,
      }),
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
      isAlreadyBondedWith: async (ownerId) => ownerId === "envoy:owner:already-friend",
      assertOnline: () => {},
    });

    expect(result).toEqual({
      ok: true,
      skipped: true,
      reason: "already-bonded",
      ownerId: "envoy:owner:already-friend",
    });
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCompletedAt: expect.any(String),
        setupSponsorFriendLastError: undefined,
        setupSponsorFriendLastErrorKind: undefined,
      }),
    );
    await flushSponsorLoop();
    expect(sendHello).not.toHaveBeenCalled();
  });

  it("heals stale lastError when already bonded even if completedAt was set", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const completedAt = "2026-08-01T00:00:00.000Z";

    const result = await runSetupSponsorFriendViaRuntime({
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
        setupSponsorFriendOwnerId: "envoy:owner:already-friend",
        setupSponsorFriendCompletedAt: completedAt,
        setupSponsorFriendLastError: "stale mesh error",
        setupSponsorFriendLastErrorKind: "network-unreachable",
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
      isAlreadyBondedWith: async (ownerId) => ownerId === "envoy:owner:already-friend",
      assertOnline: () => {},
    });

    expect(result.reason).toBe("already-bonded");
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCompletedAt: completedAt,
        setupSponsorFriendLastError: undefined,
        setupSponsorFriendLastErrorKind: undefined,
      }),
    );
  });

  it("single-flights concurrent setup calls for the same sponsor", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const sendHello = vi.fn(async () => {
      await gate;
      return { messageId: "msg-1" };
    });
    const deps = {
      loadNodeConfig: async () => undefined,
      saveNodeConfig: vi.fn(async () => {}),
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
    };
    const first = await runSetupSponsorFriendViaRuntime(deps);
    const second = await runSetupSponsorFriendViaRuntime(deps);
    expect(first).toMatchObject({ ok: true, running: true });
    expect(second).toMatchObject({ ok: true, running: true });
    release();
    await flushSponsorLoop();
    expect(sendHello).toHaveBeenCalledTimes(1);
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

  it("classifies libp2p mesh-not-ready errors as mesh-not-ready", () => {
    expect(classifySponsorError("Node is starting. Start the node first.")).toBe(
      "mesh-not-ready",
    );
    expect(classifySponsorError("[searchPeers] Node not initialized")).toBe(
      "mesh-not-ready",
    );
    expect(classifySponsorError("libp2p not yet started")).toBe(
      "mesh-not-ready",
    );
    expect(
      classifySponsorError("libp2p mesh not ready yet — deferring bond.request"),
    ).toBe("mesh-not-ready");
  });

  it("classifies the observed limited-connection + ensurePeerReachable family as network-unreachable", () => {
    // These were classified as "other" before 2026-07-12 because the
    // patterns weren't in the regex. They cause the loop to burn all
    // 12 attempts with no actionable hint — fix is to route them to
    // network-unreachable so the UI surfaces a network hint.
    expect(
      classifySponsorError(
        "ensurePeerReachable failed for /ip4/47.93.11.212/tcp/40…: The operation was aborted due to timeout",
      ),
    ).toBe("network-unreachable");
    expect(
      classifySponsorError(
        "outbound /envoymesh/message/0.1.0 dial failed for /p2p-circuit/…: Cannot open protocol stream on limited connection",
      ),
    ).toBe("network-unreachable");
    expect(
      classifySponsorError("sendExpectReply: peer closed stream without a reply"),
    ).toBe("network-unreachable");
    expect(
      classifySponsorError("stream open failed on existing connection (Unexpected EOF)"),
    ).toBe("network-unreachable");
  });

  it("classifies protocol-routing errors as protocol-mismatch", () => {
    // Surfaced from the 2026-07-12 Emily log: bond.request landed on
    // the chat protocol because the deliver-call fast path doesn't
    // gate on intent. This is a code bug, not operator-network.
    expect(
      classifySponsorError("invalid intent bond.request on chat protocol"),
    ).toBe("protocol-mismatch");
    expect(
      classifySponsorError("unsupported intent: foo on /envoymesh/chat/0.1.0"),
    ).toBe("protocol-mismatch");
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
        // "node is starting" matches the mesh-not-ready pattern
        // (added 2026-07-12 to surface the libp2p-not-up case
        // distinctly from a real network failure). The runtime's
        // bail-on-mesh-not-ready branch then persists this kind
        // and short-circuits the rest of the retry budget.
        setupSponsorFriendLastErrorKind: "mesh-not-ready",
        setupSponsorFriendSkipReason: "mesh-not-ready",
        setupSponsorFriendCooldownUntil: expect.any(String),
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

  it("skips spawn when probeMeshReady() returns false (mesh not up yet)", async () => {
    // Phase 4 of the sponsor-loop fix: gate the spawn on mesh readiness
    // so the loop doesn't fire on the same tick as nodeStatus="running"
    // and burn all 12 attempts against a mesh that can't route yet.
    // The skip must be classified as mesh-not-ready so the UI can
    // show "Mesh is starting" instead of a generic "Retrying".
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));

    const result = await runSetupSponsorFriendViaRuntime(
      {
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
        sendHello,
        loadHelloProfile: async () => ({
          displayName: "New User",
          bio: "",
          interests: [],
          whatShares: [],
        }),
        loadNodeProfile: async () => undefined,
        assertOnline: () => {},
        // Mesh is not ready — the spawn must be skipped, not entered.
        probeMeshReady: async () => false,
      },
      { forceBypassGuards: false },
    );

    // Spawn was skipped (not running) because the mesh wasn't up.
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("mesh-not-ready");
    expect(result.lastErrorKind).toBe("mesh-not-ready");
    // The loop never ran, so sendHello was never called.
    expect(sendHello).not.toHaveBeenCalled();
    // The skip does NOT persist on its own — matching the
    // profile-not-ready skip behavior. The tile reads the live
    // `getSetupSponsorFriendStatus` for the hint, not a stale
    // persisted snapshot, so the in-memory return is the source
    // of truth for the "Mesh is starting" UX.
    expect(saveNodeConfig).not.toHaveBeenCalled();
  });

  it("runs the loop when probeMeshReady() returns true", async () => {
    // Companion to the above: when the mesh is up, the loop fires
    // normally and sendHello is called.
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));

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
      sendHello,
      loadHelloProfile: async () => ({
        displayName: "New User",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
      probeMeshReady: async () => true,
    });

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(sendHello).toHaveBeenCalledTimes(1);
  });
});

describe("runSetupSponsorFriendViaRuntime — cooldown + profile-not-ready guards", () => {
  // Phase 1 + 2: the user-visible "Retrying" loop had two root causes:
  //   1. After 12 attempts fail, the runtime kept accepting new auto-
  //      triggers with no backoff. The next call to runSetupSponsorFriend
  //      started a fresh 12-attempt cycle immediately, dialing the same
  //      unreachable target. The UI never got a "failed" state.
  //   2. The loop ran with no human profile loaded, so each attempt hit
  //      "Human profile not initialized" 12 times before giving up.
  //
  // The fix: persist a `cooldownUntil` after exhaustion (and after
  // profile-not-ready) and have runSetupSponsorFriend refuse to spawn a
  // new loop while the cooldown is active. The tile shows a countdown
  // instead of "Retrying" until the user clicks Retry (forceBypassGuards).

  const persistedBase = {
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
    setupSponsorFriendOwnerId: "envoy:owner:cooldown-test",
    setupSponsorFriendPeerId: "12D3KooWCooldown",
    setupSponsorFriendMaxAttempts: 1,
    setupSponsorFriendRetryDelayMs: 0,
  };

  it("returns skipped=cooldown when persisted cooldownUntil is in the future", async () => {
    // Regression: a previously-failed cycle set cooldownUntil = +60s.
    // The next auto-trigger (e.g. SetupView on mount, or NodeStateContext
    // on reconnect) must NOT spawn a fresh 12-attempt loop. Instead it
    // returns skipped=cooldown so the tile shows a countdown.
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => ({
        ...persistedBase,
        setupSponsorFriendCooldownUntil: futureIso,
        setupSponsorFriendLastError: "Failed to send hello: No reachable path",
        setupSponsorFriendLastErrorKind: "network-unreachable",
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

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("cooldown");
    expect(result.cooldownUntil).toBe(futureIso);
    expect(result.lastErrorKind).toBe("network-unreachable");
    expect(sendHello).not.toHaveBeenCalled();
  });

  it("forceBypassGuards=true bypasses the cooldown and spawns a fresh loop", async () => {
    // The Retry button uses this path — the user explicitly asked for a
    // fresh attempt, so we don't gate them on the cooldown.
    const futureIso = new Date(Date.now() + 60_000).toISOString();
    const sendHello = vi.fn(async () => ({ messageId: "msg-retry" }));

    const result = await runSetupSponsorFriendViaRuntime(
      {
        loadNodeConfig: async () => ({
          ...persistedBase,
          setupSponsorFriendCooldownUntil: futureIso,
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
      },
      { forceBypassGuards: true },
    );

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(sendHello).toHaveBeenCalled();
  });

  it("returns skipped=profile-not-ready when probeHumanProfileReady reports not ready", async () => {
    // The runtime's profile-readiness guard prevents a fresh loop from
    // burning 12 attempts when the local human profile isn't saved yet.
    // The tile gates its auto-trigger on profile readiness separately;
    // this is the runtime-side belt-and-suspenders.
    const probeHumanProfileReady = vi.fn(async () => false);
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => persistedBase,
      saveNodeConfig: vi.fn(async () => {}),
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: vi.fn(async () => ({})),
      searchPeers: vi.fn(async () => []),
      sendHello,
      loadHelloProfile: async () => {
        throw new Error("Human profile not initialized");
      },
      probeHumanProfileReady,
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("profile-not-ready");
    expect(result.lastErrorKind).toBe("profile-not-ready");
    expect(sendHello).not.toHaveBeenCalled();
  });

  it("persists permanent auto-stop after exhausting maxAttempts", async () => {
    // After one auto cycle fails, auto-retry must stop for good (manual
    // Retry uses forceBypassGuards). A short 60s cooldown used to let
    // Discover/NodeStateContext re-spawn the dial loop every minute.
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => {
      throw new Error("Failed to send hello: No reachable path to 12D3KooWTest…");
    });

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => persistedBase,
      saveNodeConfig,
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

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCooldownUntil: "9999-12-31T00:00:00.000Z",
        setupSponsorFriendSkipReason: "auto-exhausted",
      }),
    );
    const lastCall = saveNodeConfig.mock.calls.at(-1)?.[0] as {
      setupSponsorFriendCooldownUntil?: string;
      setupSponsorFriendSkipReason?: string;
    };
    expect(lastCall.setupSponsorFriendSkipReason).toBe("auto-exhausted");
    expect(lastCall.setupSponsorFriendCooldownUntil).toBe("9999-12-31T00:00:00.000Z");
  });

  it("bails out early on profile-not-ready (no 12 wasted attempts)", async () => {
    // Regression for the 2026-07-11 "Retrying" loop: the original loop
    // burned all 12 attempts on "Human profile not initialized" before
    // giving up. The fix: classify the error as profile-not-ready and
    // return early after the first attempt, with a cooldown.
    const saveNodeConfig = vi.fn(async () => {});
    const loadHelloProfile = vi.fn(async () => {
      throw new Error("Human profile not initialized");
    });

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => ({
        ...persistedBase,
        // Allow the runtime to "retry" 3 times so we can verify it
        // bails out before exhausting the budget. With the bug, the
        // runtime would persist lastError 3 times; with the fix, the
        // runtime bails on attempt 1.
        setupSponsorFriendMaxAttempts: 3,
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
    // loadHelloProfile was called once. If the runtime bailed, sendHello
    // was never called (the loadHelloProfile throw was caught before
    // sendHello). With the bug, the loop would have called sendHello
    // after each loadHelloProfile retry — 3 times.
    expect(loadHelloProfile).toHaveBeenCalledTimes(1);
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastErrorKind: "profile-not-ready",
        setupSponsorFriendSkipReason: "profile-not-ready",
        setupSponsorFriendCooldownUntil: expect.any(String),
      }),
    );
  });
});

describe("classifySponsorError — profile-not-ready", () => {
  it("classifies 'Human profile not initialized' as profile-not-ready", () => {
    // Important: the network patterns include "not initialized" via the
    // substring match — but the dedicated profile-not-ready check runs
    // FIRST so the user gets the right hint. Without the explicit check
    // this would land in "network-unreachable" and the tile would show
    // a "check Settings → Network" hint instead of "Profile required".
    expect(classifySponsorError("Human profile not initialized")).toBe(
      "profile-not-ready",
    );
  });
});

describe("runSetupSponsorFriendViaRuntime — skip observability audit events", () => {
  // Skips are NOT persisted to node-config.json (the in-memory return
  // is the source of truth for the tile). The audit log is the only
  // signal that lets the UI distinguish "we're waiting for X" from
  // "we never started". These tests pin the audit-event contract so
  // future refactors don't silently drop the signal.
  const baseConfig = {
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
    setupSponsorFriendOwnerId: "envoy:owner:audit-test",
    setupSponsorFriendPeerId: "12D3KooWAuditTest",
    setupSponsorFriendMaxAttempts: 1,
    setupSponsorFriendRetryDelayMs: 0,
  };

  function makeDeps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      loadNodeConfig: async () => baseConfig,
      saveNodeConfig: async () => {},
      getProfileDir: () => "/tmp/profile",
      nodeBundleDir: "/tmp/bundle",
      applyWanJoinInvite: async () => ({}),
      searchPeers: async () => [],
      sendHello: async () => ({ messageId: "msg-1" }),
      loadHelloProfile: async () => ({
        displayName: "New User",
        bio: "",
        interests: [],
        whatShares: [],
      }),
      loadNodeProfile: async () => undefined,
      assertOnline: () => {},
      ...overrides,
    };
  }

  it("emits a setup.sponsor_friend.skipped audit event when the mesh is not ready", async () => {
    const appendAudit = vi.fn(async () => {});

    const result = await runSetupSponsorFriendViaRuntime(
      makeDeps({
        appendAudit,
        probeMeshReady: async () => false,
      }) as Parameters<typeof runSetupSponsorFriendViaRuntime>[0],
    );

    expect(result.reason).toBe("mesh-not-ready");
    // The audit write is fire-and-forget — let the microtask drain.
    await flushSponsorLoop();
    expect(appendAudit).toHaveBeenCalledTimes(1);
    const event = appendAudit.mock.calls[0]?.[0] as {
      type: string;
      outcome: string;
      correlationId?: string;
      summary: string;
    };
    expect(event.type).toBe("setup.sponsor_friend.skipped");
    expect(event.outcome).toBe("record");
    expect(event.correlationId).toBe("envoy:owner:audit-test");
    expect(event.summary).toContain("mesh-not-ready");
  });

  it("emits a setup.sponsor_friend.skipped audit event when the profile is not ready", async () => {
    const appendAudit = vi.fn(async () => {});

    const result = await runSetupSponsorFriendViaRuntime(
      makeDeps({
        appendAudit,
        probeHumanProfileReady: async () => false,
      }) as Parameters<typeof runSetupSponsorFriendViaRuntime>[0],
    );

    expect(result.reason).toBe("profile-not-ready");
    await flushSponsorLoop();
    expect(appendAudit).toHaveBeenCalledTimes(1);
    const event = appendAudit.mock.calls[0]?.[0] as { summary: string };
    expect(event.summary).toContain("profile-not-ready");
  });

  it("emits a setup.sponsor_friend.skipped audit event with cooldown expiry when the cooldown is active", async () => {
    const appendAudit = vi.fn(async () => {});
    const cooldownUntil = new Date(Date.now() + 30_000).toISOString();
    const config = {
      ...baseConfig,
      setupSponsorFriendCooldownUntil: cooldownUntil,
    };

    const result = await runSetupSponsorFriendViaRuntime(
      makeDeps({
        appendAudit,
        loadNodeConfig: async () => config,
      }) as Parameters<typeof runSetupSponsorFriendViaRuntime>[0],
    );

    expect(result.reason).toBe("cooldown");
    expect(result.cooldownUntil).toBe(cooldownUntil);
    await flushSponsorLoop();
    expect(appendAudit).toHaveBeenCalledTimes(1);
    const event = appendAudit.mock.calls[0]?.[0] as { summary: string };
    expect(event.summary).toContain("cooldown");
    // The cooldown expiry is encoded in the summary so the UI audit
    // view can render a "retry at HH:MM" hint without re-querying the
    // persisted config.
    expect(event.summary).toContain(cooldownUntil);
  });

  it("does NOT emit an audit event for already-completed (deliberate no-op)", async () => {
    const appendAudit = vi.fn(async () => {});

    const result = await runSetupSponsorFriendViaRuntime(
      makeDeps({
        appendAudit,
        loadNodeConfig: async () => ({
          ...baseConfig,
          setupSponsorFriendCompletedAt: new Date().toISOString(),
        }),
      }) as Parameters<typeof runSetupSponsorFriendViaRuntime>[0],
    );

    expect(result.reason).toBe("already-completed");
    await flushSponsorLoop();
    // already-completed is the user-bonded state — the audit log
    // already has a bond.pre_staged / bond.established event for that.
    // Emitting another "skipped" event here would be noise.
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it("does NOT crash when appendAudit is omitted (back-compat with tests that don't wire it)", async () => {
    // The dep is optional. A test that only cares about the in-memory
    // return shape shouldn't have to mock appendAudit.
    const result = await runSetupSponsorFriendViaRuntime(
      makeDeps({ probeMeshReady: async () => false }) as Parameters<
        typeof runSetupSponsorFriendViaRuntime
      >[0],
    );
    expect(result.reason).toBe("mesh-not-ready");
  });
});

describe("runSetupSponsorFriendViaRuntime — bond ack + multiaddr refresh", () => {
  const enabledBase = {
    setupSponsorFriendEnabled: true,
    setupSponsorFriendOwnerId: "envoy:owner:test",
    setupSponsorFriendPeerId: "12D3KooWTest",
    setupSponsorFriendMaxAttempts: 1,
    setupSponsorFriendRetryDelayMs: 0,
    bootstrapPeers: [] as string[],
    bootstrapPresets: [] as string[],
    configuredRelays: [] as unknown[],
    modelProviders: { mode: "disabled" as const },
    chatAssistEnabled: false,
    contactAiPreferences: [] as unknown[],
    updatedAt: new Date().toISOString(),
  };

  it("persists sponsor-no-ack when waitForBondEstablished rejects after sendHello", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const waitForBondEstablished = vi.fn(async () => {
      throw new Error("bond:established for envoy:owner:test timed out after 30000ms");
    });

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => enabledBase as never,
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
      probeMeshReady: async () => true,
      waitForBondEstablished,
    });

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(waitForBondEstablished).toHaveBeenCalled();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendLastErrorKind: "sponsor-no-ack",
      }),
    );
    expect(saveNodeConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCompletedAt: expect.any(String),
      }),
    );
  });

  it("marks completed when waitForBondEstablished resolves", async () => {
    const saveNodeConfig = vi.fn(async () => {});
    const sendHello = vi.fn(async () => ({ messageId: "msg-1" }));
    const waitForBondEstablished = vi.fn(async () => ({
      peerOwnerId: "envoy:owner:test",
      displayName: "Sponsor",
    }));

    const result = await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () => enabledBase as never,
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
      probeMeshReady: async () => true,
      waitForBondEstablished,
    });

    expect(result.running).toBe(true);
    await flushSponsorLoop();
    expect(saveNodeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        setupSponsorFriendCompletedAt: expect.any(String),
      }),
    );
  });

  it("refreshes peer multiaddrs each attempt via getPeerMultiaddrs", async () => {
    const getPeerMultiaddrs = vi
      .fn()
      .mockResolvedValueOnce([
        "/ip4/192.168.1.10/tcp/4001/p2p/12D3KooWTest",
      ])
      .mockResolvedValueOnce([
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWTest",
      ]);
    const sendHello = vi.fn(async () => {
      throw new Error("Failed to send hello: No reachable path");
    });
    const saveNodeConfig = vi.fn(async () => {});

    await runSetupSponsorFriendViaRuntime({
      loadNodeConfig: async () =>
        ({
          ...enabledBase,
          setupSponsorFriendMaxAttempts: 2,
        }) as never,
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
      probeMeshReady: async () => true,
      getPeerMultiaddrs,
    });

    await flushSponsorLoop();
    expect(getPeerMultiaddrs.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
