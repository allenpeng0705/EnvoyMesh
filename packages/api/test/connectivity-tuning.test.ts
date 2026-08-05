import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  DEFAULT_CONNECTIVITY_MODE,
  discoveryProfileDefaultEnableMdns,
  discoveryProfileUsesDht,
  formatConnectivityPresetSummary,
  resolveConnectivityMode,
  resolveConnectivityPreset,
  resolveConnectivityTuning,
  resolveEnableMdns,
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

  it("defaults to optimized mode when unset", () => {
    expect(resolveConnectivityMode(undefined)).toBe(DEFAULT_CONNECTIVITY_MODE);
    expect(resolveConnectivityMode("nope")).toBe("optimized");
    expect(resolveConnectivityPreset().mode).toBe("optimized");
  });

  it("normal preset matches legacy chatty defaults", () => {
    const p = resolveConnectivityPreset("normal");
    expect(p.maxConnections).toBe(DEFAULT_CLIENT_MAX_CONNECTIONS);
    expect(p.mdnsIntervalMs).toBe(10_000);
    expect(p.relayCycleBaseMs).toBe(30_000);
    expect(p.connectionMonitorPingIntervalMs).toBe(45_000);
    expect(p.lazyCapabilityDiscovery).toBe(false);
    expect(p.idleTimerStretch).toBe(false);
    expect(p.forceDisableDht).toBe(false);
  });

  it("optimized preset is quieter than normal", () => {
    const n = resolveConnectivityPreset("normal");
    const o = resolveConnectivityPreset("optimized");
    expect(o.mdnsIntervalMs).toBeGreaterThan(n.mdnsIntervalMs);
    expect(o.relayCycleBaseMs).toBeGreaterThan(n.relayCycleBaseMs);
    expect(o.connectionMonitorPingIntervalMs).toBeGreaterThan(n.connectionMonitorPingIntervalMs);
    // Same connection ceiling as normal — quieter via timers/lazy discovery only.
    expect(o.maxConnections).toBe(n.maxConnections);
    expect(o.maxConnections).toBe(DEFAULT_CLIENT_MAX_CONNECTIONS);
    expect(o.lazyCapabilityDiscovery).toBe(true);
    expect(o.idleTimerStretch).toBe(true);
  });

  it("aggressive forces DHT off and lan-only mDNS", () => {
    const p = resolveConnectivityPreset("aggressive");
    expect(p.forceDisableDht).toBe(true);
    expect(p.mdnsPolicy).toBe("lan-only");
    expect(p.bondWarmEventDriven).toBe(true);
    expect(resolveEnableMdns("wan-default", undefined, { mdnsPolicy: "lan-only" })).toBe(false);
    expect(resolveEnableMdns("lan-fast", undefined, { mdnsPolicy: "lan-only" })).toBe(true);
  });

  it("resolveConnectivityTuning applies preset then overrides", () => {
    const t = resolveConnectivityTuning({
      connectivityMode: "optimized",
      maxConnections: 50,
    });
    expect(t.connectivityMode).toBe("optimized");
    expect(t.maxConnections).toBe(50);
    expect(t.lazyCapabilityDiscovery).toBe(true);
    expect(t.mdnsIntervalMs).toBe(45_000);
  });

  it("formatConnectivityPresetSummary is non-empty", () => {
    const s = formatConnectivityPresetSummary(resolveConnectivityPreset("smart"));
    expect(s).toMatch(/mDNS/);
    expect(s).toMatch(/relay/);
  });
});
