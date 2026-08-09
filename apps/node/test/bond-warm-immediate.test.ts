/**
 * Bond warm starts immediately when the node comes online (no 45s delay).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOND_WARM_INITIAL_DELAY_MS,
  startBondWarmIntervalViaRuntime,
  type ReachabilityContext,
} from "../src/node-service-reachability.js";

describe("startBondWarmIntervalViaRuntime immediate warm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exports zero initial delay so reconnect does not wait ~45s", () => {
    expect(BOND_WARM_INITIAL_DELAY_MS).toBe(0);
  });

  it("runs the first warm cycle immediately and schedules the interval", async () => {
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

    // Immediate path: flush runs without advancing timers.
    await Promise.resolve();
    expect(flushFeedNotifyOutbox).toHaveBeenCalledTimes(1);
    expect(flushFeedEngageOutbox).toHaveBeenCalledTimes(1);
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
