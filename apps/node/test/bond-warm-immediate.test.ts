/**
 * Bond warm startup pulses + failure cooldown (avoid ~5 min Offline).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOND_WARM_FAILURE_COOLDOWN_MS,
  BOND_WARM_INITIAL_DELAY_MS,
  BOND_WARM_PER_CONTACT_COOLDOWN_MS,
  BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS,
  BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS,
  BOND_WARM_STARTUP_RETRY_DELAYS_MS,
  resetBondWarmConnectivityConfigForTests,
  startBondWarmIntervalViaRuntime,
  warmAllBondedContactsViaRuntime,
  type ReachabilityContext,
} from "../src/node-service-reachability.js";

describe("startBondWarmIntervalViaRuntime settle delay", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBondWarmConnectivityConfigForTests();
  });

  it("uses a short first settle delay (not the old 45s, not T=0)", () => {
    expect(BOND_WARM_INITIAL_DELAY_MS).toBe(BOND_WARM_STARTUP_RETRY_DELAYS_MS[0]);
    expect(BOND_WARM_INITIAL_DELAY_MS).toBeGreaterThan(0);
    expect(BOND_WARM_INITIAL_DELAY_MS).toBeLessThan(45_000);
  });

  it("schedules several startup warm pulses before the 5-minute interval", async () => {
    vi.useFakeTimers();
    const flushFeedNotifyOutbox = vi.fn(async () => undefined);
    const flushFeedEngageOutbox = vi.fn(async () => undefined);
    let bondWarmTimer: ReturnType<typeof setInterval> | undefined;
    const ctx = {
      getNodeStatus: () => "running",
      getInternalMesh: () => undefined,
      flushFeedNotifyOutbox,
      flushFeedEngageOutbox,
      getBondWarmTimer: () => bondWarmTimer,
      setBondWarmTimer: (timer: ReturnType<typeof setInterval> | undefined) => {
        bondWarmTimer = timer;
      },
    } as unknown as ReachabilityContext;

    startBondWarmIntervalViaRuntime(ctx);
    expect(flushFeedNotifyOutbox).not.toHaveBeenCalled();

    for (let i = 0; i < BOND_WARM_STARTUP_RETRY_DELAYS_MS.length; i++) {
      const delay = BOND_WARM_STARTUP_RETRY_DELAYS_MS[i]!;
      const prev = i === 0 ? 0 : BOND_WARM_STARTUP_RETRY_DELAYS_MS[i - 1]!;
      await vi.advanceTimersByTimeAsync(delay - prev);
      await Promise.resolve();
      expect(flushFeedNotifyOutbox).toHaveBeenCalledTimes(i + 1);
    }

    expect(bondWarmTimer).toBeDefined();
    if (bondWarmTimer) {
      clearInterval(bondWarmTimer);
    }
  });

  it("clears a previous interval before starting a new one", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    let bondWarmTimer: ReturnType<typeof setInterval> | undefined = setInterval(() => {}, 60_000);
    const previous = bondWarmTimer;
    const ctx = {
      getNodeStatus: () => "stopped",
      getInternalMesh: () => undefined,
      flushFeedNotifyOutbox: async () => undefined,
      flushFeedEngageOutbox: async () => undefined,
      getBondWarmTimer: () => bondWarmTimer,
      setBondWarmTimer: (timer: ReturnType<typeof setInterval> | undefined) => {
        bondWarmTimer = timer;
      },
    } as unknown as ReachabilityContext;

    startBondWarmIntervalViaRuntime(ctx);

    expect(clearSpy).toHaveBeenCalledWith(previous);
    if (bondWarmTimer) {
      clearInterval(bondWarmTimer);
    }
    clearSpy.mockRestore();
  });
});

describe("warmAllBondedContactsViaRuntime failure cooldown", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetBondWarmConnectivityConfigForTests();
  });

  it("retries after failure cooldown (~20s), not the full 5-minute success cooldown", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));

    const lastBondWarmAt = new Map<string, number>();
    const warmContactConnection = vi
      .fn()
      .mockResolvedValueOnce({ connected: false, direct: false })
      .mockResolvedValueOnce({ connected: true, direct: false });
    const mesh = {
      getConnectionStats: () => ({ totalConnections: 0, dialQueueLength: 0 }),
    };
    const ctx = {
      getNodeStatus: () => "running",
      getInternalMesh: () => mesh,
      flushFeedNotifyOutbox: async () => undefined,
      flushFeedEngageOutbox: async () => undefined,
      getBonds: async () => [{ peerOwnerId: "envoy:owner:mac", level: "direct" }],
      getProfile: () => ({ owner: { ownerId: "envoy:owner:win" } }),
      getLastBondWarmAt: () => lastBondWarmAt,
      getPeerConnectionInfo: async () => ({ connected: false, direct: false }),
      warmContactConnection,
      resolvePeerTransportForOwner: async () => ({ transportPeerId: "12D3KooWMac" }),
    } as unknown as ReachabilityContext;

    await warmAllBondedContactsViaRuntime(ctx);
    expect(warmContactConnection).toHaveBeenCalledTimes(1);

    // Still inside failure cooldown — skip.
    await vi.advanceTimersByTimeAsync(BOND_WARM_FAILURE_COOLDOWN_MS - 1);
    await warmAllBondedContactsViaRuntime(ctx);
    expect(warmContactConnection).toHaveBeenCalledTimes(1);

    // Past failure cooldown, far below the 5-minute success cooldown.
    await vi.advanceTimersByTimeAsync(2);
    expect(BOND_WARM_FAILURE_COOLDOWN_MS).toBeLessThan(BOND_WARM_PER_CONTACT_COOLDOWN_MS / 2);
    await warmAllBondedContactsViaRuntime(ctx);
    expect(warmContactConnection).toHaveBeenCalledTimes(2);
  });

  it("retries Relay→Direct within seconds instead of waiting 5 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T12:00:00.000Z"));

    const lastBondWarmAt = new Map<string, number>();
    const warmContactConnection = vi.fn(async (_ownerId: string, opts?: { upgradeRelayToDirect?: boolean }) => {
      if (opts?.upgradeRelayToDirect) {
        // First upgrade pulses stay on relay; a later pulse lands Direct.
        if (warmContactConnection.mock.calls.length >= 3) {
          return { connected: true, direct: true };
        }
        return { connected: true, direct: false };
      }
      return { connected: true, direct: false };
    });
    let connectionInfo = { connected: true, direct: false };
    const mesh = {
      getConnectionStats: () => ({ totalConnections: 0, dialQueueLength: 0 }),
    };
    const ctx = {
      getNodeStatus: () => "running",
      getInternalMesh: () => mesh,
      flushFeedNotifyOutbox: async () => undefined,
      flushFeedEngageOutbox: async () => undefined,
      getBonds: async () => [{ peerOwnerId: "envoy:owner:win", level: "direct" }],
      getProfile: () => ({ owner: { ownerId: "envoy:owner:mac" } }),
      getLastBondWarmAt: () => lastBondWarmAt,
      getPeerConnectionInfo: async () => connectionInfo,
      warmContactConnection,
      resolvePeerTransportForOwner: async () => ({ transportPeerId: "12D3KooWWin" }),
    } as unknown as ReachabilityContext;

    await warmAllBondedContactsViaRuntime(ctx);
    expect(warmContactConnection).toHaveBeenCalledWith("envoy:owner:win", {
      upgradeRelayToDirect: true,
    });
    expect(BOND_WARM_RELAY_UPGRADE_COOLDOWN_MS).toBeLessThan(BOND_WARM_PER_CONTACT_COOLDOWN_MS / 10);

    // Still inside the old 5-minute success window — but scheduled upgrade pulses fire.
    const beforePulses = warmContactConnection.mock.calls.length;
    await vi.advanceTimersByTimeAsync(BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS[0]!);
    await Promise.resolve();
    expect(warmContactConnection.mock.calls.length).toBeGreaterThan(beforePulses);

    await vi.advanceTimersByTimeAsync(
      BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS[2]! - BOND_WARM_RELAY_UPGRADE_RETRY_DELAYS_MS[0]!,
    );
    await Promise.resolve();
    expect(warmContactConnection.mock.calls.some((c) => c[1]?.upgradeRelayToDirect === true)).toBe(
      true,
    );

    // Once Direct, scheduled pulses stop asking for upgradeRelayToDirect.
    connectionInfo = { connected: true, direct: true };
    const upgradeCallsBeforeDirectSettle = warmContactConnection.mock.calls.filter(
      (c) => c[1]?.upgradeRelayToDirect === true,
    ).length;
    await vi.advanceTimersByTimeAsync(60_000);
    await Promise.resolve();
    const upgradeCallsAfter = warmContactConnection.mock.calls.filter(
      (c) => c[1]?.upgradeRelayToDirect === true,
    ).length;
    expect(upgradeCallsAfter).toBe(upgradeCallsBeforeDirectSettle);
  });
});
