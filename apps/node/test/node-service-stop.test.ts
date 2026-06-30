/**
 * Step 20c tests — stopNode runtime.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  stopNodeViaRuntime,
  type StopNodeContext,
} from "../src/node-service-stop.js";
import type { NodeStatus } from "@envoymesh/api";

interface MockMesh {
  stop: ReturnType<typeof vi.fn>;
}

function makeCtx(overrides: Partial<StopNodeContext> = {}): {
  ctx: StopNodeContext;
  spies: {
    getNodeStatus: ReturnType<typeof vi.fn>;
    setNodeStatus: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    clearProfileRequestInflight: ReturnType<typeof vi.fn>;
    stopPairingKiosk: ReturnType<typeof vi.fn>;
    getAndClearRelayClientSchedulerStop: ReturnType<typeof vi.fn>;
    getAndClearNodeStatsLoggingStop: ReturnType<typeof vi.fn>;
    getMesh: ReturnType<typeof vi.fn>;
    setMesh: ReturnType<typeof vi.fn>;
    clearExternalMesh: ReturnType<typeof vi.fn>;
    getAndClearAdvertiseInterestsTimer: ReturnType<typeof vi.fn>;
    getAndClearAdvertiseInterestsStartupTimeout: ReturnType<typeof vi.fn>;
    getDeviceId: ReturnType<typeof vi.fn>;
  };
} {
  // Stateful status so emit("node:status", { status: ctx.getNodeStatus() })
  // reads the latest setStatus value, matching real-class behaviour.
  let status: NodeStatus = "running";
  const spies = {
    getNodeStatus: vi.fn(() => status),
    setNodeStatus: vi.fn((s: NodeStatus) => {
      status = s;
    }),
    emit: vi.fn(),
    clearProfileRequestInflight: vi.fn(),
    stopPairingKiosk: vi.fn(async () => undefined),
    getAndClearRelayClientSchedulerStop: vi.fn((): undefined => undefined),
    getAndClearNodeStatsLoggingStop: vi.fn((): undefined => undefined),
    getMesh: vi.fn((): MockMesh | undefined => undefined) as never,
    setMesh: vi.fn(),
    clearExternalMesh: vi.fn(),
    getAndClearAdvertiseInterestsTimer: vi.fn((): undefined => undefined),
    getAndClearAdvertiseInterestsStartupTimeout: vi.fn((): undefined => undefined),
    getDeviceId: vi.fn((): string | undefined => "device-1"),
  };
  const ctx: StopNodeContext = {
    ...spies,
    getAndClearCapabilityDiscoveryTimer: () => undefined,
    getAndClearBondWarmTimer: () => undefined,
    getAndClearProfileRefreshStartupTimer: () => undefined,
    getAndClearChatRoomSyncFlushTimer: () => null,
    ...overrides,
  };
  return { ctx, spies };
}

describe("stopNodeViaRuntime", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns early when status is already offline", async () => {
    const { ctx, spies } = makeCtx();
    // Override the stateful status to start "offline". Reset spies so we
    // can detect only the calls made during stopNodeViaRuntime.
    spies.setNodeStatus("offline" as never);
    spies.setNodeStatus.mockClear();
    spies.emit.mockClear();
    spies.stopPairingKiosk.mockClear();
    await stopNodeViaRuntime(ctx);
    expect(spies.setNodeStatus).not.toHaveBeenCalled();
    expect(spies.emit).not.toHaveBeenCalled();
    expect(spies.stopPairingKiosk).not.toHaveBeenCalled();
  });

  it("sets status to 'stopping' and emits node:status", async () => {
    const { ctx, spies } = makeCtx();
    await stopNodeViaRuntime(ctx);
    expect(spies.setNodeStatus).toHaveBeenCalledWith("stopping");
    expect(spies.emit).toHaveBeenCalledWith("node:status", { status: "stopping" });
  });

  it("clears profile-request-inflight + stops pairing kiosk + calls stop hooks", async () => {
    const relayStop = vi.fn();
    const statsStop = vi.fn();
    const { ctx, spies } = makeCtx({
      getAndClearRelayClientSchedulerStop: () => relayStop,
      getAndClearNodeStatsLoggingStop: () => statsStop,
    });
    await stopNodeViaRuntime(ctx);
    expect(spies.clearProfileRequestInflight).toHaveBeenCalledTimes(1);
    expect(spies.stopPairingKiosk).toHaveBeenCalledTimes(1);
    expect(relayStop).toHaveBeenCalledTimes(1);
    expect(statsStop).toHaveBeenCalledTimes(1);
  });

  it("stops the mesh when one is present and clears it", async () => {
    const stopSpy = vi.fn(async () => undefined);
    const { ctx, spies } = makeCtx({
      getMesh: () => ({ stop: stopSpy }) as never,
    });
    await stopNodeViaRuntime(ctx);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(spies.setMesh).toHaveBeenCalledWith(undefined);
    expect(spies.clearExternalMesh).toHaveBeenCalledTimes(1);
  });

  it("clears advertise timers", async () => {
    const { ctx, spies } = makeCtx();
    await stopNodeViaRuntime(ctx);
    expect(spies.getAndClearAdvertiseInterestsTimer).toHaveBeenCalledTimes(1);
    expect(spies.getAndClearAdvertiseInterestsStartupTimeout).toHaveBeenCalledTimes(1);
  });

  it("swallows errors from stopPairingKiosk", async () => {
    const { ctx, spies } = makeCtx({
      stopPairingKiosk: async () => {
        throw new Error("kiosk failed");
      },
    });
    await stopNodeViaRuntime(ctx);
    // After the catch, the runtime still sets status -> offline and emits.
    expect(spies.setNodeStatus).toHaveBeenLastCalledWith("offline");
    expect(spies.emit).toHaveBeenCalledWith("node:offline", { peerId: "device-1" });
  });

  it("sets status to 'offline' and emits node:offline with the device id", async () => {
    const { ctx, spies } = makeCtx({
      getDeviceId: () => "device-xyz",
    });
    await stopNodeViaRuntime(ctx);
    expect(spies.setNodeStatus).toHaveBeenLastCalledWith("offline");
    expect(spies.emit).toHaveBeenCalledWith("node:status", { status: "offline" });
    expect(spies.emit).toHaveBeenCalledWith("node:offline", { peerId: "device-xyz" });
  });
});