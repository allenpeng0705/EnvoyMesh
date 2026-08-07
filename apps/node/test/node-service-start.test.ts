/**
 * Step 20d tests — startNode runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  startNodeViaRuntime,
  type StartNodeContext,
} from "../src/node-service-start.js";
import type { NodeStatus } from "@envoymesh/api";

function makeCtx(overrides: Partial<StartNodeContext> = {}): {
  ctx: StartNodeContext;
  state: {
    status: NodeStatus;
    profile?: unknown;
    taskStore?: unknown;
    relayStateStore?: unknown;
    discoverySeedStore?: unknown;
    taskRuntimeStore?: unknown;
    inboundGuard?: unknown;
    taskDispatcher?: unknown;
    mesh?: unknown;
    relayBootstrapPeers: string[];
    stopRelayClientScheduler?: () => void;
    stopNodeStatsLogging?: () => void;
    capabilityDiscoveryTimer?: NodeJS.Timeout;
    advertiseInterestsStartupTimeout?: NodeJS.Timeout;
    lastNodeError?: string;
    lastNodeErrorAt?: string;
    nodeProcessStartedAtMs?: number;
  };
  spies: {
    emit: ReturnType<typeof vi.fn>;
    loadConfig: ReturnType<typeof vi.fn>;
    loadPublishedLibraryFromDisk: ReturnType<typeof vi.fn>;
    loadIntentHistoryFromDisk: ReturnType<typeof vi.fn>;
    wireMeshEvents: ReturnType<typeof vi.fn>;
    setRelayBootstrapPeers: ReturnType<typeof vi.fn>;
    recordNodeError: ReturnType<typeof vi.fn>;
    ensureAgentStores: ReturnType<typeof vi.fn>;
    runCapabilityDiscoveryCycle: ReturnType<typeof vi.fn>;
    startCapabilityDiscoveryScheduler: ReturnType<typeof vi.fn>;
    startBondWarmInterval: ReturnType<typeof vi.fn>;
    refreshAgentNetworkMembershipIndex: ReturnType<typeof vi.fn>;
    scheduleDeferredProfileRefresh: ReturnType<typeof vi.fn>;
    advertiseInterestsIfPublic: ReturnType<typeof vi.fn>;
    resyncBondedContactReachabilityTags: ReturnType<typeof vi.fn>;
  };
} {
  const state = {
    status: "offline" as NodeStatus,
    relayBootstrapPeers: [] as string[],
  };
  const spies = {
    emit: vi.fn(),
    loadConfig: vi.fn(async () => ({
      profileDir: `${process.env.TMPDIR ?? "/tmp"}/envoy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      discoveryProfile: "lan-fast",
      bootstrapPeers: [],
      bootstrapPresets: [],
    })),
    loadPublishedLibraryFromDisk: vi.fn(async () => {}),
    loadIntentHistoryFromDisk: vi.fn(async () => {}),
    wireMeshEvents: vi.fn(),
    setRelayBootstrapPeers: vi.fn((addrs: string[]) => {
      state.relayBootstrapPeers = addrs;
    }),
    recordNodeError: vi.fn(),
    ensureAgentStores: vi.fn(async () => true),
    runCapabilityDiscoveryCycle: vi.fn(async () => {}),
    startCapabilityDiscoveryScheduler: vi.fn(),
    startBondWarmInterval: vi.fn(),
    refreshAgentNetworkMembershipIndex: vi.fn(async () => {}),
    scheduleDeferredProfileRefresh: vi.fn(),
    advertiseInterestsIfPublic: vi.fn(async () => {}),
    resyncBondedContactReachabilityTags: vi.fn(async () => {}),
  };

  const ctx: StartNodeContext = {
    getNodeStatus: () => state.status,
    setNodeStatus: (s: NodeStatus) => {
      state.status = s;
    },
    emit: spies.emit,
    getProfile: () => state.profile as never,
    setProfile: (p) => { state.profile = p; },
    getTaskStore: () => state.taskStore as never,
    setTaskStore: (s) => { state.taskStore = s; },
    getRelayStateStore: () => state.relayStateStore as never,
    setRelayStateStore: (s) => { state.relayStateStore = s; },
    getDiscoverySeedStore: () => state.discoverySeedStore as never,
    setDiscoverySeedStore: (s) => { state.discoverySeedStore = s; },
    getTaskRuntimeStore: () => state.taskRuntimeStore as never,
    setTaskRuntimeStore: (s) => { state.taskRuntimeStore = s; },
    getInboundGuard: () => state.inboundGuard as never,
    setInboundGuard: (g) => { state.inboundGuard = g; },
    getTaskDispatcher: () => state.taskDispatcher as never,
    setTaskDispatcher: (d) => { state.taskDispatcher = d; },
    loadConfig: spies.loadConfig,
    getMesh: () => state.mesh as never,
    setMesh: (m) => { state.mesh = m; },
    wireMeshEvents: spies.wireMeshEvents,
    setRelayBootstrapPeers: spies.setRelayBootstrapPeers,
    setStopRelayClientScheduler: (fn) => {
      state.stopRelayClientScheduler = fn;
    },
    setStopNodeStatsLogging: (fn) => {
      state.stopNodeStatsLogging = fn;
    },
    setCapabilityDiscoveryTimer: (t) => {
      state.capabilityDiscoveryTimer = t;
    },
    setAdvertiseInterestsStartupTimeout: (t) => {
      state.advertiseInterestsStartupTimeout = t;
    },
    setLastNodeError: (v) => { state.lastNodeError = v; },
    setLastNodeErrorAt: (v) => { state.lastNodeErrorAt = v; },
    setNodeProcessStartedAtMs: (ms) => {
      state.nodeProcessStartedAtMs = ms;
    },
    startBondWarmInterval: spies.startBondWarmInterval,
    resyncBondedContactReachabilityTags: spies.resyncBondedContactReachabilityTags,
    refreshAgentNetworkMembershipIndex: spies.refreshAgentNetworkMembershipIndex,
    scheduleDeferredProfileRefresh: spies.scheduleDeferredProfileRefresh,
    advertiseInterestsIfPublic: spies.advertiseInterestsIfPublic,
    loadPublishedLibraryFromDisk: spies.loadPublishedLibraryFromDisk,
    loadIntentHistoryFromDisk: spies.loadIntentHistoryFromDisk,
    recordNodeError: spies.recordNodeError,
    ensureAgentStores: spies.ensureAgentStores,
    runCapabilityDiscoveryCycle: spies.runCapabilityDiscoveryCycle,
    startCapabilityDiscoveryScheduler: spies.startCapabilityDiscoveryScheduler,
    ...overrides,
  };
  return { ctx, state, spies };
}

describe("startNodeViaRuntime — guards", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("ensures agent stores and returns when status is already 'running'", async () => {
    const { ctx, spies } = makeCtx();
    // Force 'running' state
    ctx.setNodeStatus("running");
    await startNodeViaRuntime(ctx);
    expect(spies.ensureAgentStores).toHaveBeenCalledTimes(1);
    expect(spies.loadConfig).not.toHaveBeenCalled();
  });

  it("throws when status is 'starting'", async () => {
    const { ctx } = makeCtx();
    ctx.setNodeStatus("starting");
    await expect(startNodeViaRuntime(ctx)).rejects.toThrow(/already starting/);
  });

  it("throws when no config is persisted", async () => {
    const { ctx, spies } = makeCtx();
    spies.loadConfig.mockResolvedValueOnce(undefined);
    await expect(startNodeViaRuntime(ctx)).rejects.toThrow(/No node config/);
  });

  it("sets status to offline + records error when an inner step throws", async () => {
    const { ctx, spies } = makeCtx();
    spies.loadPublishedLibraryFromDisk.mockRejectedValueOnce(new Error("disk failed"));
    await expect(startNodeViaRuntime(ctx)).rejects.toThrow(/disk failed/);
    // After catch, status must be 'offline' and recordNodeError called.
    expect(ctx.getNodeStatus()).toBe("offline");
    expect(spies.recordNodeError).toHaveBeenCalledWith("startNode", expect.any(Error));
    expect(spies.emit).toHaveBeenCalledWith("node:status", { status: "offline" });
  });
});