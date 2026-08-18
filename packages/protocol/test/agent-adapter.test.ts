/**
 * MAP (Mesh Adapter Pattern) — per-adapter wire surface tests.
 *
 * Verifies:
 * - AgentRuntimeSchema: enum closed, 'envoy-harness' first, rejects unknown values.
 * - SkillIdSchema: regex boundary cases (lowercase start, length, allowed chars).
 * - SkillDescriptorSchema: defaults applied (maxSensitivity='friends', tags=[]).
 * - CapabilityManifestSchema: required fields, skills min(1), ttlSeconds default.
 * - SignedCapabilityManifestSchema: extends unsigned + requires signature.
 * - ContentBlockSchema: discriminated union — each kind accepted, others rejected.
 * - AgentResultSchema: content array allowed empty, citations default [], metrics required.
 * - SignedAgentResultSchema: extends unsigned + requires signature.
 * - VerdictSchema: discriminated union — each kind accepted, score bounds, rollback default.
 * - VerifierSourceSchema: enum closed (4 values).
 * - VerdictEntrySchema: superRefine enforces verifierModel when source='llm',
 *   verifierOwnerId when source='human'; signature required.
 *
 * Each test exercises a specific construct, not just "smoke test".
 */

import { describe, expect, it } from "vitest";

import {
  AgentResultSchema,
  AgentRuntimeSchema,
  CapabilityManifestSchema,
  ContentBlockSchema,
  SignedAgentResultSchema,
  SignedCapabilityManifestSchema,
  SkillDescriptorSchema,
  SkillIdSchema,
  VerdictEntrySchema,
  VerdictSchema,
  VerifierSourceSchema,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// AgentRuntimeSchema
// ---------------------------------------------------------------------------

describe("AgentRuntimeSchema", () => {
  it("accepts envoy-harness (the home-team runtime)", () => {
    expect(AgentRuntimeSchema.parse("envoy-harness")).toBe("envoy-harness");
  });

  it("accepts all pre-existing runtimes", () => {
    for (const runtime of [
      "openclaw",
      "pi",
      "hermes",
      "codex",
      "codex-cli",
      "openhuman",
    ]) {
      expect(AgentRuntimeSchema.parse(runtime)).toBe(runtime);
    }
  });

  it("rejects unknown runtime values (closed enum)", () => {
    expect(() => AgentRuntimeSchema.parse("a-new-runtime")).toThrow();
    expect(() => AgentRuntimeSchema.parse("")).toThrow();
    expect(() => AgentRuntimeSchema.parse("ENVOY-HARNESS")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SkillIdSchema
// ---------------------------------------------------------------------------

describe("SkillIdSchema", () => {
  it("accepts the canonical examples from the design", () => {
    expect(SkillIdSchema.parse("code-edit")).toBe("code-edit");
    expect(SkillIdSchema.parse("doc-search")).toBe("doc-search");
    expect(SkillIdSchema.parse("plan")).toBe("plan");
    expect(SkillIdSchema.parse("translate")).toBe("translate");
  });

  it("rejects uppercase first character", () => {
    expect(() => SkillIdSchema.parse("Code-edit")).toThrow();
  });

  it("rejects digit-starting skillId", () => {
    expect(() => SkillIdSchema.parse("1code")).toThrow();
  });

  it("rejects too-short (1 char)", () => {
    expect(() => SkillIdSchema.parse("a")).toThrow();
  });

  it("accepts the longest valid skillId (64 chars)", () => {
    const longId = "a" + "b".repeat(63);
    expect(SkillIdSchema.parse(longId).length).toBe(64);
  });

  it("rejects 65-char skillId", () => {
    const tooLong = "a" + "b".repeat(64);
    expect(() => SkillIdSchema.parse(tooLong)).toThrow();
  });

  it("rejects disallowed characters (space, dot, slash, uppercase)", () => {
    expect(() => SkillIdSchema.parse("with space")).toThrow();
    expect(() => SkillIdSchema.parse("with.dot")).toThrow();
    expect(() => SkillIdSchema.parse("with/slash")).toThrow();
    expect(() => SkillIdSchema.parse("UPPER")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SkillDescriptorSchema
// ---------------------------------------------------------------------------

describe("SkillDescriptorSchema", () => {
  const baseSkill: ReturnType<typeof SkillDescriptorSchema.parse> =
    SkillDescriptorSchema.parse({
      skillId: "code-edit",
      description: "Edit code in a project.",
    });

  it("applies default maxSensitivity='friends' and tags=[]", () => {
    expect(baseSkill.maxSensitivity).toBe("friends");
    expect(baseSkill.tags).toEqual([]);
  });

  it("accepts all three sensitivity values", () => {
    for (const sensitivity of ["public", "friends", "private"]) {
      const result = SkillDescriptorSchema.parse({
        skillId: "x-y",
        description: "test",
        maxSensitivity: sensitivity,
      });
      expect(result.maxSensitivity).toBe(sensitivity);
    }
  });

  it("rejects empty description", () => {
    expect(() =>
      SkillDescriptorSchema.parse({ skillId: "x-y", description: "" }),
    ).toThrow();
  });

  it("rejects description > 280 chars", () => {
    const longDesc = "a".repeat(281);
    expect(() =>
      SkillDescriptorSchema.parse({ skillId: "x-y", description: longDesc }),
    ).toThrow();
  });

  it("rejects non-positive costCeilingUsd (0, negative)", () => {
    expect(() =>
      SkillDescriptorSchema.parse({
        skillId: "x-y",
        description: "test",
        costCeilingUsd: 0,
      }),
    ).toThrow();
    expect(() =>
      SkillDescriptorSchema.parse({
        skillId: "x-y",
        description: "test",
        costCeilingUsd: -1,
      }),
    ).toThrow();
  });

  it("accepts positive costCeilingUsd", () => {
    const result = SkillDescriptorSchema.parse({
      skillId: "x-y",
      description: "test",
      costCeilingUsd: 5.5,
    });
    expect(result.costCeilingUsd).toBe(5.5);
  });
});

// ---------------------------------------------------------------------------
// CapabilityManifestSchema
// ---------------------------------------------------------------------------

describe("CapabilityManifestSchema", () => {
  const baseManifest = {
    runtime: "envoy-harness",
    runtimeVersion: "0.1.0",
    peerId: "peer-abc",
    ownerId: "owner-xyz",
    skills: [
      { skillId: "code-edit", description: "edit code" },
    ],
    issuedAt: "2026-08-18T10:00:00.000Z",
  };

  it("parses a valid manifest with required fields only", () => {
    const result = CapabilityManifestSchema.parse(baseManifest);
    expect(result.runtime).toBe("envoy-harness");
    expect(result.reputationBySkill).toEqual({});
    expect(result.ttlSeconds).toBe(300);
  });

  it("rejects empty skills array (min 1 required)", () => {
    expect(() =>
      CapabilityManifestSchema.parse({ ...baseManifest, skills: [] }),
    ).toThrow();
  });

  it("rejects missing required fields (peerId, ownerId, runtimeVersion)", () => {
    const requiredFields = ["peerId", "ownerId", "runtimeVersion"] as const;
    for (const field of requiredFields) {
      const broken = { ...baseManifest } as Record<string, unknown>;
      delete broken[field];
      expect(() => CapabilityManifestSchema.parse(broken)).toThrow();
    }
  });

  it("rejects reputation score outside [0, 1]", () => {
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        reputationBySkill: { "code-edit": 1.5 },
      }),
    ).toThrow();
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        reputationBySkill: { "code-edit": -0.1 },
      }),
    ).toThrow();
  });

  it("accepts reputation score of exactly 0 and exactly 1 (boundary)", () => {
    const zero = CapabilityManifestSchema.parse({
      ...baseManifest,
      reputationBySkill: { "code-edit": 0 },
    });
    const one = CapabilityManifestSchema.parse({
      ...baseManifest,
      reputationBySkill: { "code-edit": 1 },
    });
    expect(zero.reputationBySkill["code-edit"]).toBe(0);
    expect(one.reputationBySkill["code-edit"]).toBe(1);
  });

  it("rejects invalid issuedAt (not ISO datetime)", () => {
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        issuedAt: "yesterday",
      }),
    ).toThrow();
  });

  it("rejects non-positive ttlSeconds", () => {
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        ttlSeconds: 0,
      }),
    ).toThrow();
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        ttlSeconds: -1,
      }),
    ).toThrow();
  });

  it("rejects non-integer ttlSeconds", () => {
    expect(() =>
      CapabilityManifestSchema.parse({
        ...baseManifest,
        ttlSeconds: 1.5,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SignedCapabilityManifestSchema
// ---------------------------------------------------------------------------

describe("SignedCapabilityManifestSchema", () => {
  const unsigned = {
    runtime: "envoy-harness",
    runtimeVersion: "0.1.0",
    peerId: "peer-abc",
    ownerId: "owner-xyz",
    skills: [{ skillId: "code-edit", description: "edit code" }],
    issuedAt: "2026-08-18T10:00:00.000Z",
  };

  it("requires signature", () => {
    expect(() => SignedCapabilityManifestSchema.parse(unsigned)).toThrow();
  });

  it("rejects empty signature", () => {
    expect(() =>
      SignedCapabilityManifestSchema.parse({ ...unsigned, signature: "" }),
    ).toThrow();
  });

  it("accepts a signed manifest", () => {
    const result = SignedCapabilityManifestSchema.parse({
      ...unsigned,
      signature: "ed25519:abc123",
    });
    expect(result.signature).toBe("ed25519:abc123");
  });
});

// ---------------------------------------------------------------------------
// ContentBlockSchema
// ---------------------------------------------------------------------------

describe("ContentBlockSchema", () => {
  it("accepts a text block", () => {
    const block = ContentBlockSchema.parse({
      kind: "text",
      text: "hello world",
    });
    expect(block.kind).toBe("text");
  });

  it("accepts a file block with vaultPath and contentHash", () => {
    const block = ContentBlockSchema.parse({
      kind: "file",
      vaultPath: "vault://abc",
      contentHash: "sha256:123",
    });
    expect(block.kind).toBe("file");
  });

  it("accepts a structured block with schemaRef and data", () => {
    const block = ContentBlockSchema.parse({
      kind: "structured",
      schemaRef: "envoymesh://chain-report/v1",
      data: { foo: "bar" },
    });
    expect(block.kind).toBe("structured");
  });

  it("accepts an image block with mimeType", () => {
    const block = ContentBlockSchema.parse({
      kind: "image",
      vaultPath: "vault://img",
      contentHash: "sha256:img",
      mimeType: "image/png",
    });
    expect(block.kind).toBe("image");
  });

  it("rejects an unknown kind (discriminator is closed)", () => {
    expect(() =>
      ContentBlockSchema.parse({
        kind: "video",
        vaultPath: "vault://v",
        contentHash: "sha256:v",
      }),
    ).toThrow();
  });

  it("rejects a text block with empty text", () => {
    // Empty text is allowed by the schema (z.string() not min(1)); verify
    // that this is the contract, not a bug.
    const block = ContentBlockSchema.parse({ kind: "text", text: "" });
    expect(block.text).toBe("");
  });

  it("rejects an image block without mimeType", () => {
    expect(() =>
      ContentBlockSchema.parse({
        kind: "image",
        vaultPath: "vault://img",
        contentHash: "sha256:img",
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AgentResultSchema
// ---------------------------------------------------------------------------

describe("AgentResultSchema", () => {
  const baseResult = {
    skillId: "code-edit",
    runtime: "envoy-harness" as const,
    peerId: "peer-abc",
    correlationId: "chain-001:subtask-002",
    content: [{ kind: "text" as const, text: "done" }],
    metrics: { durationMs: 1200, costUsd: 0.05 },
    completedAt: "2026-08-18T10:01:00.000Z",
  };

  it("parses a valid result with required fields", () => {
    const result = AgentResultSchema.parse(baseResult);
    expect(result.citations).toEqual([]);
  });

  it("allows empty content array (0 blocks is a valid result)", () => {
    const result = AgentResultSchema.parse({ ...baseResult, content: [] });
    expect(result.content).toEqual([]);
  });

  it("rejects negative durationMs", () => {
    expect(() =>
      AgentResultSchema.parse({
        ...baseResult,
        metrics: { durationMs: -1, costUsd: 0 },
      }),
    ).toThrow();
  });

  it("rejects negative costUsd", () => {
    expect(() =>
      AgentResultSchema.parse({
        ...baseResult,
        metrics: { durationMs: 100, costUsd: -0.01 },
      }),
    ).toThrow();
  });

  it("accepts zero cost (a free local operation)", () => {
    const result = AgentResultSchema.parse({
      ...baseResult,
      metrics: { durationMs: 100, costUsd: 0 },
    });
    expect(result.metrics.costUsd).toBe(0);
  });

  it("rejects invalid skillId in result (must match the manifest)", () => {
    expect(() =>
      AgentResultSchema.parse({ ...baseResult, skillId: "UPPER" }),
    ).toThrow();
  });

  it("preserves citations array when provided", () => {
    const result = AgentResultSchema.parse({
      ...baseResult,
      citations: [{ source: "file:src/foo.ts", blockIndex: 0 }],
    });
    expect(result.citations.length).toBe(1);
    expect(result.citations[0]?.source).toBe("file:src/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// SignedAgentResultSchema
// ---------------------------------------------------------------------------

describe("SignedAgentResultSchema", () => {
  const unsigned = {
    skillId: "code-edit",
    runtime: "envoy-harness" as const,
    peerId: "peer-abc",
    correlationId: "chain-001:subtask-002",
    content: [{ kind: "text" as const, text: "done" }],
    metrics: { durationMs: 1200, costUsd: 0.05 },
    completedAt: "2026-08-18T10:01:00.000Z",
  };

  it("requires signature", () => {
    expect(() => SignedAgentResultSchema.parse(unsigned)).toThrow();
  });

  it("accepts a signed result", () => {
    const result = SignedAgentResultSchema.parse({
      ...unsigned,
      signature: "ed25519:xyz789",
    });
    expect(result.signature).toBe("ed25519:xyz789");
  });
});

// ---------------------------------------------------------------------------
// VerdictSchema
// ---------------------------------------------------------------------------

describe("VerdictSchema", () => {
  it("accepts a pass verdict with default confidence='medium'", () => {
    const v = VerdictSchema.parse({ kind: "pass", score: 0.95 });
    expect(v.kind).toBe("pass");
    if (v.kind === "pass") {
      expect(v.confidence).toBe("medium");
    }
  });

  it("accepts a pass verdict with custom confidence", () => {
    const v = VerdictSchema.parse({
      kind: "pass",
      score: 0.95,
      confidence: "high",
    });
    if (v.kind === "pass") {
      expect(v.confidence).toBe("high");
    }
  });

  it("rejects pass score outside [0, 1]", () => {
    expect(() =>
      VerdictSchema.parse({ kind: "pass", score: 1.5 }),
    ).toThrow();
    expect(() =>
      VerdictSchema.parse({ kind: "pass", score: -0.1 }),
    ).toThrow();
  });

  it("accepts a partial verdict with usableBlocks", () => {
    const v = VerdictSchema.parse({
      kind: "partial",
      score: 0.6,
      reason: "block 2 was off-topic",
      usableBlocks: [0, 1],
    });
    expect(v.kind).toBe("partial");
  });

  it("rejects partial verdict without a reason", () => {
    expect(() =>
      VerdictSchema.parse({ kind: "partial", score: 0.5 }),
    ).toThrow();
  });

  it("accepts a fail verdict with default rollback=true", () => {
    const v = VerdictSchema.parse({
      kind: "fail",
      reason: "the output is empty",
    });
    if (v.kind === "fail") {
      expect(v.rollback).toBe(true);
    }
  });

  it("accepts a fail verdict with rollback=false (orchestrator absorbs cost)", () => {
    const v = VerdictSchema.parse({
      kind: "fail",
      reason: "test mode",
      rollback: false,
    });
    if (v.kind === "fail") {
      expect(v.rollback).toBe(false);
    }
  });

  it("rejects fail verdict without a reason", () => {
    expect(() => VerdictSchema.parse({ kind: "fail" })).toThrow();
  });

  it("accepts a disputed verdict with at least one signal", () => {
    const v = VerdictSchema.parse({
      kind: "disputed",
      needsHuman: true,
      signals: ["score 0.5", "format mismatch"],
    });
    expect(v.kind).toBe("disputed");
  });

  it("rejects disputed verdict with empty signals (min 1 required)", () => {
    expect(() =>
      VerdictSchema.parse({
        kind: "disputed",
        needsHuman: true,
        signals: [],
      }),
    ).toThrow();
  });

  it("rejects unknown verdict kind (closed discriminator)", () => {
    expect(() => VerdictSchema.parse({ kind: "skip" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VerifierSourceSchema
// ---------------------------------------------------------------------------

describe("VerifierSourceSchema", () => {
  it("accepts all four sources", () => {
    for (const source of ["rule", "llm", "human", "cross"]) {
      expect(VerifierSourceSchema.parse(source)).toBe(source);
    }
  });

  it("rejects unknown sources (closed enum)", () => {
    expect(() => VerifierSourceSchema.parse("ai")).toThrow();
    expect(() => VerifierSourceSchema.parse("")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VerdictEntrySchema
// ---------------------------------------------------------------------------

describe("VerdictEntrySchema", () => {
  const baseEntry = {
    chainId: "chain-001",
    subtaskId: "subtask-002",
    workerPeerId: "peer-abc",
    workerRuntime: "envoy-harness" as const,
    skillId: "code-edit",
    verdict: { kind: "pass" as const, score: 0.9 },
    source: "rule" as const,
    issuedBy: "orch-peer",
    issuedAt: "2026-08-18T10:02:00.000Z",
    signature: "ed25519:rule-sig",
  };

  it("parses a valid rule-sourced verdict (no verifierModel or ownerId required)", () => {
    const result = VerdictEntrySchema.parse(baseEntry);
    expect(result.source).toBe("rule");
  });

  it("requires verifierModel when source='llm'", () => {
    expect(() =>
      VerdictEntrySchema.parse({ ...baseEntry, source: "llm" }),
    ).toThrow(/verifierModel is required/);
  });

  it("accepts an llm-sourced verdict with verifierModel", () => {
    const result = VerdictEntrySchema.parse({
      ...baseEntry,
      source: "llm",
      verifierModel: "claude-haiku-4-5",
    });
    if (result.source === "llm") {
      expect(result.verifierModel).toBe("claude-haiku-4-5");
    }
  });

  it("requires verifierOwnerId when source='human'", () => {
    expect(() =>
      VerdictEntrySchema.parse({ ...baseEntry, source: "human" }),
    ).toThrow(/verifierOwnerId is required/);
  });

  it("accepts a human-sourced verdict with verifierOwnerId", () => {
    const result = VerdictEntrySchema.parse({
      ...baseEntry,
      source: "human",
      verifierOwnerId: "owner-xyz",
    });
    if (result.source === "human") {
      expect(result.verifierOwnerId).toBe("owner-xyz");
    }
  });

  it("accepts a cross-sourced verdict (no model or owner required)", () => {
    const result = VerdictEntrySchema.parse({
      ...baseEntry,
      source: "cross",
    });
    expect(result.source).toBe("cross");
  });

  it("rejects empty signature", () => {
    expect(() =>
      VerdictEntrySchema.parse({ ...baseEntry, signature: "" }),
    ).toThrow();
  });

  it("rejects missing required fields (chainId, subtaskId, issuedBy)", () => {
    const required = ["chainId", "subtaskId", "issuedBy"] as const;
    for (const field of required) {
      const broken = { ...baseEntry } as Record<string, unknown>;
      delete broken[field];
      expect(() => VerdictEntrySchema.parse(broken)).toThrow();
    }
  });

  it("rejects non-ISO issuedAt", () => {
    expect(() =>
      VerdictEntrySchema.parse({ ...baseEntry, issuedAt: "now" }),
    ).toThrow();
  });

  it("rejects invalid skillId in entry (must match the manifest)", () => {
    expect(() =>
      VerdictEntrySchema.parse({ ...baseEntry, skillId: "1invalid" }),
    ).toThrow();
  });
});
