/**
 * Phase 66A — debounced AN refresh after bond:established.
 */

import { describe, expect, it, vi } from "vitest";
import { createDebouncedAgentNetworkRefresh } from "../src/agent-network-bond-refresh.js";

describe("createDebouncedAgentNetworkRefresh", () => {
  it("coalesces multiple schedule calls into one refresh", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const track = vi.fn();
    const debounced = createDebouncedAgentNetworkRefresh({
      refresh,
      debounceMs: 100,
      track,
    });
    debounced.schedule("a");
    debounced.schedule("b");
    debounced.schedule("c");
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    debounced.cancel();
    vi.useRealTimers();
  });

  it("cancel prevents a pending refresh", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const debounced = createDebouncedAgentNetworkRefresh({
      refresh,
      debounceMs: 200,
    });
    debounced.schedule("bond");
    debounced.cancel();
    await vi.advanceTimersByTimeAsync(250);
    expect(refresh).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
