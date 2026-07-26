/**
 * Bond-warm path flushes the feed.notify outbox.
 */
import { describe, expect, it, vi } from "vitest";
import { warmAllBondedContactsViaRuntime, type ReachabilityContext } from "../src/node-service-reachability.js";

describe("warmAllBondedContactsViaRuntime feed.notify outbox", () => {
  it("flushes outbox even when there is no internal mesh", async () => {
    const flushFeedNotifyOutbox = vi.fn(async () => undefined);
    const ctx = {
      getNodeStatus: () => "running",
      getInternalMesh: () => undefined,
      flushFeedNotifyOutbox,
    } as unknown as ReachabilityContext;

    await warmAllBondedContactsViaRuntime(ctx);
    expect(flushFeedNotifyOutbox).toHaveBeenCalledTimes(1);
  });

  it("still flushes when status is running before warming bonds", async () => {
    const flushFeedNotifyOutbox = vi.fn(async () => undefined);
    const mesh = {
      getConnectionStats: () => ({ totalConnections: 0 }),
    };
    const ctx = {
      getNodeStatus: () => "running",
      getInternalMesh: () => mesh,
      flushFeedNotifyOutbox,
      getBonds: async () => [],
      getProfile: () => undefined,
      getLastBondWarmAt: () => new Map(),
    } as unknown as ReachabilityContext;

    await warmAllBondedContactsViaRuntime(ctx);
    expect(flushFeedNotifyOutbox).toHaveBeenCalledTimes(1);
  });
});
