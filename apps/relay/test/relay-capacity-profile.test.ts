import { describe, expect, it } from "vitest";
import {
  applyRelayAutoCapacity,
  clampAdaptiveConnectionLimits,
  clampAdaptiveReservationLimits,
  computeCapacityScore,
  computeRelayCapacityFromHardware,
  detectRelayHostHardware,
  formatRelayCapacityIgnoredOverridesLog,
  formatRelayCapacityStartupLog,
  isRelayAutoCapacityEnabled,
  REFERENCE_CPU_COUNT,
  REFERENCE_RAM_GB,
  resolveRelayCapacityProfile,
} from "../src/relay-capacity-profile.js";
import type { RelayArgs } from "../src/args.js";

function baseArgs(overrides: Partial<RelayArgs> = {}): RelayArgs {
  return {
    profileDir: "./data/relay",
    listen: ["/ip4/0.0.0.0/tcp/4001"],
    advertiseAddrs: [],
    bootstrapPeers: [],
    enableDht: true,
    dhtClientMode: true,
    httpPort: 15432,
    enableRendezvous: true,
    wsAuthToken: "",
    relayPublicMode: true,
    relayMaxReservations: null,
    relayReservationTtlMs: null,
    relayDefaultDataLimitBytes: null,
    relayDefaultDurationLimitMs: null,
    relayHopTimeoutMs: null,
    relayMaxOutboundStopStreams: null,
    maxConnections: null,
    adminUser: "admin",
    adminPassword: "pw",
    logMaxLines: 2000,
    logMaxBytes: 10 * 1024 * 1024,
    logRetainDays: 7,
    a2aBridgeEnabled: false,
    a2aBridgeGatewayUrl: null,
    relayJoinToken: null,
    skipCommunitySiblings: false,
    ...overrides,
  };
}

function hw(cpu: number, ramGb: number) {
  return detectRelayHostHardware({ cpuCount: cpu, ramBytes: ramGb * 1024 ** 3 });
}

describe("relay capacity profile (bottleneck model)", () => {
  it("defaults auto capacity on for public mode", () => {
    expect(isRelayAutoCapacityEnabled({}, baseArgs())).toBe(true);
    expect(isRelayAutoCapacityEnabled({ ENVOYMESH_RELAY_AUTO_CAPACITY: "0" }, baseArgs())).toBe(
      false,
    );
  });

  it("capacityScore ≈ 1.0 at reference 2 vCPU / 4 GB", () => {
    const score = computeCapacityScore(hw(REFERENCE_CPU_COUNT, REFERENCE_RAM_GB));
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThan(1.05);
  });

  it("2 vCPU / 4 GB: reservation floor/ceiling from CPU breakdown", () => {
    const profile = resolveRelayCapacityProfile({
      hardware: hw(2, 4),
      publicMode: true,
      autoCapacityEnabled: true,
    });
    expect(profile.tier).toBe("medium");
    expect(profile.hardwareReservationFloor).toBe(400);
    expect(profile.hardwareReservationCeiling).toBe(400);
    expect(profile.initialAdaptiveReservationBudget).toBe(400);
    expect(profile.hardwareConnectionFloor).toBe(486);
    expect(profile.libp2pReservationCap).toBe(400);
  });

  it("4 vCPU / 8 GB: reservation ceiling from CPU breakdown", () => {
    const profile = computeRelayCapacityFromHardware(hw(4, 8), true);
    expect(profile.hardwareReservationCeiling).toBe(800);
    expect(profile.hardwareReservationFloor).toBeLessThanOrEqual(
      profile.hardwareReservationCeiling,
    );
  });

  it("8 vCPU / 16 GB: reservation ceiling hits product cap", () => {
    const profile = computeRelayCapacityFromHardware(hw(8, 16), true);
    expect(profile.hardwareReservationCeiling).toBe(1024);
    expect(profile.hardwareReservationFloor).toBe(1024);
  });

  it("applyRelayAutoCapacity sets libp2p caps from hardware ceilings", () => {
    const args = baseArgs();
    const result = applyRelayAutoCapacity({
      args,
      env: {},
      hardware: hw(2, 4),
    });
    expect(args.maxConnections).toBe(486);
    expect(args.relayMaxReservations).toBe(400);
    expect(args.relayMaxOutboundStopStreams).toBe(400);
    expect(result.snapshot.adaptiveConnectionBudget).toBe(486);
    expect(result.snapshot.adaptiveReservationBudget).toBe(400);
    expect(formatRelayCapacityStartupLog(result.snapshot)).toContain("adaptiveRes=");
  });

  it("auto mode ignores manual env caps", () => {
    const args = baseArgs({ maxConnections: 256, relayMaxReservations: 128 });
    const result = applyRelayAutoCapacity({
      args,
      env: {
        ENVOYMESH_RELAY_MAX_CONNECTIONS: "256",
        ENVOYMESH_RELAY_MAX_RESERVATIONS: "128",
        ENVOYMESH_RELAY_MAX_RSS_MB: "8192",
      },
      hardware: hw(2, 4),
    });
    expect(args.maxConnections).toBe(486);
    expect(args.relayMaxReservations).toBe(400);
    expect(result.ignoredManualOverrides.length).toBeGreaterThan(0);
    expect(formatRelayCapacityIgnoredOverridesLog(result.ignoredManualOverrides)).toContain(
      "ignored manual caps",
    );
  });

  it("manual caps apply when auto is disabled", () => {
    const limits = clampAdaptiveConnectionLimits({
      hardwareConnectionFloor: 486,
      hardwareConnectionCeiling: 486,
      explicitMaxConnections: 256,
    });
    expect(limits.connectionFloor).toBe(256);
    expect(limits.libp2pConnectionCap).toBe(256);

    const resLimits = clampAdaptiveReservationLimits({
      hardwareReservationFloor: 400,
      hardwareReservationCeiling: 400,
      explicitMaxReservations: 256,
    });
    expect(resLimits.libp2pReservationCap).toBe(256);
    expect(resLimits.initialAdaptiveReservationBudget).toBe(256);
  });
});
