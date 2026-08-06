/**
 * Phase 3 (B2) — discovery is always *triggered*, never free-running.
 *
 * Locks in the principle from `docs/connectivity-internals-and-design.md`
 * Solution B2: `shouldRunPeriodicCapabilityFind` always returns false, so the
 * capability-discovery cycle never auto-runs a DHT findProviders on a timer.
 * Discovery runs only when explicitly requested (on-demand search, agent tool,
 * bond flow).
 *
 * A future where an AI agent proactively discovers peers for a Team job is
 * still *agent-triggered* (tied to a task) — never a background poll.
 */
import { describe, expect, it } from "vitest";
import { shouldRunPeriodicCapabilityFind } from "../src/connectivity-runtime.js";

function makeRuntime(overrides: Record<string, unknown> = {}): never {
  return {
    enableDht: true,
    lazyCapabilityDiscovery: false,
    connectivityMode: "normal",
    maxConnections: 48,
    mdnsIntervalMs: 10_000,
    mdnsPolicy: "on",
    capabilityDiscoveryIntervalMs: 90_000,
    idleTimerStretch: false,
    connectionMonitorPingIntervalMs: 45_000,
    bondWarmIntervalMs: 300_000,
    bondWarmPerContactCooldownMs: 300_000,
    bondWarmEventDriven: false,
    relayCycleBaseMs: 30_000,
    forceDisableDht: false,
    relayIdleStretchMaxMultiplier: 2,
    ...overrides,
  } as never;
}

describe("shouldRunPeriodicCapabilityFind — discovery is triggered only (B2)", () => {
  it("returns false even when DHT is enabled and lazy is off (normal preset)", () => {
    // This is the case that USED to return true (the legacy periodic find on
    // the normal preset). It must now return false — no background discovery.
    expect(shouldRunPeriodicCapabilityFind(makeRuntime({ enableDht: true, lazyCapabilityDiscovery: false }))).toBe(false);
  });

  it("returns false on every connectivity mode", () => {
    for (const mode of ["normal", "optimized", "smart", "aggressive", "quietWan"] as const) {
      expect(shouldRunPeriodicCapabilityFind(makeRuntime({ connectivityMode: mode }))).toBe(false);
    }
  });

  it("returns false when DHT is disabled", () => {
    expect(shouldRunPeriodicCapabilityFind(makeRuntime({ enableDht: false }))).toBe(false);
  });

  it("returns false regardless of the legacy lazyCapabilityDiscovery flag", () => {
    // lazyCapabilityDiscovery used to gate this; now it's irrelevant.
    expect(shouldRunPeriodicCapabilityFind(makeRuntime({ lazyCapabilityDiscovery: true }))).toBe(false);
    expect(shouldRunPeriodicCapabilityFind(makeRuntime({ lazyCapabilityDiscovery: false }))).toBe(false);
  });
});
