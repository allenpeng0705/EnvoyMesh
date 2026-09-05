/**
 * Phase 66A — bond:established schedules one debounced AN worker refresh.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createDebouncedAgentNetworkRefresh } from "../src/agent-network-bond-refresh.js";

/**
 * Mirrors NodeServiceImpl constructor wiring: listen for bond:established and
 * schedule refresh (without constructing the full NodeServiceImpl).
 */
function wireBondRefresh(opts: {
  on: (event: string, handler: (data: { peerOwnerId: string }) => void) => void;
  refresh: () => Promise<unknown>;
  track: (work: Promise<unknown>) => void;
}) {
  const debounced = createDebouncedAgentNetworkRefresh({
    refresh: opts.refresh,
    debounceMs: 50,
    track: opts.track,
  });
  opts.on("bond:established", (data) => {
    debounced.schedule(`bond:${data.peerOwnerId}`);
  });
  return debounced;
}

describe("bond:established → refreshAgentNetworkWorkers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires one refresh after sponsor + generic bond bursts", async () => {
    const refresh = vi.fn(async () => ({ requested: 1, failed: 0 }));
    const track = vi.fn();
    const listeners = new Map<string, Array<(data: { peerOwnerId: string }) => void>>();
    const on = (event: string, handler: (data: { peerOwnerId: string }) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
    };
    const emit = (event: string, data: { peerOwnerId: string }) => {
      for (const h of listeners.get(event) ?? []) h(data);
    };

    const debounced = wireBondRefresh({ on, refresh, track });
    emit("bond:established", { peerOwnerId: "envoy:owner:sponsor" });
    emit("bond:established", { peerOwnerId: "envoy:owner:lan" });
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    debounced.cancel();
  });
});
