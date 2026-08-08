import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureContactPath,
  getPeerPathDialStatsForTests,
  PEER_PATH_MAX_IN_FLIGHT_DIALS,
  releasePeerPathDialSlot,
  resetPeerPathDialSlotsForTests,
  tryAcquirePeerPathDialSlot,
} from "../src/peer-path.js";
import * as outbound from "../src/node-service-outbound-messaging.js";

afterEach(() => {
  resetPeerPathDialSlotsForTests();
  vi.restoreAllMocks();
});

describe("PeerPath dial slots", () => {
  it("caps concurrent background dials", async () => {
    const acquired: boolean[] = [];
    for (let i = 0; i < PEER_PATH_MAX_IN_FLIGHT_DIALS; i++) {
      acquired.push(await tryAcquirePeerPathDialSlot({ intent: "warm" }));
    }
    expect(acquired.every(Boolean)).toBe(true);
    expect(await tryAcquirePeerPathDialSlot({ intent: "warm" })).toBe(false);
    expect(getPeerPathDialStatsForTests().inFlightDials).toBe(PEER_PATH_MAX_IN_FLIGHT_DIALS);
    releasePeerPathDialSlot("warm");
    expect(await tryAcquirePeerPathDialSlot({ intent: "warm" })).toBe(true);
  });

  it("verify intent does not consume a dial slot", async () => {
    for (let i = 0; i < PEER_PATH_MAX_IN_FLIGHT_DIALS; i++) {
      await tryAcquirePeerPathDialSlot({ intent: "warm" });
    }
    expect(await tryAcquirePeerPathDialSlot({ intent: "verify" })).toBe(true);
    expect(getPeerPathDialStatsForTests().inFlightDials).toBe(PEER_PATH_MAX_IN_FLIGHT_DIALS);
  });

  it("user upgrade waits briefly then acquires when a slot frees", async () => {
    for (let i = 0; i < PEER_PATH_MAX_IN_FLIGHT_DIALS; i++) {
      await tryAcquirePeerPathDialSlot({ intent: "warm" });
    }
    const pending = tryAcquirePeerPathDialSlot({ intent: "upgrade", waitMs: 2_000 });
    setTimeout(() => releasePeerPathDialSlot("warm"), 20);
    expect(await pending).toBe(true);
  });
});

describe("ensureContactPath", () => {
  it("skips background warm when soft connection cap reached", async () => {
    const warmSpy = vi
      .spyOn(outbound, "warmContactConnectionViaRuntime")
      .mockResolvedValue({ connected: true, direct: false });
    const infoSpy = vi
      .spyOn(outbound, "getPeerConnectionInfoViaRuntime")
      .mockResolvedValue({ connected: false, direct: false });

    const ctx = {
      getReachableMesh: () =>
        ({
          getConnectionStats: () => ({ totalConnections: 64, dialQueueLength: 0 }),
        }) as never,
    } as outbound.OutboundMessagingContext;

    const info = await ensureContactPath(ctx, "envoy:owner:x", { intent: "warm" });
    expect(info).toEqual({ connected: false, direct: false });
    expect(warmSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });

  it("force intent bypasses soft connection cap", async () => {
    const warmSpy = vi
      .spyOn(outbound, "warmContactConnectionViaRuntime")
      .mockResolvedValue({ connected: true, direct: true });

    const ctx = {
      getReachableMesh: () =>
        ({
          getConnectionStats: () => ({ totalConnections: 90, dialQueueLength: 0 }),
        }) as never,
    } as outbound.OutboundMessagingContext;

    const info = await ensureContactPath(ctx, "envoy:owner:x", { intent: "force", force: true });
    expect(info).toEqual({ connected: true, direct: true });
    expect(warmSpy).toHaveBeenCalledOnce();
  });

  it("upgradeRelayToDirect bypasses soft connection cap (Online-Relay→Direct)", async () => {
    const warmSpy = vi
      .spyOn(outbound, "warmContactConnectionViaRuntime")
      .mockResolvedValue({ connected: true, direct: true });
    const infoSpy = vi.spyOn(outbound, "getPeerConnectionInfoViaRuntime");

    const ctx = {
      getReachableMesh: () =>
        ({
          getConnectionStats: () => ({ totalConnections: 64, dialQueueLength: 0 }),
        }) as never,
    } as outbound.OutboundMessagingContext;

    const info = await ensureContactPath(ctx, "envoy:owner:x", {
      upgradeRelayToDirect: true,
    });
    expect(info).toEqual({ connected: true, direct: true });
    expect(warmSpy).toHaveBeenCalledOnce();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
