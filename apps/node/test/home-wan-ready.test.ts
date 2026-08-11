import { describe, expect, it } from "vitest";
import {
  discoveryProfileRequiresLiveReservation,
  evaluateHomeWanReady,
} from "../src/home-wan-ready.js";

describe("evaluateHomeWanReady", () => {
  it("requires live reservation for wan-default / quietWan / cgnat", () => {
    expect(discoveryProfileRequiresLiveReservation("wan-default")).toBe(true);
    expect(discoveryProfileRequiresLiveReservation("quietWan")).toBe(true);
    expect(discoveryProfileRequiresLiveReservation("cgnat")).toBe(true);
    expect(discoveryProfileRequiresLiveReservation("lan-fast")).toBe(false);

    expect(
      evaluateHomeWanReady({
        meshStarted: true,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        hasLiveRelayReservation: false,
      }),
    ).toEqual({ ready: false, reason: "no-live-relay-reservation" });

    expect(
      evaluateHomeWanReady({
        meshStarted: true,
        discoveryProfile: "wan-default",
        relayEnabled: true,
        hasLiveRelayReservation: true,
      }).ready,
    ).toBe(true);
  });

  it("is ready on lan-fast without reservation", () => {
    expect(
      evaluateHomeWanReady({
        meshStarted: true,
        discoveryProfile: "lan-fast",
        relayEnabled: true,
        hasLiveRelayReservation: false,
      }).ready,
    ).toBe(true);
  });

  it("is not ready before mesh start", () => {
    expect(
      evaluateHomeWanReady({
        meshStarted: false,
        discoveryProfile: "wan-default",
        hasLiveRelayReservation: true,
      }),
    ).toEqual({ ready: false, reason: "mesh-not-started" });
  });

  it("treats unset discovery profile like WAN (require reservation)", () => {
    expect(discoveryProfileRequiresLiveReservation(undefined)).toBe(true);
    expect(
      evaluateHomeWanReady({
        meshStarted: true,
        relayEnabled: true,
        hasLiveRelayReservation: false,
      }),
    ).toEqual({ ready: false, reason: "no-live-relay-reservation" });
  });
});
