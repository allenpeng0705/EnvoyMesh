import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  discoveryProfileDefaultEnableMdns,
  discoveryProfileUsesDht,
  resolveLazyCapabilityDiscovery,
  resolveMaxConnections,
  stretchTimerIntervalMs,
  IDLE_MESH_ACTIVITY_THRESHOLD_MS,
  IDLE_TIMER_STRETCH_MULTIPLIER,
} from "../src/connectivity-tuning.js";

describe("connectivity-tuning", () => {
  it("discoveryProfileUsesDht is true only for wan-default", () => {
    expect(discoveryProfileUsesDht("wan-default")).toBe(true);
    expect(discoveryProfileUsesDht("relay-only")).toBe(false);
    expect(discoveryProfileUsesDht("contacts-only")).toBe(false);
    expect(discoveryProfileUsesDht("lan-fast")).toBe(false);
  });

  it("default mDNS on for all discovery profiles", () => {
    expect(discoveryProfileDefaultEnableMdns("lan-fast")).toBe(true);
    expect(discoveryProfileDefaultEnableMdns("wan-default")).toBe(true);
    expect(discoveryProfileDefaultEnableMdns("relay-only")).toBe(true);
    expect(discoveryProfileDefaultEnableMdns("contacts-only")).toBe(true);
  });

  it("lazy capability discovery defaults false (periodic DHT find enabled)", () => {
    expect(resolveLazyCapabilityDiscovery("wan-default")).toBe(false);
    expect(resolveLazyCapabilityDiscovery("relay-only")).toBe(false);
  });

  it("resolveMaxConnections returns undefined when unset", () => {
    expect(resolveMaxConnections(undefined)).toBeUndefined();
  });

  it("stretchTimerIntervalMs multiplies when idle", () => {
    const now = Date.now();
    expect(
      stretchTimerIntervalMs(30_000, {
        idleStretchEnabled: true,
        lastMeshActivityMs: now - IDLE_MESH_ACTIVITY_THRESHOLD_MS - 1,
        now,
      }),
    ).toBe(30_000 * IDLE_TIMER_STRETCH_MULTIPLIER);
    expect(
      stretchTimerIntervalMs(30_000, {
        idleStretchEnabled: true,
        lastMeshActivityMs: now - 1000,
        now,
      }),
    ).toBe(30_000);
  });
});
