/**
 * Phase 3 (B2) — discovery is always *triggered*, never free-running.
 *
 * Locks in the principle from `docs/connectivity-internals-and-design.md`
 * Solution B2: periodic/startup capability cycles advertise only. DHT
 * findProviders runs only when the caller passes `runFind: true` (Discover UI,
 * agent tool, bond flow) or `source === "on-demand"`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runCapabilityDiscoveryCycleViaRuntime,
  type CapabilityDiscoveryContext,
} from "../src/node-service-capability-discovery.js";

const mocks = vi.hoisted(() => ({
  runCapabilityDiscoveryCycle: vi.fn(async () => undefined),
  buildAutoCapabilityTopics: vi.fn(() => ["topic-1"]),
  buildProfileDiscoveryTopics: vi.fn(() => ["topic-1"]),
}));

vi.mock("../src/capability-discovery.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildAutoCapabilityTopics: mocks.buildAutoCapabilityTopics,
  buildProfileDiscoveryTopics: mocks.buildProfileDiscoveryTopics,
  runCapabilityDiscoveryCycle: mocks.runCapabilityDiscoveryCycle,
}));

function makeCtx(): CapabilityDiscoveryContext {
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
  };
}

const runtime = {
  enableDht: true,
  capabilityDiscoveryJitterMs: 0,
  capabilityDiscoveryIntervalMsEffective: () => 60_000,
} as never;

describe("capability discovery runFind wiring — triggered only (B2)", () => {
  beforeEach(() => {
    mocks.runCapabilityDiscoveryCycle.mockReset();
    mocks.runCapabilityDiscoveryCycle.mockResolvedValue(undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("periodic cycle does not auto-run findProviders", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(makeCtx(), "periodic", {
      connectivityRuntime: runtime,
    });
    const callArg = mocks.runCapabilityDiscoveryCycle.mock.calls[0]?.[0] as {
      options: { runFind: boolean };
    };
    expect(callArg.options.runFind).toBe(false);
  });

  it("startup cycle does not auto-run findProviders", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(makeCtx(), "startup", {
      connectivityRuntime: runtime,
    });
    const callArg = mocks.runCapabilityDiscoveryCycle.mock.calls[0]?.[0] as {
      options: { runFind: boolean };
    };
    expect(callArg.options.runFind).toBe(false);
  });

  it("on-demand source enables findProviders", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(makeCtx(), "on-demand", {
      connectivityRuntime: runtime,
    });
    const callArg = mocks.runCapabilityDiscoveryCycle.mock.calls[0]?.[0] as {
      options: { runFind: boolean };
    };
    expect(callArg.options.runFind).toBe(true);
  });

  it("explicit runFind: true still wins on periodic source", async () => {
    await runCapabilityDiscoveryCycleViaRuntime(makeCtx(), "periodic", {
      connectivityRuntime: runtime,
      runFind: true,
    });
    const callArg = mocks.runCapabilityDiscoveryCycle.mock.calls[0]?.[0] as {
      options: { runFind: boolean };
    };
    expect(callArg.options.runFind).toBe(true);
  });
});
