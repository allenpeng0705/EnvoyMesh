/**
 * Unit tests for the agent network chains runtime (Phase 40).
 *
 * Covers the `ChainStore` state-management surface and the simple
 * runtime operations. The complex chain planning / launch / inbound
 * envelope handlers stay on the class for now (they pull in many
 * other class helpers) so we don't test them here.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChainState } from "../src/chain-orchestrator.js";

import {
  chainCancelViaRuntime,
  chainDeleteRecipeViaRuntime,
  chainDeleteReportViaRuntime,
  chainExportCostsViaRuntime,
  chainGetBidStrategyViaRuntime,
  chainGetStateViaRuntime,
  chainGetStepProvenanceViaRuntime,
  chainListRecipesViaRuntime,
  chainPreviewGoalViaRuntime,
  chainSaveRecipeViaRuntime,
  chainStartFromGoalViaRuntime,
  resolveChainRecipeViaRuntime,
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
    deleteChainReport: async () => false,
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
    buildChainOrchestratorDeps: async () => ({ now: () => new Date("2030-01-01T00:00:00.000Z") }),
    evaluateAwardAndAccept: async () => ({ ok: false, reason: "unused" }),
    emitChainState: () => undefined,
    startChainTracking: () => undefined,
    placeholderMandate: (chainId, chainMandateId) => ({
      version: "0.1",
      chainMandateId,
      chainId,
      issuerOwnerId: "envoy:owner:test",
      orchestratorOwnerId: "envoy:owner:test",
      maxChainCostUsd: 10,
      costCeilingUsd: 3,
      maxWorkers: 3,
      allowDepth3: false,
      allowDepth4: false,
      maxSensitivity: "public",
      deadlineAt: "2030-01-02T00:00:00.000Z",
      createdAt: "2030-01-01T00:00:00.000Z",
      rebalancePolicy: "never",
      maxAutoRebalances: 0,
      autoRebalanceIncrementUsd: 0,
    }),
    findAgentNetworkWorkers: async () => [],
    chainDiagnosticsForSubtasks: () => [],
    runChainGoal: async () => ({ ok: false, error: "unused" }),
  };
}

describe("ChainStore", () => {
  it("returns lazy per-step provenance without unrelated journal events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-provenance-"));
    try {
      const store = new ChainStore();
      await store.init(dir);
      const state = createChainState({
        chainId: "c-provenance",
        chainMandateId: "m-provenance",
        maxChainCostUsd: 10,
        subtasks: [],
      } as never);
      store.setRuntime(state.chainId, {
        state,
        bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
      });
      state.journalEvent?.("transport.sent", { subtaskId: "s-1", workerPeerId: "peer-1", transportPath: "direct" });
      state.journalEvent?.("transport.sent", { subtaskId: "s-2", workerPeerId: "peer-2", transportPath: "relay" });
      state.journalEvent?.("artifact.selected", {
        subtaskId: "s-1",
        attemptId: "a-1",
        artifactIds: ["result"],
        parentArtifactIds: ["dep:out"],
      });
      state.journalEvent?.("synthesis.lineage", {
        synthesisCostUsd: 0.2,
        ownerPeerId: "owner-1",
        selectedArtifacts: [
          {
            subtaskId: "s-1",
            attemptId: "a-1",
            artifactKeys: ["result"],
            parentArtifactKeys: ["dep:out"],
          },
          {
            subtaskId: "s-2",
            attemptId: "a-2",
            artifactKeys: ["other"],
            parentArtifactKeys: [],
          },
        ],
      });
      const result = await chainGetStepProvenanceViaRuntime(makeContext(store), {
        chainId: state.chainId,
        subtaskId: "s-1",
      });
      expect(result.events.map((e) => e.type)).toEqual([
        "transport.sent",
        "artifact.selected",
        "synthesis.lineage",
      ]);
      expect(result.events[0]).toMatchObject({
        type: "transport.sent",
        workerPeerId: "peer-1",
        transportPath: "direct",
      });
      expect(result.events[1]).toMatchObject({
        type: "artifact.selected",
        artifactIds: ["result"],
        parentArtifactIds: ["dep:out"],
      });
      expect(result.events[2]).toMatchObject({
        type: "synthesis.lineage",
        attemptId: "a-1",
        artifactIds: ["result"],
        parentArtifactIds: ["dep:out"],
      });
      store.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("restores unfinished Team jobs after a node restart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-store-"));
    try {
      const mandate = {
        chainId: "c-recover",
        chainMandateId: "m-recover",
        maxChainCostUsd: 10,
        subtasks: [],
      } as never;
      const first = new ChainStore();
      await first.init(dir);
      const state = createChainState(mandate, { goal: "Recover this job" });
      state.subtasks.set("s-1", { subtaskId: "s-1", dependsOn: [] } as never);
      first.setRuntime(state.chainId, {
        state,
        bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
      });
      await first.persistNow();

      const second = new ChainStore();
      await second.init(dir);
      expect(second.getRuntime("c-recover")?.state.goal).toBe("Recover this job");
      expect(second.getRuntime("c-recover")?.state.subtasks.has("s-1")).toBe(true);
      expect(second.getRuntime("c-recover")?.state.attempts).toBeInstanceOf(Map);
      first.close();
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("restores complete state from the per-chain checkpoint without the legacy snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-store-authoritative-"));
    try {
      const first = new ChainStore();
      await first.init(dir);
      const state = createChainState({
        chainId: "c-authoritative",
        chainMandateId: "m-authoritative",
        maxChainCostUsd: 10,
        subtasks: [],
      } as never, { goal: "Checkpoint owns recovery" });
      state.subtasks.set("s-1", { subtaskId: "s-1", dependsOn: [] } as never);
      state.lastConfidence.set("s-1", 0.82);
      expect((await state.ledger.reserve("s-1", "peer-1", 2)).ok).toBe(true);
      expect((await state.ledger.tryCommit("s-1")).ok).toBe(true);
      first.setRuntime(state.chainId, {
        state,
        bidStrategy: { baseCostUsd: 2, capabilityLocalEtaMs: 30_000, reputationDiscount: 0.8, etaSlackMs: 5_000 },
      });
      await first.persistNow();
      first.close();
      await unlink(join(dir, "active-team-jobs.json"));

      const second = new ChainStore();
      await second.init(dir);
      const restored = second.getRuntime("c-authoritative");
      expect(restored?.state.goal).toBe("Checkpoint owns recovery");
      expect(restored?.state.subtasks.has("s-1")).toBe(true);
      expect(restored?.state.lastConfidence.get("s-1")).toBe(0.82);
      expect(restored?.bidStrategy.baseCostUsd).toBe(2);
      expect(restored?.state.ledger.snapshot()).toMatchObject({
        committedUsd: 2,
        reservedUsd: 0,
        totalAcceptedUsd: 2,
      });
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("replays journal events written after the last atomic checkpoint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-store-tail-"));
    try {
      const mandate = {
        chainId: "c-tail",
        chainMandateId: "m-tail",
        maxChainCostUsd: 10,
        subtasks: [],
      } as never;
      const first = new ChainStore();
      await first.init(dir);
      const state = createChainState(mandate, { goal: "Replay the tail" });
      first.setRuntime(state.chainId, {
        state,
        bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
      });
      state.journalEvent?.("attempt.awarded", {
        attemptId: "attempt_tail",
        chainId: "c-tail",
        subtaskId: "s-tail",
        workerPeerId: "worker-tail",
        role: "primary",
        state: "awarded",
        attemptNumber: 1,
        acceptedCostUsd: 0,
        createdAt: "2030-01-01T00:00:00.000Z",
        updatedAt: "2030-01-01T00:00:00.000Z",
      });
      await first.flushJournal("c-tail");
      await first.persistNow();
      state.journalEvent?.("attempt.state_changed", {
        attemptId: "attempt_tail",
        state: "lost",
        reason: "node_disconnected",
      });
      await first.flushJournal("c-tail");
      first.close();

      const second = new ChainStore();
      await second.init(dir);
      expect(second.getRuntime("c-tail")?.state.attempts.get("attempt_tail")?.state).toBe("lost");
      expect(second.getJournalProjection("c-tail")?.attempts.attempt_tail?.lastReason).toBe(
        "node_disconnected",
      );
      second.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("migrates legacy awards once without duplicating attempts or ledger commits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chain-store-migrate-"));
    try {
      const first = new ChainStore();
      await first.init(dir);
      const state = createChainState({
        chainId: "c-migrate",
        chainMandateId: "m-migrate",
        maxChainCostUsd: 10,
        subtasks: [],
      } as never, { goal: "One-shot migrate" });
      state.subtasks.set("s-1", { subtaskId: "s-1", dependsOn: [] } as never);
      state.awards.set("s-1", {
        subtaskId: "s-1",
        workerPeerId: "peer-1",
        acceptedCostUsd: 3,
        createdAt: "2030-01-01T00:00:00.000Z",
      } as never);
      expect((await state.ledger.reserve("s-1", "peer-1", 3)).ok).toBe(true);
      expect((await state.ledger.tryCommit("s-1")).ok).toBe(true);
      // Pretend this snapshot was written before attempt maps existed.
      state.attempts.clear();
      state.selectedAttemptBySubtask.clear();
      first.setRuntime(state.chainId, {
        state,
        bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 60_000, reputationDiscount: 1, etaSlackMs: 60_000 },
      });
      await first.persistNow();
      first.close();

      // Drop per-chain checkpoint so the next boot must import the legacy mirror once.
      await rm(join(dir, "team-jobs"), { recursive: true, force: true });

      const second = new ChainStore();
      await second.init(dir);
      const migrated = second.getRuntime("c-migrate");
      expect(migrated?.state.attempts.size).toBe(1);
      expect(migrated?.state.attempts.get("attempt_migrated_s-1")?.workerPeerId).toBe("peer-1");
      expect(migrated?.state.ledger.snapshot()).toMatchObject({
        committedUsd: 3,
        reservedUsd: 0,
        totalAcceptedUsd: 3,
      });
      const events = await second.readJournal("c-migrate");
      expect(events.filter((e) => e.type === "migration.legacy_checkpoint_imported")).toHaveLength(1);
      expect(events.filter((e) => e.type === "attempt.awarded")).toHaveLength(1);
      second.close();

      const third = new ChainStore();
      await third.init(dir);
      expect(third.getRuntime("c-migrate")?.state.attempts.size).toBe(1);
      expect(third.getRuntime("c-migrate")?.state.ledger.snapshot()).toMatchObject({
        committedUsd: 3,
        reservedUsd: 0,
        totalAcceptedUsd: 3,
      });
      const eventsAgain = await third.readJournal("c-migrate");
      expect(eventsAgain.filter((e) => e.type === "migration.legacy_checkpoint_imported")).toHaveLength(1);
      expect(eventsAgain.filter((e) => e.type === "attempt.awarded")).toHaveLength(1);
      third.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

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

  it("deleteRuntime drops the entry (no zombie Bidding chain)", () => {
    const store = new ChainStore();
    store.setRuntime("c-solo", { state: {} as never, bidStrategy: {} as never });
    store.deleteRuntime("c-solo");
    expect(store.getRuntime("c-solo")).toBeUndefined();
    expect(store.listActive()).toEqual([]);
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

describe("chainExportCostsViaRuntime", () => {
  it("returns the not_found CSV when no runtime entry exists", () => {
    const store = new ChainStore();
    const out = chainExportCostsViaRuntime(makeContext(store), { chainId: "nope" });
    expect(out.chainId).toBe("nope");
    expect(out.csv).toContain("not_found");
  });
});

describe("chainListRecipesViaRuntime", () => {
  it("returns just the built-in recipes when no task store context is provided", async () => {
    const store = new ChainStore();
    const out = await chainListRecipesViaRuntime(makeContext(store));
    expect(out.recipes.length).toBeGreaterThan(0);
    expect(out.recipes.every((r) => r.saved === false)).toBe(true);
  });

  it("merges saved recipes ahead of built-ins", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.listChainRecipes = async () => [
      {
        id: "recipe_saved_1",
        label: "My brief",
        goal: "Write a short brief with sources.",
        maxChainCostUsd: 12,
      },
    ];
    const out = await chainListRecipesViaRuntime(ctx);
    expect(out.recipes[0]).toMatchObject({
      id: "recipe_saved_1",
      saved: true,
    });
    expect(out.recipes.some((r) => r.saved === false)).toBe(true);
  });
});

describe("resolveChainRecipeViaRuntime", () => {
  it("resolves built-in template ids", async () => {
    const store = new ChainStore();
    const hit = await resolveChainRecipeViaRuntime(makeContext(store), "research");
    expect(hit?.id).toBe("research");
    expect(hit?.saved).toBe(false);
    expect(hit?.goal.length).toBeGreaterThan(0);
  });

  it("prefers saved recipes over built-ins with the same id", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.listChainRecipes = async () => [
      {
        id: "research",
        label: "Custom research",
        goal: "Custom owner research goal that is long enough.",
        maxChainCostUsd: 9,
      },
    ];
    const hit = await resolveChainRecipeViaRuntime(ctx, "research");
    expect(hit).toMatchObject({
      id: "research",
      saved: true,
      goal: "Custom owner research goal that is long enough.",
    });
  });

  it("returns undefined for unknown ids", async () => {
    const store = new ChainStore();
    const hit = await resolveChainRecipeViaRuntime(makeContext(store), "nope");
    expect(hit).toBeUndefined();
  });
});

describe("chainSaveRecipeViaRuntime", () => {
  it("returns validation_failed when label is empty", async () => {
    const store = new ChainStore();
    const out = await chainSaveRecipeViaRuntime(makeContext(store), {
      label: "  ",
      goal: "do a thing",
    });
    expect(out.ok).toBe(false);
  });

  it("returns validation_failed when goal is empty", async () => {
    const store = new ChainStore();
    const out = await chainSaveRecipeViaRuntime(makeContext(store), {
      label: "ok",
      goal: "  ",
    });
    expect(out.ok).toBe(false);
  });

  it("saves via task-store when label and goal are valid", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.hasTaskStore = () => true;
    ctx.saveChainRecipe = async (record) => ({
      id: record.id ?? "recipe_new",
      label: record.label,
      goal: record.goal,
      maxChainCostUsd: record.maxChainCostUsd,
      costCeilingUsd: record.costCeilingUsd,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    });
    const out = await chainSaveRecipeViaRuntime(ctx, {
      label: "My brief",
      goal: "Write a short brief with sources.",
      maxChainCostUsd: 8,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.recipe.label).toBe("My brief");
      expect(out.recipe.saved).toBe(true);
      expect(out.recipe.maxChainCostUsd).toBe(8);
    }
  });
});

describe("chainPreviewGoalViaRuntime templateId", () => {
  it("falls back to saved template goal when params.goal is empty", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.listChainRecipes = async () => [
      {
        id: "recipe_saved",
        label: "Saved",
        goal: "Saved template goal that is long enough for planning.",
        maxChainCostUsd: 15,
        costCeilingUsd: 4,
      },
    ];
    ctx.findAgentNetworkWorkersRanked = async () => [
      {
        peerId: "envoy_agent_worker",
        score: 1,
        summary: "worker",
        sameLan: true,
        online: true,
        viaRelay: false,
      },
    ];
    const out = await chainPreviewGoalViaRuntime(ctx, {
      goal: "   ",
      templateId: "recipe_saved",
      allowLlm: false,
    });
    expect(out.ok).toBe(true);
    expect(out.subtasks.length).toBeGreaterThan(0);
    expect(out.subtasks[0]?.objective).toContain("Saved template goal");
  });

  it("returns no_goal when goal and templateId are both missing", async () => {
    const store = new ChainStore();
    const out = await chainPreviewGoalViaRuntime(makeContext(store), {
      goal: "  ",
      allowLlm: false,
    });
    expect(out).toMatchObject({ ok: false, reason: "no_goal" });
  });
});

describe("chainStartFromGoalViaRuntime templateId", () => {
  it("injects template goal and ceilings into runChainGoal", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.listChainRecipes = async () => [
      {
        id: "recipe_start",
        label: "Start me",
        goal: "Template start goal that is long enough.",
        maxChainCostUsd: 11,
        costCeilingUsd: 2.5,
      },
    ];
    let captured: Record<string, unknown> | undefined;
    ctx.runChainGoal = async (params) => {
      captured = params as Record<string, unknown>;
      return {
        ok: true,
        chainId: "chain_from_template",
        chainMandateId: "chainmandate_from_template",
        subtasks: [],
      };
    };
    // Skip preview path by supplying plannedSubtasks (still resolves template for goal/ceilings).
    const out = await chainStartFromGoalViaRuntime(ctx, {
      goal: "",
      templateId: "recipe_start",
      plannedSubtasks: [
        {
          subtaskId: "subtask_1",
          depth: 1,
          requiredSkill: "task.execute",
          objective: "Template start goal that is long enough.",
          requestedResult: "done",
          constraints: [],
          dependsOn: [],
          createdAt: "2030-01-01T00:00:00.000Z",
          deadlineAt: "2030-01-02T00:00:00.000Z",
        },
      ],
    });
    expect(out.ok).toBe(true);
    expect(captured?.goal).toBe("Template start goal that is long enough.");
    expect(captured?.maxChainCostUsd).toBe(11);
    expect(captured?.costCeilingUsd).toBe(2.5);
  });
});

describe("chainDeleteRecipeViaRuntime", () => {
  it("returns ok:false when no task store context is provided", async () => {
    const store = new ChainStore();
    const out = await chainDeleteRecipeViaRuntime(makeContext(store), { id: "x" });
    expect(out).toEqual({ ok: false, deleted: false });
  });

  it("deletes a saved recipe and refuses built-in ids when delete returns false", async () => {
    const store = new ChainStore();
    const ctx = makeContext(store);
    ctx.hasTaskStore = () => true;
    let deletedId: string | undefined;
    ctx.deleteChainRecipe = async (id) => {
      deletedId = id;
      return id.startsWith("recipe_");
    };
    const saved = await chainDeleteRecipeViaRuntime(ctx, { id: "recipe_x" });
    expect(saved).toEqual({ ok: true, deleted: true });
    expect(deletedId).toBe("recipe_x");
    const builtin = await chainDeleteRecipeViaRuntime(ctx, { id: "research" });
    expect(builtin).toEqual({ ok: false, deleted: false });
  });
});

describe("chainDeleteReportViaRuntime", () => {
  it("returns deleted:false when no task store is bound", async () => {
    const store = new ChainStore();
    const out = await chainDeleteReportViaRuntime(makeContext(store), { chainId: "c1" });
    expect(out).toEqual({ chainId: "c1", deleted: false });
  });

  it("deletes the report and drops runtime", async () => {
    const store = new ChainStore();
    store.setRuntime("c1", {
      state: { chainId: "c1" } as never,
      bidStrategy: { baseCostUsd: 1, capabilityLocalEtaMs: 1, reputationDiscount: 1, etaSlackMs: 1 },
    });
    let deletedId: string | undefined;
    const ctx = makeContext(store);
    ctx.hasTaskStore = () => true;
    ctx.deleteChainReport = async (chainId) => {
      deletedId = chainId;
      return true;
    };
    const out = await chainDeleteReportViaRuntime(ctx, { chainId: "c1" });
    expect(out).toEqual({ chainId: "c1", deleted: true });
    expect(deletedId).toBe("c1");
    expect(store.getRuntime("c1")).toBeUndefined();
  });
});
