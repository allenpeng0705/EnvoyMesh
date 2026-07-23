/**
 * Phase 40E — Cross-orchestrator + cross-home chain schema tests.
 *
 * Verifies the protocol-level surface for the 4 new 40E intents:
 *   - `task.chain.handoff`    (ChainHandoffRequestPayloadSchema)
 *   - `task.chain.delegate`   (ChainHandoffDelegatePayloadSchema)
 *   - `task.chain.relay`      (ChainRelayRouteSchema)
 *   - `task.chain.arbitration`(ChainArbitrationPayloadSchema + ChainArbitrationEntrySchema)
 *
 * Helpers:
 *   - `ChainHandoffStatusSchema` (pending | delegated | rejected | expired | cancelled)
 *   - `isHandoffOpen`, `isHandoffTerminal`, `isHandoffLive`, `getSubChainRootSubtasks`
 *
 * Mirrors the shape of `call-schemas.test.ts` (Phase 38 had the same pattern).
 */

import { describe, expect, it } from "vitest";

import {
  ChainArbitrationEntrySchema,
  ChainArbitrationPayloadSchema,
  ChainHandoffDelegatePayloadSchema,
  ChainHandoffRequestPayloadSchema,
  ChainHandoffStatusSchema,
  ChainRelayRouteSchema,
  ChainSubtaskIdSchema,
  createChainId,
  createChainMandateId,
  createChainSubtaskId,
  getSubChainRootSubtasks,
  isHandoffLive,
  isHandoffOpen,
  isHandoffTerminal,
  type ChainHandoffStatus,
  type ChainSubtask,
} from "../src/index.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");
const PAST = "2026-06-17T00:00:00.000Z";
const FUTURE = "2026-06-18T01:00:00.000Z";

function handoffRequest(overrides: Partial<{ [k: string]: unknown }> = {}) {
  return ChainHandoffRequestPayloadSchema.parse({
    chainId: createChainId(),
    subtaskIds: [createChainSubtaskId()],
    newOrchestratorPeerId: "12D3KooW-new-orch",
    newOrchestratorOwnerId: "envoy:owner:b",
    expiresAt: FUTURE,
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

function handoffDelegate(overrides: Partial<{ [k: string]: unknown }> = {}) {
  return ChainHandoffDelegatePayloadSchema.parse({
    chainId: createChainId(),
    subtaskIds: [createChainSubtaskId()],
    handoffRequestId: "handoff_x_1",
    subChainId: createChainId(),
    subChainMandate: {
      version: "0.1",
      chainMandateId: createChainMandateId(),
      chainId: createChainId(),
      issuerOwnerId: "envoy:owner:b",
      orchestratorOwnerId: "envoy:owner:b",
      maxChainCostUsd: 1,
      costCeilingUsd: 1,
      maxWorkers: 1,
      allowDepth3: false,
      maxSensitivity: "public",
      deadlineAt: FUTURE,
      createdAt: NOW.toISOString(),
      rebalancePolicy: "manual",
      maxAutoRebalances: 0,
      autoRebalanceIncrementUsd: 0,
      signature: "stub",
    },
    reportBackByAt: FUTURE,
    estimatedCostUsd: 1,
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

function relayRoute(overrides: Partial<{ [k: string]: unknown }> = {}) {
  return ChainRelayRouteSchema.parse({
    chainId: createChainId(),
    innerIntent: "task.chain.delegate",
    recipientPeerId: "12D3KooW-b",
    viaRelays: [],
    ttlMs: 60_000,
    innerPayload: { hello: "world" },
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

function arbitrationEntry(overrides: Partial<{ [k: string]: unknown }> = {}) {
  return ChainArbitrationEntrySchema.parse({
    chainId: createChainId(),
    arbitrationId: `arbitration_chain_x_1`,
    seq: 1,
    subtaskIds: [createChainSubtaskId()],
    currentOwnerPeerId: "12D3KooW-b",
    currentOwnerOwnerId: "envoy:owner:b",
    previousOwnerPeerId: "12D3KooW-a",
    status: "delegated",
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

function arbitrationPayload(overrides: Partial<{ [k: string]: unknown }> = {}) {
  return ChainArbitrationPayloadSchema.parse({
    chainId: createChainId(),
    entry: arbitrationEntry(),
    convergeByAt: FUTURE,
    createdAt: NOW.toISOString(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// ChainHandoffStatusSchema
// ---------------------------------------------------------------------------

describe("ChainHandoffStatusSchema", () => {
  it("accepts all 5 documented status values", () => {
    for (const status of [
      "pending",
      "delegated",
      "rejected",
      "expired",
      "cancelled",
    ] as const) {
      expect(() => ChainHandoffStatusSchema.parse(status)).not.toThrow();
    }
  });

  it("rejects unknown status", () => {
    expect(() => ChainHandoffStatusSchema.parse("completed")).toThrow();
    expect(() => ChainHandoffStatusSchema.parse("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ChainHandoffRequestPayloadSchema (task.chain.handoff)
// ---------------------------------------------------------------------------

describe("ChainHandoffRequestPayloadSchema", () => {
  it("parses a minimal request with required fields", () => {
    const r = handoffRequest();
    expect(r.subtaskIds).toHaveLength(1);
    expect(r.newOrchestratorPeerId).toBe("12D3KooW-new-orch");
  });

  it("rejects empty subtaskIds array", () => {
    expect(() =>
      ChainHandoffRequestPayloadSchema.parse({
        chainId: createChainId(),
        subtaskIds: [],
        newOrchestratorPeerId: "p",
        newOrchestratorOwnerId: "o",
        expiresAt: FUTURE,
        createdAt: NOW.toISOString(),
      }),
    ).toThrow();
  });

  it("rejects more than 64 subtaskIds", () => {
    const tooMany = Array.from({ length: 65 }, () => createChainSubtaskId());
    expect(() =>
      ChainHandoffRequestPayloadSchema.parse({
        chainId: createChainId(),
        subtaskIds: tooMany,
        newOrchestratorPeerId: "p",
        newOrchestratorOwnerId: "o",
        expiresAt: FUTURE,
        createdAt: NOW.toISOString(),
      }),
    ).toThrow();
  });

  it("accepts 64 subtaskIds at the cap", () => {
    const max = Array.from({ length: 64 }, () => createChainSubtaskId());
    const r = ChainHandoffRequestPayloadSchema.parse({
      chainId: createChainId(),
      subtaskIds: max,
      newOrchestratorPeerId: "p",
      newOrchestratorOwnerId: "o",
      expiresAt: FUTURE,
      createdAt: NOW.toISOString(),
    });
    expect(r.subtaskIds).toHaveLength(64);
  });

  it("accepts whole-job Assigner handoff with goal and empty subtaskIds", () => {
    const r = handoffRequest({
      subtaskIds: [],
      goal: "compute (5*6+7*8-4*2)/3 with team workers",
      rationale: "assigner_handoff",
    });
    expect(r.goal).toContain("5*6");
    expect(r.subtaskIds).toEqual([]);
  });

  it("accepts Phase 47D iteration knobs and iterationState blob", () => {
    const r = ChainHandoffRequestPayloadSchema.parse({
      chainId: createChainId(),
      subtaskIds: [],
      newOrchestratorPeerId: "p",
      newOrchestratorOwnerId: "o",
      goal: "refine a report across two rounds",
      expiresAt: FUTURE,
      createdAt: NOW.toISOString(),
      iterationMaxRounds: 2,
      iterationJudgeMode: "owner",
      extendMaxStepsPerRound: 1,
      iterationState: {
        round: 1,
        maxRounds: 2,
        extendsInRound: 0,
        maxExtendsInRound: 1,
        sealedByRound: {},
        openRoundSubtaskIds: [],
        drafts: [{ round: 1, summary: "draft", judgeDecision: "continue" }],
        judgeMode: "owner",
        carryMode: "summary",
        goal: "refine a report across two rounds",
      },
    });
    expect(r.iterationMaxRounds).toBe(2);
    expect(r.iterationJudgeMode).toBe("owner");
    expect(r.extendMaxStepsPerRound).toBe(1);
    expect(r.iterationState?.drafts[0]?.summary).toBe("draft");
  });

  it("rejects empty handoff with neither subtaskIds nor goal", () => {
    expect(() => handoffRequest({ subtaskIds: [] })).toThrow();
  });

  it("rejects empty newOrchestratorPeerId", () => {
    expect(() =>
      handoffRequest({ newOrchestratorPeerId: "" }),
    ).toThrow();
  });

  it("rejects empty newOrchestratorOwnerId", () => {
    expect(() =>
      handoffRequest({ newOrchestratorOwnerId: "" }),
    ).toThrow();
  });

  it("rejects non-datetime expiresAt", () => {
    expect(() => handoffRequest({ expiresAt: "not-a-date" })).toThrow();
  });

  it("accepts an optional rationale up to 2000 chars", () => {
    const r = handoffRequest({ rationale: "owner wants B's specialized workers" });
    expect(r.rationale).toBe("owner wants B's specialized workers");
  });

  it("rejects a rationale longer than 2000 chars", () => {
    expect(() => handoffRequest({ rationale: "x".repeat(2001) })).toThrow();
  });

  it("roundtrips through parse", () => {
    const r = handoffRequest();
    expect(ChainHandoffRequestPayloadSchema.parse(r)).toEqual(r);
  });
});

// ---------------------------------------------------------------------------
// ChainHandoffDelegatePayloadSchema (task.chain.delegate)
// ---------------------------------------------------------------------------

describe("ChainHandoffDelegatePayloadSchema", () => {
  it("parses a minimal delegate with sub-mandate", () => {
    const d = handoffDelegate();
    expect(d.handoffRequestId).toBe("handoff_x_1");
    expect(d.subChainMandate.signature).toBe("stub");
  });

  it("rejects empty subtaskIds array", () => {
    expect(() => handoffDelegate({ subtaskIds: [] })).toThrow();
  });

  it("rejects negative estimatedCostUsd", () => {
    expect(() => handoffDelegate({ estimatedCostUsd: -0.01 })).toThrow();
  });

  it("accepts estimatedCostUsd = 0 (free delegation)", () => {
    const d = handoffDelegate({ estimatedCostUsd: 0 });
    expect(d.estimatedCostUsd).toBe(0);
  });

  it("rejects missing subChainMandate signature", () => {
    const bad = handoffDelegate();
    const { signature: _sig, ...unsigned } = bad.subChainMandate;
    void _sig;
    expect(() =>
      ChainHandoffDelegatePayloadSchema.parse({
        ...bad,
        subChainMandate: unsigned,
      }),
    ).toThrow();
  });

  it("roundtrips through parse", () => {
    const d = handoffDelegate();
    expect(ChainHandoffDelegatePayloadSchema.parse(d)).toEqual(d);
  });
});

// ---------------------------------------------------------------------------
// ChainRelayRouteSchema (task.chain.relay)
// ---------------------------------------------------------------------------

describe("ChainRelayRouteSchema", () => {
  it("parses a minimal relay route", () => {
    const r = relayRoute();
    expect(r.innerIntent).toBe("task.chain.delegate");
    expect(r.viaRelays).toEqual([]);
    expect(r.ttlMs).toBe(60_000);
  });

  it("defaults viaRelays to [] and ttlMs to 60_000 when omitted", () => {
    const r = ChainRelayRouteSchema.parse({
      chainId: createChainId(),
      innerIntent: "task.chain.delegate",
      recipientPeerId: "12D3KooW-b",
      innerPayload: { x: 1 },
      createdAt: NOW.toISOString(),
    });
    expect(r.viaRelays).toEqual([]);
    expect(r.ttlMs).toBe(60_000);
  });

  it("rejects non-positive ttlMs", () => {
    expect(() => relayRoute({ ttlMs: 0 })).toThrow();
    expect(() => relayRoute({ ttlMs: -1 })).toThrow();
  });

  it("rejects empty innerIntent", () => {
    expect(() => relayRoute({ innerIntent: "" })).toThrow();
  });

  it("accepts an arbitrary innerPayload (the relay doesn't parse it)", () => {
    const r = relayRoute({ innerPayload: { complex: ["nested", 42, null] } });
    expect(r.innerPayload).toEqual({ complex: ["nested", 42, null] });
  });

  it("rejects empty recipientPeerId", () => {
    expect(() => relayRoute({ recipientPeerId: "" })).toThrow();
  });

  it("roundtrips through parse", () => {
    const r = relayRoute();
    expect(ChainRelayRouteSchema.parse(r)).toEqual(r);
  });
});

// ---------------------------------------------------------------------------
// ChainArbitrationEntrySchema + ChainArbitrationPayloadSchema
// ---------------------------------------------------------------------------

describe("ChainArbitrationEntrySchema", () => {
  it("parses an entry with all fields", () => {
    const e = arbitrationEntry();
    expect(e.seq).toBe(1);
    expect(e.status).toBe("delegated");
    expect(e.previousOwnerPeerId).toBe("12D3KooW-a");
  });

  it("defaults subtaskIds to [] (whole-chain arbitration)", () => {
    const e = ChainArbitrationEntrySchema.parse({
      chainId: createChainId(),
      arbitrationId: "arbitration_x_1",
      seq: 1,
      currentOwnerPeerId: "p",
      currentOwnerOwnerId: "o",
      status: "pending",
      createdAt: NOW.toISOString(),
    });
    expect(e.subtaskIds).toEqual([]);
  });

  it("rejects seq < 1", () => {
    expect(() => arbitrationEntry({ seq: 0 })).toThrow();
  });

  it("rejects empty arbitrationId", () => {
    expect(() => arbitrationEntry({ arbitrationId: "" })).toThrow();
  });

  it("rejects empty currentOwnerPeerId / currentOwnerOwnerId", () => {
    expect(() => arbitrationEntry({ currentOwnerPeerId: "" })).toThrow();
    expect(() => arbitrationEntry({ currentOwnerOwnerId: "" })).toThrow();
  });

  it("accepts all 5 status values", () => {
    for (const status of [
      "pending",
      "delegated",
      "rejected",
      "expired",
      "cancelled",
    ] as ChainHandoffStatus[]) {
      const e = arbitrationEntry({ status });
      expect(e.status).toBe(status);
    }
  });

  it("roundtrips through parse", () => {
    const e = arbitrationEntry();
    expect(ChainArbitrationEntrySchema.parse(e)).toEqual(e);
  });
});

describe("ChainArbitrationPayloadSchema", () => {
  it("wraps an entry + convergeByAt", () => {
    const p = arbitrationPayload();
    expect(p.entry.seq).toBe(1);
    expect(p.convergeByAt).toBe(FUTURE);
  });

  it("rejects non-datetime convergeByAt", () => {
    expect(() => arbitrationPayload({ convergeByAt: "tomorrow" })).toThrow();
  });

  it("rejects payload with malformed entry", () => {
    expect(() =>
      ChainArbitrationPayloadSchema.parse({
        chainId: createChainId(),
        entry: { seq: 0 }, // missing required fields
        convergeByAt: FUTURE,
        createdAt: NOW.toISOString(),
      }),
    ).toThrow();
  });

  it("roundtrips through parse", () => {
    const p = arbitrationPayload();
    expect(ChainArbitrationPayloadSchema.parse(p)).toEqual(p);
  });
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

describe("isHandoffOpen", () => {
  it("returns true only for 'pending'", () => {
    expect(isHandoffOpen("pending")).toBe(true);
    for (const status of ["delegated", "rejected", "expired", "cancelled"] as ChainHandoffStatus[]) {
      expect(isHandoffOpen(status)).toBe(false);
    }
  });
});

describe("isHandoffTerminal", () => {
  it("returns false for 'pending'", () => {
    expect(isHandoffTerminal("pending")).toBe(false);
  });

  it("returns true for every non-pending status", () => {
    for (const status of ["delegated", "rejected", "expired", "cancelled"] as ChainHandoffStatus[]) {
      expect(isHandoffTerminal(status)).toBe(true);
    }
  });
});

describe("isHandoffLive", () => {
  it("returns true when expiresAt is in the future relative to now", () => {
    expect(isHandoffLive({ expiresAt: FUTURE }, NOW)).toBe(true);
  });

  it("returns false when expiresAt is in the past relative to now", () => {
    expect(isHandoffLive({ expiresAt: PAST }, NOW)).toBe(false);
  });

  it("uses real Date.now() when no clock is injected", () => {
    const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isHandoffLive({ expiresAt: farFuture })).toBe(true);
  });

  it("returns false for malformed expiresAt (NaN parses to past)", () => {
    expect(isHandoffLive({ expiresAt: "not-a-date" }, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getSubChainRootSubtasks
// ---------------------------------------------------------------------------

describe("getSubChainRootSubtasks", () => {
  function subtask(id: string, overrides: Partial<ChainSubtask> = {}): ChainSubtask {
    return {
      version: "0.1",
      subtaskId: id,
      chainId: "chain_x",
      chainMandateId: "chainmandate_x",
      depth: 1,
      requiredCapability: "task.execute",
      objective: "obj",
      requestedResult: "res",
      constraints: [],
      dependsOn: [],
      createdAt: NOW.toISOString(),
      ...overrides,
    } as ChainSubtask;
  }

  it("returns the subtasks whose IDs are in the handoff set", () => {
    const s1 = subtask("subtask_a");
    const s2 = subtask("subtask_b");
    const s3 = subtask("subtask_c");
    expect(getSubChainRootSubtasks([s1, s2, s3], ["subtask_a", "subtask_c"])).toEqual([s1, s3]);
  });

  it("returns an empty array when no IDs match", () => {
    const s1 = subtask("subtask_a");
    expect(getSubChainRootSubtasks([s1], ["subtask_unknown"])).toEqual([]);
  });

  it("returns an empty array when the input list is empty", () => {
    expect(getSubChainRootSubtasks([], ["subtask_a"])).toEqual([]);
  });

  it("preserves the order of the source subtasks array (handoff ID order is irrelevant)", () => {
    const s1 = subtask("subtask_a");
    const s2 = subtask("subtask_b");
    const result = getSubChainRootSubtasks([s1, s2], ["subtask_b", "subtask_a"]);
    // The helper filters by set membership; the output order mirrors the
    // source subtasks array, not the handoff ID list.
    expect(result.map((s) => s.subtaskId)).toEqual(["subtask_a", "subtask_b"]);
  });

  it("de-duplicates when a subtask is listed multiple times in handoffSubtaskIds", () => {
    const s1 = subtask("subtask_a");
    const result = getSubChainRootSubtasks([s1], ["subtask_a", "subtask_a", "subtask_a"]);
    expect(result).toEqual([s1]);
  });
});

// ---------------------------------------------------------------------------
// Schema / format regex consistency (ChainSubtaskIdSchema is reused)
// ---------------------------------------------------------------------------

describe("40E schema re-uses 40A identifier format", () => {
  it("reuses ChainSubtaskIdSchema — subtask_ prefix required", () => {
    expect(ChainSubtaskIdSchema.safeParse("not-prefixed").success).toBe(false);
    expect(ChainSubtaskIdSchema.safeParse("subtask_x").success).toBe(true);
  });
});
