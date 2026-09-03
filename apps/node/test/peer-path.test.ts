import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configurePeerPathSoftConnectionCap,
  ensureContactPath,
  getPeerPathDialStatsForTests,
  getPeerPathSoftConnectionCap,
  PEER_PATH_MAX_IN_FLIGHT_DIALS,
  PEER_PATH_SOFT_CONNECTION_CAP_DEFAULT,
  releasePeerPathDialSlot,
  resetPeerPathDialSlotsForTests,
  softConnectionCapForMaxConnections,
  tryAcquirePeerPathDialSlot,
} from "../src/peer-path.js";
import * as outbound from "../src/node-service-outbound-messaging.js";

afterEach(() => {
  resetPeerPathDialSlotsForTests();
  vi.restoreAllMocks();
});

describe("PeerPath soft connection cap", () => {
  it("derives soft cap as maxConnections - 4", () => {
    expect(softConnectionCapForMaxConnections(48)).toBe(44);
    expect(softConnectionCapForMaxConnections(40)).toBe(36);
    expect(softConnectionCapForMaxConnections(24)).toBe(20);
    expect(PEER_PATH_SOFT_CONNECTION_CAP_DEFAULT).toBe(44);
  });

  it("configurePeerPathSoftConnectionCap updates the live gate", () => {
    configurePeerPathSoftConnectionCap(48);
    expect(getPeerPathSoftConnectionCap()).toBe(44);
    configurePeerPathSoftConnectionCap(24);
    expect(getPeerPathSoftConnectionCap()).toBe(20);
  });
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
    configurePeerPathSoftConnectionCap(48);
    const warmSpy = vi
      .spyOn(outbound, "warmContactConnectionViaRuntime")
      .mockResolvedValue({ connected: true, direct: false });
    const infoSpy = vi
      .spyOn(outbound, "getPeerConnectionInfoViaRuntime")
      .mockResolvedValue({ connected: false, direct: false });

    const ctx = {
      getReachableMesh: () =>
        ({
          getConnectionStats: () => ({ totalConnections: 44, dialQueueLength: 0 }),
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
    configurePeerPathSoftConnectionCap(48);
    const warmSpy = vi
      .spyOn(outbound, "warmContactConnectionViaRuntime")
      .mockResolvedValue({ connected: true, direct: true });
    const infoSpy = vi.spyOn(outbound, "getPeerConnectionInfoViaRuntime");

    const ctx = {
      getReachableMesh: () =>
        ({
          getConnectionStats: () => ({ totalConnections: 44, dialQueueLength: 0 }),
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
