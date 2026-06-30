/**
 * Unit tests for the agent network chains runtime (Phase 40).
 *
 * Covers the `ChainStore` state-management surface and the simple
 * runtime operations. The complex chain planning / launch / inbound
 * envelope handlers stay on the class for now (they pull in many
 * other class helpers) so we don't test them here.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  chainCancelViaRuntime,
  chainGetBidStrategyViaRuntime,
  chainGetStateViaRuntime,
  chainSetBidStrategyViaRuntime,
  ChainStore,
  type ChainContext,
} from "../src/node-service-chains.js";

function makeContext(store: ChainStore): ChainContext {
  return {
    store,
    hasTaskStore: () => false,
    listChainReports: async () => [],
    getChainReport: async () => null,
    pinChainReport: async () => undefined,
    getChainGoal: () => undefined,
    getChainCostEstimate: () => undefined,
    snapshotToResult: () => ({
      chainId: "",
      chainMandateId: "",
      subtaskCount: 0,
      bidCount: 0,
      awardedCount: 0,
      partialCount: 0,
      cancelledCount: 0,
      chainCancelled: false,
      published: false,
      budgetSpentUsd: 0,
      budgetMaxUsd: 0,
      budgetReservedUsd: 0,
      budgetSynthesisUsd: 0,
    }),
    bidsBySubtask: () => ({}),
    getNodeConfig: async () => null,
    setNodeConfig: async () => undefined,
  };
}

describe("ChainStore", () => {
  it("getRuntime returns undefined for unknown chain", () => {
    const store = new ChainStore();
    expect(store.getRuntime("nope")).toBeUndefined();
  });

  it("setRuntime + getRuntime round-trip", () => {
    const store = new ChainStore();
    const entry = {
      state: {} as never,
      bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
    };
    store.setRuntime("c-1", entry);
    expect(store.getRuntime("c-1")).toBe(entry);
  });

  it("cancel on unknown chain returns []", () => {
    const store = new ChainStore();
    expect(store.cancel("nope", undefined)).toEqual([]);
    expect(store.cancel("nope", "sub-1")).toEqual([]);
  });

  it("cancel on present chain — full chain cancel", () => {
    const store = new ChainStore();
    const state = {
      subtasks: new Map([["s-1", {}], ["s-2", {}]]),
      cancelledSubtasks: new Set<string>(),
      chainCancelled: false,
    } as never;
    store.setRuntime("c-1", { state, bidStrategy: {} as never });
    const cancelled = store.cancel("c-1", undefined);
    expect(cancelled.sort()).toEqual(["s-1", "s-2"]);
    expect(state.chainCancelled).toBe(true);
  });

  it("cancel on present chain — single subtask cancel", () => {
    const store = new ChainStore();
    const state = {
      subtasks: new Map([["s-1", {}], ["s-2", {}]]),
      cancelledSubtasks: new Set<string>(),
      chainCancelled: false,
    } as never;
    store.setRuntime("c-1", { state, bidStrategy: {} as never });
    const cancelled = store.cancel("c-1", "s-1");
    expect(cancelled).toEqual(["s-1"]);
    expect(state.chainCancelled).toBe(false);
    expect(state.cancelledSubtasks.has("s-1")).toBe(true);
  });

  it("bid strategy default + set + get", () => {
    const store = new ChainStore();
    expect(store.getBidStrategy("wasm")).toMatchObject({
      baseCostUsd: 1,
      capabilityLocalEtaMs: 60_000,
    });
    store.setBidStrategy("wasm", {
      baseCostUsd: 5,
      capabilityLocalEtaMs: 30_000,
      reputationDiscount: 0.8,
      etaSlackMs: 10_000,
    });
    expect(store.getBidStrategy("wasm").baseCostUsd).toBe(5);
  });

  it("listActive returns all runtime entries", () => {
    const store = new ChainStore();
    store.setRuntime("c-1", { state: {} as never, bidStrategy: {} as never });
    store.setRuntime("c-2", { state: {} as never, bidStrategy: {} as never });
    expect(store.listActive()).toHaveLength(2);
  });

  it("listIds returns the chain id list", () => {
    const store = new ChainStore();
    store.setRuntime("c-1", { state: {} as never, bidStrategy: {} as never });
    store.setRuntime("c-2", { state: {} as never, bidStrategy: {} as never });
    expect(store.listIds().sort()).toEqual(["c-1", "c-2"]);
  });

  it("clear() drops everything", () => {
    const store = new ChainStore();
    store.setRuntime("c-1", { state: {} as never, bidStrategy: {} as never });
    store.setBidStrategy("wasm", { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 });
    store.clear();
    expect(store.listActive()).toEqual([]);
    expect(store.getRuntime("c-1")).toBeUndefined();
    expect(store.getBidStrategy("wasm").baseCostUsd).toBe(1); // default
  });
});

describe("chainGetStateViaRuntime", () => {
  it("returns the empty-state shape when no runtime entry exists", () => {
    const store = new ChainStore();
    const out = chainGetStateViaRuntime(makeContext(store), { chainId: "nope" });
    expect(out.chainId).toBe("nope");
    expect(out.subtaskCount).toBe(0);
    expect(out.chainMandateId).toBe("");
  });
});

describe("chainCancelViaRuntime", () => {
  it("returns cancelled: [] when no runtime entry", () => {
    const store = new ChainStore();
    const out = chainCancelViaRuntime(makeContext(store), { chainId: "nope" });
    expect(out.cancelled).toEqual([]);
  });
});

describe("chainSetBidStrategyViaRuntime + chainGetBidStrategyViaRuntime", () => {
  it("round-trips through the store", () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    chainSetBidStrategyViaRuntime(ctx, {
      capability: "rust",
      baseCostUsd: 2,
      capabilityLocalEtaMs: 30_000,
    });
    const got = chainGetBidStrategyViaRuntime(ctx, { capability: "rust" });
    expect(got.baseCostUsd).toBe(2);
    expect(got.capabilityLocalEtaMs).toBe(30_000);
    expect(got.reputationDiscount).toBe(1.0); // default
  });

  it("chainSetBidStrategyViaRuntime returns the configured cost", () => {
    const store = new ChainStore();
    const out = chainSetBidStrategyViaRuntime(makeContext(store), {
      capability: "x",
      baseCostUsd: 7,
      capabilityLocalEtaMs: 10_000,
    });
    expect(out.baseCostUsd).toBe(7);
  });
});