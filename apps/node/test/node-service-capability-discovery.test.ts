/**
 * Step 20a tests — capability discovery scheduler runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  runCapabilityDiscoveryCycleViaRuntime,
  startCapabilityDiscoverySchedulerViaRuntime,
  type CapabilityDiscoveryContext,
} from "../src/node-service-capability-discovery.js";

const mocks = vi.hoisted(() => ({
  runCapabilityDiscoveryCycle: vi.fn(async () => undefined),
  buildAutoCapabilityTopics: vi.fn(() => ["topic-1", "topic-2"]),
}));

vi.mock("../src/capability-discovery.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAutoCapabilityTopics: mocks.buildAutoCapabilityTopics,
  runCapabilityDiscoveryCycle: mocks.runCapabilityDiscoveryCycle,
}));

function makeCtx(
  overrides: Partial<CapabilityDiscoveryContext> = {},
): CapabilityDiscoveryContext {
  return {
    getMesh: () => ({ peerId: "peer-1" }),
    getProfile: () => ({ deviceCertificate: { capabilities: ["rust"] } }),
    getTaskStore: () => ({ appendAudit: vi.fn() } as never),
    getDiscoverySeedStore: () => ({ upsert: vi.fn() } as never),
    loadConfig: async () => ({ discoveryProfile: "lan-fast" }),
    loadHumanProfile: async () => undefined,
    getCapabilityDiscoveryTimer: () => undefined,
    setCapabilityDiscoveryTimer: () => {},
    syncPairingKioskFromConfig: async () => {},
    getProfileDir: () => undefined,
    ...overrides,
  };
}

const baseConnectivityRuntime = {
  enableDht: true,
  capabilityDiscoveryJitterMs: 0,
  capabilityDiscoveryIntervalMsEffective: () => 60_000,
};

describe("runCapabilityDiscoveryCycleViaRuntime", () => {
  beforeEach(() => {
    mocks.runCapabilityDiscoveryCycle.mockReset();
    mocks.runCapabilityDiscoveryCycle.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("returns early when mesh is missing", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(
      makeCtx({ getMesh: () => undefined }),
      "startup",
      { connectivityRuntime: baseConnectivityRuntime as never },
    );
    expect(mocks.runCapabilityDiscoveryCycle).not.toHaveBeenCalled();
  });

  it("returns early when profile is missing", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(
      makeCtx({ getProfile: () => undefined }),
      "startup",
      { connectivityRuntime: baseConnectivityRuntime as never },
    );
    expect(mocks.runCapabilityDiscoveryCycle).not.toHaveBeenCalled();
  });

  it("returns early when config is undefined", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(
      makeCtx({ loadConfig: async () => undefined }),
      "startup",
      { connectivityRuntime: baseConnectivityRuntime as never },
    );
    expect(mocks.runCapabilityDiscoveryCycle).not.toHaveBeenCalled();
  });

  it("passes the source + runFind through to the inner cycle", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(makeCtx(), "periodic", {
      connectivityRuntime: baseConnectivityRuntime as never,
      runFind: false,
    });
    expect(mocks.runCapabilityDiscoveryCycle).toHaveBeenCalledTimes(1);
    const callArg = mocks.runCapabilityDiscoveryCycle.mock.calls[0]?.[0] as {
      options: { source: string; runFind: boolean };
    };
    expect(callArg.options.source).toBe("periodic");
    expect(callArg.options.runFind).toBe(false);
  });
});

describe("startCapabilityDiscoverySchedulerViaRuntime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns early when DHT is disabled (no timer, no sync)", () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    const setTimer = vi.fn();
    startCapabilityDiscoverySchedulerViaRuntime(makeCtx({
      setCapabilityDiscoveryTimer: setTimer,
      syncPairingKioskFromConfig: syncSpy,
    }), { ...baseConnectivityRuntime, enableDht: false } as never);
    expect(setTimer).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("returns early when profile is undefined (no timer, no sync)", () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    const setTimer = vi.fn();
    startCapabilityDiscoverySchedulerViaRuntime(makeCtx({
      getProfile: () => undefined,
      setCapabilityDiscoveryTimer: setTimer,
      syncPairingKioskFromConfig: syncSpy,
    }), baseConnectivityRuntime as never);
    expect(setTimer).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("schedules the periodic cycle and triggers pairing-kiosk sync", () => {
    const setTimer = vi.fn();
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    startCapabilityDiscoverySchedulerViaRuntime(makeCtx({
      setCapabilityDiscoveryTimer: setTimer,
      syncPairingKioskFromConfig: syncSpy,
    }), baseConnectivityRuntime as never);
    expect(setTimer).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });
});