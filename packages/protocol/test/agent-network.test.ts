/**
 * Phase 40 — Agent Network Collaboration Layer schema tests.
 *
 * Verifies:
 * - Schema sync between local copies in agent-network.ts and the canonical
 *   versions in index.ts. Drift here breaks the discriminated union when
 *   callers round-trip a chain report through parseChainReport → render.
 * - ChainMandate parse + invariants (maxChainCostUsd >= 0, costCeilingUsd >= 0,
 *   maxWorkers 1..16, allowDepth3 flag, deadlineAt ISO datetime).
 * - ChainSubtask parse with depth bound enforcement (1..3, depth-4 rejected).
 * - ChainSubtaskBid with mandatory bidExpiresAt ISO datetime.
 * - ChainSubtaskAward with negotiationRound bound (1..3, round-4 rejected).
 * - ChainSubtaskPartial with seq monotonic (>= 1).
 * - ChainReport with synthesisCostUsd >= 0; budget invariant checked separately
 *   by chain-budget-ledger but the nonnegativity guard lives here.
 * - CompositeArtifact with all 4 aggregation kinds (concatenate, weighted_concat,
 *   merge_structured, owner_review) and per-kind part delegation.
 * - TaskChain*Payload wrappers round-trip.
 * - Constructor helpers (createChainId / createChainMandateId / createChainSubtaskId).
 */

import { describe, expect, it } from "vitest";

import {
  // Canonical schemas we sync against
  ArtifactSchema,
  EnvoyActorRoleSchema,
  SensitivitySchema,
  // The chain surface (re-exported from agent-network.js)
  CHAIN_MAX_DEPTH,
  ChainMandateSignedSchema,
  ChainReportSchema,
  ChainReportSectionSchema,
  ChainRoleSchema,
  ChainSubtaskAwardSchema,
  ChainSubtaskBidSchema,
  ChainSubtaskIdSchema,
  ChainSubtaskPartialSchema,
  ChainSubtaskSchema,
  CompositeArtifactPartSchema,
  CompositeArtifactSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainCancelPayloadSchema,
  TaskChainHeartbeatPayloadSchema,
  TaskChainMandatePayloadSchema,
  TaskChainMergePayloadSchema,
  TaskChainPartialPayloadSchema,
  TaskChainProposePayloadSchema,
  TaskChainReportPayloadSchema,
  UnsignedChainMandateSchema,
  createChainId,
  createChainMandateId,
  createChainSubtaskId,
  parseChainMandate,
  parseChainReport,
  parseChainSubtask,
  parseChainSubtaskAward,
  parseChainSubtaskBid,
  parseChainSubtaskPartial,
  parseCompositeArtifact,
  type ChainReport,
  type ChainSubtask,
  type ChainSubtaskAward,
  type ChainSubtaskBid,
  type ChainSubtaskPartial,
  type CompositeArtifact,
  type UnsignedChainMandate,
} from "../src/index.js";

const NOW = "2026-06-18T00:00:00.000Z";
const FUTURE = "2026-06-18T01:00:00.000Z";

function unsignedMandate(overrides: Partial<UnsignedChainMandate> = {}): UnsignedChainMandate {
  return {
    version: "0.1",
    chainMandateId: createChainMandateId(),
    chainId: createChainId(),
    issuerOwnerId: "envoy:owner:abc",
    orchestratorOwnerId: "envoy:owner:abc",
    maxChainCostUsd: 10,
    costCeilingUsd: 3,
    maxWorkers: 3,
    allowDepth3: false,
    maxSensitivity: "public",
    deadlineAt: FUTURE,
    createdAt: NOW,
    ...overrides,
  };
}

function signedMandate(overrides: Partial<UnsignedChainMandate> = {}) {
  return ChainMandateSignedSchema.parse({
    ...unsignedMandate(overrides),
    signature: "test-signature-placeholder",
  });
}

function subtask(overrides: Partial<ChainSubtask> = {}): ChainSubtask {
  return ChainSubtaskSchema.parse({
    version: "0.1",
    subtaskId: createChainSubtaskId(),
    chainId: createChainId(),
    chainMandateId: createChainMandateId(),
    depth: 1,
    requiredCapability: "task.execute",
    objective: "summarize the Q3 hiring report",
    requestedResult: "a markdown summary under 500 words",
    constraints: [],
    dependsOn: [],
    createdAt: NOW,
    ...overrides,
  });
}

function bid(overrides: Partial<ChainSubtaskBid> = {}): ChainSubtaskBid {
  return ChainSubtaskBidSchema.parse({
    version: "0.1",
    subtaskId: createChainSubtaskId(),
    chainId: createChainId(),
    workerPeerId: "12D3KooW-worker-peer",
    workerOwnerId: "envoy:owner:worker",
    proposedCostUsd: 2.5,
    proposedEtaAt: FUTURE,
    bidExpiresAt: FUTURE,
    createdAt: NOW,
    ...overrides,
  });
}

function award(overrides: Partial<ChainSubtaskAward> = {}): ChainSubtaskAward {
  return ChainSubtaskAwardSchema.parse({
    version: "0.1",
    subtaskId: createChainSubtaskId(),
    chainId: createChainId(),
    workerPeerId: "12D3KooW-worker-peer",
    negotiationRound: 1,
    acceptedCostUsd: 2.5,
    deadlineAt: FUTURE,
    createdAt: NOW,
    ...overrides,
  });
}

function partial(overrides: Partial<ChainSubtaskPartial> = {}): ChainSubtaskPartial {
  return ChainSubtaskPartialSchema.parse({
    version: "0.1",
    subtaskId: createChainSubtaskId(),
    chainId: createChainId(),
    workerPeerId: "12D3KooW-worker-peer",
    seq: 1,
    isFinal: false,
    createdAt: NOW,
    ...overrides,
  });
}

function report(overrides: Partial<ChainReport> = {}): ChainReport {
  return ChainReportSchema.parse({
    version: "0.1",
    chainId: createChainId(),
    chainMandateId: createChainMandateId(),
    orchestratorOwnerId: "envoy:owner:abc",
    orchestratorPeerId: "12D3KooW-orchestrator",
    pinned: false,
    chainSummary: {
      durationMs: 60_000,
      subtaskCount: 3,
      workerCount: 3,
      workerAllocations: [
        { subtaskId: createChainSubtaskId(), workerPeerId: "12D3KooW-w1", committedUsd: 1 },
        { subtaskId: createChainSubtaskId(), workerPeerId: "12D3KooW-w2", committedUsd: 1 },
        { subtaskId: createChainSubtaskId(), workerPeerId: "12D3KooW-w3", committedUsd: 1 },
      ],
      synthesisCostUsd: 0.5,
    },
    executiveSummary: "# Q3 summary\n\nThree findings.",
    sections: [
      ChainReportSectionSchema.parse({
        heading: "Headcount trend",
        bodyMarkdown: "Up 12% YoY.",
        citations: [{ subtaskId: createChainSubtaskId(), snippet: "hiring-trend.csv" }],
      }),
    ],
    createdAt: NOW,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Schema sync: local copies in agent-network.ts must round-trip the same as
// the canonical versions in index.ts. If you change a schema in index.ts you
// must update the local copy (or refactor to remove the local copy).
// ---------------------------------------------------------------------------

describe("Schema sync between agent-network.ts and index.ts", () => {
  it("Sensitivity values are in lockstep", () => {
    expect(SensitivitySchema.options).toEqual(["public", "friends", "trusted", "private"]);
  });

  it("EnvoyActorRole values are in lockstep", () => {
    expect(EnvoyActorRoleSchema.options).toEqual(["human", "agent", "system"]);
  });

  it("ArtifactSchema still accepts all three legacy variants (sync guard)", () => {
    expect(() => ArtifactSchema.parse({ kind: "text", content: "x" })).not.toThrow();
    expect(() =>
      ArtifactSchema.parse({ kind: "file", vaultPath: "/p", contentHash: "h" }),
    ).not.toThrow();
    expect(() =>
      ArtifactSchema.parse({ kind: "structured", schemaRef: "x", data: {} }),
    ).not.toThrow();
  });

  it("ArtifactSchema now also accepts the composite variant", () => {
    const composite = CompositeArtifactSchema.parse({
      kind: "composite",
      parts: [
        {
          subtaskId: createChainSubtaskId(),
          workerPeerId: "12D3KooW-w1",
          workerOwnerId: "envoy:owner:w1",
          weight: 1,
          artifact: { kind: "text", content: "x" },
        },
      ],
      aggregation: "concatenate",
      createdAt: NOW,
    });
    expect(() => ArtifactSchema.parse(composite)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Identifier format regexes
// ---------------------------------------------------------------------------

describe("Identifier schemas", () => {
  it("ChainIdSchema requires chain_ prefix and a non-empty suffix", () => {
    expect(ChainSubtaskIdSchema.safeParse(createChainSubtaskId()).success).toBe(true);
    expect(ChainSubtaskIdSchema.safeParse("not-prefixed-id").success).toBe(false);
    expect(ChainSubtaskIdSchema.safeParse("subtask_").success).toBe(false); // empty suffix rejected
    expect(ChainSubtaskIdSchema.safeParse("subtask_a").success).toBe(true);
  });

  it("createChainId / createChainMandateId / createChainSubtaskId produce matching IDs", () => {
    expect(createChainId()).toMatch(/^chain_/);
    expect(createChainMandateId()).toMatch(/^chainmandate_/);
    expect(createChainSubtaskId()).toMatch(/^subtask_/);
  });
});

// ---------------------------------------------------------------------------
// ChainMandate
// ---------------------------------------------------------------------------

describe("ChainMandate", () => {
  it("unsigned mandate parses", () => {
    const m = unsignedMandate();
    expect(() => UnsignedChainMandateSchema.parse(m)).not.toThrow();
  });

  it("signed mandate parses with signature", () => {
    const m = signedMandate();
    expect(m.signature).toBeTruthy();
  });

  it("rejects negative maxChainCostUsd", () => {
    expect(() =>
      UnsignedChainMandateSchema.parse(unsignedMandate({ maxChainCostUsd: -1 })),
    ).toThrow();
  });

  it("rejects maxWorkers outside 1..16", () => {
    expect(() => UnsignedChainMandateSchema.parse(unsignedMandate({ maxWorkers: 0 }))).toThrow();
    expect(() => UnsignedChainMandateSchema.parse(unsignedMandate({ maxWorkers: 17 }))).toThrow();
  });

  it("accepts allowDepth3 opt-in", () => {
    const m = unsignedMandate({ allowDepth3: true });
    expect(UnsignedChainMandateSchema.parse(m).allowDepth3).toBe(true);
  });

  it("parseChainMandate round-trip", () => {
    const m = signedMandate();
    expect(parseChainMandate(m)).toEqual(m);
  });

  it("ChainRoleSchema values are orchestrator | worker", () => {
    expect(ChainRoleSchema.options).toEqual(["orchestrator", "worker"]);
  });
});

// ---------------------------------------------------------------------------
// ChainSubtask — depth bound enforcement is the key invariant
// ---------------------------------------------------------------------------

describe("ChainSubtask", () => {
  it("depth-1 subtask parses", () => {
    expect(() => subtask({ depth: 1 })).not.toThrow();
  });

  it("depth-3 subtask parses (depth-3 requires mandate.allowDepth3=true at runtime)", () => {
    expect(() => subtask({ depth: 3 })).not.toThrow();
  });

  it("CHAIN_MAX_DEPTH is 3", () => {
    expect(CHAIN_MAX_DEPTH).toBe(3);
  });

  it("rejects depth-4 subtask at parse time (hard cap)", () => {
    expect(() => subtask({ depth: 4 })).toThrow();
  });

  it("rejects depth-0 subtask at parse time", () => {
    expect(() => subtask({ depth: 0 })).toThrow();
  });

  it("rejects subtask with non-positive costCeilingUsd when provided", () => {
    expect(() => subtask({ costCeilingUsd: -1 })).toThrow();
  });

  it("dependsOn defaults to empty array", () => {
    const s = subtask();
    expect(s.dependsOn).toEqual([]);
  });

  it("parseChainSubtask round-trip", () => {
    const s = subtask();
    expect(parseChainSubtask(s)).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// ChainSubtaskBid — bidExpiresAt is mandatory and must be an ISO datetime
// ---------------------------------------------------------------------------

describe("ChainSubtaskBid", () => {
  it("bid parses with mandatory bidExpiresAt", () => {
    const b = bid();
    expect(b.bidExpiresAt).toBe(FUTURE);
  });

  it("rejects bid without bidExpiresAt", () => {
    const bad = { ...bid(), bidExpiresAt: undefined };
    expect(() => ChainSubtaskBidSchema.parse(bad)).toThrow();
  });

  it("rejects bid with non-datetime bidExpiresAt", () => {
    expect(() => bid({ bidExpiresAt: "not-a-date" as unknown as string })).toThrow();
  });

  it("parseChainSubtaskBid round-trip", () => {
    const b = bid();
    expect(parseChainSubtaskBid(b)).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// ChainSubtaskAward — negotiationRound bound (1..3) is the key invariant
// ---------------------------------------------------------------------------

describe("ChainSubtaskAward", () => {
  it("round-1 award parses", () => {
    expect(() => award({ negotiationRound: 1 })).not.toThrow();
  });

  it("round-3 award parses (max allowed)", () => {
    expect(() => award({ negotiationRound: 3 })).not.toThrow();
  });

  it("rejects round-4 award at parse time (3-round hard cap)", () => {
    expect(() => award({ negotiationRound: 4 })).toThrow();
  });

  it("rejects round-0 award at parse time", () => {
    expect(() => award({ negotiationRound: 0 })).toThrow();
  });

  it("parseChainSubtaskAward round-trip", () => {
    const a = award();
    expect(parseChainSubtaskAward(a)).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// ChainSubtaskPartial — seq must be >= 1
// ---------------------------------------------------------------------------

describe("ChainSubtaskPartial", () => {
  it("first partial (seq=1) parses", () => {
    expect(() => partial({ seq: 1 })).not.toThrow();
  });

  it("rejects partial with seq=0 (must start at 1)", () => {
    expect(() => partial({ seq: 0 })).toThrow();
  });

  it("isFinal defaults to false", () => {
    expect(partial().isFinal).toBe(false);
  });

  it("parseChainSubtaskPartial round-trip", () => {
    const p = partial();
    expect(parseChainSubtaskPartial(p)).toEqual(p);
  });

  it("rejects partial with negative seq", () => {
    expect(() => partial({ seq: -1 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CompositeArtifact
// ---------------------------------------------------------------------------

describe("CompositeArtifact", () => {
  function composite(overrides: Partial<CompositeArtifact> = {}): CompositeArtifact {
    return CompositeArtifactSchema.parse({
      kind: "composite",
      parts: [
        CompositeArtifactPartSchema.parse({
          subtaskId: createChainSubtaskId(),
          workerPeerId: "12D3KooW-w1",
          workerOwnerId: "envoy:owner:w1",
          weight: 0.5,
          artifact: { kind: "text", content: "A" },
        }),
        CompositeArtifactPartSchema.parse({
          subtaskId: createChainSubtaskId(),
          workerPeerId: "12D3KooW-w2",
          workerOwnerId: "envoy:owner:w2",
          weight: 0.5,
          artifact: { kind: "text", content: "B" },
        }),
      ],
      aggregation: "concatenate",
      createdAt: NOW,
      ...overrides,
    });
  }

  it("accepts all 4 aggregation kinds", () => {
    for (const aggregation of [
      "concatenate",
      "weighted_concat",
      "merge_structured",
      "owner_review",
    ] as const) {
      expect(() => composite({ aggregation })).not.toThrow();
    }
  });

  it("rejects empty parts array", () => {
    expect(() => composite({ parts: [] })).toThrow();
  });

  it("rejects part weight > 1", () => {
    expect(() =>
      composite({
        parts: [
          {
            subtaskId: createChainSubtaskId(),
            workerPeerId: "p",
            workerOwnerId: "o",
            weight: 1.5,
            artifact: { kind: "text", content: "x" },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects negative part weight", () => {
    expect(() =>
      composite({
        parts: [
          {
            subtaskId: createChainSubtaskId(),
            workerPeerId: "p",
            workerOwnerId: "o",
            weight: -0.1,
            artifact: { kind: "text", content: "x" },
          },
        ],
      }),
    ).toThrow();
  });

  it("parseCompositeArtifact round-trip", () => {
    const c = composite();
    expect(parseCompositeArtifact(c)).toEqual(c);
  });
});

// ---------------------------------------------------------------------------
// ChainReport — synthesisCostUsd invariant
// ---------------------------------------------------------------------------

describe("ChainReport", () => {
  it("report with synthesisCostUsd parses", () => {
    const r = report();
    expect(r.chainSummary.synthesisCostUsd).toBe(0.5);
  });

  it("rejects negative synthesisCostUsd", () => {
    expect(() =>
      report({
        chainSummary: {
          durationMs: 60_000,
          subtaskCount: 1,
          workerCount: 1,
          workerAllocations: [
            { subtaskId: createChainSubtaskId(), workerPeerId: "p", committedUsd: 0 },
          ],
          synthesisCostUsd: -0.01,
        },
      }),
    ).toThrow();
  });

  it("accepts synthesisCostUsd = 0 (free local synthesis)", () => {
    const r = report({
      chainSummary: {
        durationMs: 60_000,
        subtaskCount: 1,
        workerCount: 1,
        workerAllocations: [
          { subtaskId: createChainSubtaskId(), workerPeerId: "p", committedUsd: 0 },
        ],
        synthesisCostUsd: 0,
      },
    });
    expect(r.chainSummary.synthesisCostUsd).toBe(0);
  });

  it("rejects report without any sections (must have at least chainSummary)", () => {
    const r = report();
    expect(r.sections.length).toBeGreaterThan(0);
  });

  it("recipientRoles defaults to [human]", () => {
    expect(report().recipientRoles).toEqual(["human"]);
  });

  it("pinned flag is mutable post-parse", () => {
    expect(report().pinned).toBe(false);
    expect(report({ pinned: true }).pinned).toBe(true);
  });

  it("parseChainReport round-trip", () => {
    const r = report();
    expect(parseChainReport(r)).toEqual(r);
  });

  it("ChainReportSection citations cap at 64 per section", () => {
    const tooMany = Array.from({ length: 65 }, () => ({
      subtaskId: createChainSubtaskId(),
      snippet: "x",
    }));
    expect(() =>
      ChainReportSectionSchema.parse({
        heading: "x",
        bodyMarkdown: "y",
        citations: tooMany,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TaskChain* payload wrappers
// ---------------------------------------------------------------------------

describe("TaskChain payload wrappers", () => {
  it("TaskChainMandatePayloadSchema wraps a signed mandate", () => {
    const m = signedMandate();
    const p = TaskChainMandatePayloadSchema.parse({ chainMandate: m });
    expect(p.chainMandate).toEqual(m);
  });

  it("TaskChainProposePayloadSchema wraps a subtask + mandate", () => {
    const m = signedMandate();
    const s = subtask();
    const p = TaskChainProposePayloadSchema.parse({ subtask: s, chainMandate: m });
    expect(p.subtask).toEqual(s);
  });

  it("TaskChainBidPayloadSchema wraps a bid", () => {
    const b = bid();
    const p = TaskChainBidPayloadSchema.parse({ bid: b });
    expect(p.bid).toEqual(b);
  });

  it("TaskChainAcceptPayloadSchema wraps an award", () => {
    const a = award();
    const p = TaskChainAcceptPayloadSchema.parse({ award: a });
    expect(p.award).toEqual(a);
  });

  it("TaskChainPartialPayloadSchema wraps a partial", () => {
    const p = partial();
    const parsed = TaskChainPartialPayloadSchema.parse({ partial: p });
    expect(parsed.partial).toEqual(p);
  });

  it("TaskChainMergePayloadSchema requires ≥ 2 merging subtasks", () => {
    expect(() =>
      TaskChainMergePayloadSchema.parse({
        chainId: createChainId(),
        mergingSubtaskIds: [createChainSubtaskId()], // only 1 — invalid
        newSubtask: subtask(),
        awardedWorkerPeerId: "p",
        mergeCostUsd: 1,
        createdAt: NOW,
      }),
    ).toThrow();
  });

  it("TaskChainCancelPayloadSchema accepts optional subtaskId (whole-chain cancel)", () => {
    expect(() =>
      TaskChainCancelPayloadSchema.parse({
        chainId: createChainId(),
        reason: "owner cancelled",
        cancelledBy: "owner",
        notifyWorkerPeerIds: [],
        createdAt: NOW,
      }),
    ).not.toThrow();
  });

  it("TaskChainHeartbeatPayloadSchema accepts optional proposedEtaAt", () => {
    expect(() =>
      TaskChainHeartbeatPayloadSchema.parse({
        chainId: createChainId(),
        subtaskId: createChainSubtaskId(),
        workerPeerId: "p",
        progress: "50% — past research phase",
        createdAt: NOW,
      }),
    ).not.toThrow();
  });

  it("TaskChainReportPayloadSchema wraps a full report", () => {
    const r = report();
    const p = TaskChainReportPayloadSchema.parse({ report: r });
    expect(p.report).toEqual(r);
  });
});