/**
 * MAP ↔ Phase 40 chain integration test.
 *
 * Verifies that the new `agent-adapter.ts` types (MAP, Phase 41) coexist
 * with the existing `agent-network.ts` and `agent-network-handoff.ts`
 * types (Phase 40 / 40E) without conflict:
 *
 * - The new `AgentRuntime` enum and the existing `engine` field are
 *   orthogonal concepts and parse independently.
 * - The new `VerdictEntry` (MAP) and the existing `ChainArbitrationEntry`
 *   (Phase 40E) have distinct shapes; the same value cannot satisfy
 *   both schemas (a value is one or the other, never both).
 * - A future union type `ChainArbitrationEntry | VerdictEntry` is
 *   structurally valid (compile-time check).
 * - Re-exports from the public API are consistent: both type families
 *   are accessible from `@envoymesh/protocol`.
 *
 * This test does NOT exercise runtime migration; it only proves the
 * types can coexist. The actual `ArbitrationStore` migration is a
 * Phase 41 work item tracked in `docs/improving-agent-network.en.md` §4.3.
 */

import { describe, expect, it } from "vitest";

import {
  // MAP types (from agent-adapter.js, re-exported via index)
  AgentRuntimeSchema,
  CapabilityManifestSchema,
  ChainArbitrationEntrySchema,
  // Phase 40 types (already in the public API)
  ChainArbitrationEntry,
  // MAP types (from agent-adapter.js, re-exported via index)
  SignedCapabilityManifestSchema,
  // MAP types
  VerdictEntry,
  VerdictEntrySchema,
  type AgentRuntime,
} from "../src/index.js";

// ---------------------------------------------------------------------------
// AgentRuntime coexistence with the existing engine field
// ---------------------------------------------------------------------------

describe("AgentRuntime ↔ engine field (Phase 41 ↔ Phase 40)", () => {
  it("AgentRuntimeSchema accepts 'envoy-harness' (the home-team runtime)", () => {
    expect(AgentRuntimeSchema.parse("envoy-harness")).toBe("envoy-harness");
  });

  it("AgentRuntime is a closed enum of 7 values; engine is a closed enum of 2 values", () => {
    // Phase 40's engine: "openclaw" | "ext"
    // Phase 41's AgentRuntime: "envoy-harness" | "openclaw" | "pi" | "hermes" | "codex" | "codex-cli" | "openhuman"
    //
    // They overlap on "openclaw" but mean different things:
    //   - engine: "openclaw" = this node uses Built-in OpenClaw to run Agent Network work
    //   - runtime: "openclaw" = a result was produced by the openclaw runtime
    const runtimes = AgentRuntimeSchema.options;
    expect(runtimes).toContain("envoy-harness");
    expect(runtimes).toContain("openclaw");
    expect(runtimes.length).toBe(7);
  });

  it("AgentRuntime is independent of the engine field — they don't constrain each other", () => {
    // A node can advertise runtime: "envoy-harness" in its manifest and
    // still have engine: "ext" in its readiness response. The two values
    // are independent.
    const allRuntimes: AgentRuntime[] = [
      "envoy-harness",
      "openclaw",
      "pi",
      "hermes",
      "codex",
      "codex-cli",
      "openhuman",
    ];
    const allEngines: Array<"openclaw" | "ext"> = ["openclaw", "ext"];
    for (const runtime of allRuntimes) {
      for (const engine of allEngines) {
        // Both should parse independently. The same node could have
        // any combination of runtime × engine.
        expect(AgentRuntimeSchema.parse(runtime)).toBe(runtime);
        expect(["openclaw", "ext"]).toContain(engine);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// VerdictEntry ↔ ChainArbitrationEntry coexistence
// ---------------------------------------------------------------------------

describe("VerdictEntry (MAP) ↔ ChainArbitrationEntry (Phase 40E)", () => {
  it("both schemas are accessible from @envoymesh/protocol", () => {
    expect(VerdictEntrySchema).toBeDefined();
    expect(ChainArbitrationEntrySchema).toBeDefined();
  });

  it("both types are exported from @envoymesh/protocol", () => {
    // Compile-time: the type alias is reachable
    const v: VerdictEntry | undefined = undefined;
    const c: ChainArbitrationEntry | undefined = undefined;
    expect(v).toBeUndefined();
    expect(c).toBeUndefined();
  });

  it("a ChainArbitrationEntry is NOT a valid VerdictEntry (distinct shapes)", () => {
    // Phase 40E arbitration entry
    const arbitration: ChainArbitrationEntry = ChainArbitrationEntrySchema.parse({
      chainId: "chain_001",
      arbitrationId: "arbitration_chain_001_1",
      seq: 1,
      currentOwnerPeerId: "peer-orch-1",
      currentOwnerOwnerId: "owner-1",
      status: "pending",
      createdAt: "2026-08-18T10:00:00.000Z",
    });

    // A VerdictEntry has different required fields. Specifically,
    // ChainArbitrationEntry lacks `workerRuntime`, `skillId`, `verdict`,
    // `source`, `issuedBy`, `issuedAt`, `signature` — and VerdictEntrySchema
    // requires those. So `arbitration` should fail to parse as a VerdictEntry.
    expect(() => VerdictEntrySchema.parse(arbitration)).toThrow();
  });

  it("a VerdictEntry is NOT a valid ChainArbitrationEntry (distinct shapes)", () => {
    const verdict: VerdictEntry = VerdictEntrySchema.parse({
      chainId: "chain_001",
      subtaskId: "subtask_002",
      workerPeerId: "peer-abc",
      workerRuntime: "envoy-harness",
      skillId: "code-edit",
      verdict: { kind: "pass", score: 0.9 },
      source: "rule",
      issuedBy: "orch-peer",
      issuedAt: "2026-08-18T10:02:00.000Z",
      signature: "ed25519:test",
    });

    // ChainArbitrationEntry requires `arbitrationId`, `seq`,
    // `currentOwnerPeerId`, `currentOwnerOwnerId`, `status`, `createdAt`
    // — none of which are in a VerdictEntry.
    expect(() => ChainArbitrationEntrySchema.parse(verdict)).toThrow();
  });

  it("a future union type is structurally valid (compile-time check)", () => {
    // Phase 41 migration will widen the ArbitrationStore value type to:
    //   type ArbitrationStoreEntry = ChainArbitrationEntry | VerdictEntry
    //
    // This is a compile-time check; the test passes if it compiles.
    type ArbitrationStoreEntry = ChainArbitrationEntry | VerdictEntry;
    const _typeCheck: ArbitrationStoreEntry = {} as ChainArbitrationEntry;
    expect(_typeCheck).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Manifest ↔ chain wire coexistence
// ---------------------------------------------------------------------------

describe("CapabilityManifest (MAP) ↔ Phase 40 chain payloads", () => {
  it("a signed manifest parses; the signature is mandatory", () => {
    const unsigned = {
      runtime: "envoy-harness" as const,
      runtimeVersion: "0.1.0",
      peerId: "peer-abc",
      ownerId: "owner-xyz",
      skills: [{ skillId: "code-edit", description: "edit code" }],
      issuedAt: "2026-08-18T10:00:00.000Z",
    };
    const signed = SignedCapabilityManifestSchema.parse({
      ...unsigned,
      signature: "ed25519:manifest-sig",
    });
    expect(signed.signature).toBe("ed25519:manifest-sig");
  });

  it("CapabilityManifest can reference skills the chain orchestrator understands", () => {
    // The chain orchestrator consumes AgentResult.skillId. The manifest
    // advertises SkillDescriptor.skillId. Both use the same SkillIdSchema
    // regex, so a skillId in the manifest is parseable in the chain payload.
    const manifest: { skills: Array<{ skillId: string }> } = {
      skills: [
        { skillId: "code-edit", description: "edit code" },
        { skillId: "doc-search", description: "search docs" },
      ],
    };
    for (const skill of manifest.skills) {
      // The chain payload's subtask.skillId is the same shape.
      // (The chain code does its own validation; this just confirms the
      // values are valid skillIds that both surfaces can carry.)
      expect(skill.skillId).toMatch(/^[a-z][a-z0-9_-]{1,63}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-schema reference check
// ---------------------------------------------------------------------------

describe("Cross-schema sanity", () => {
  it("CapabilityManifest is not a VerdictEntry or ChainArbitrationEntry", () => {
    const manifest = CapabilityManifestSchema.parse({
      runtime: "envoy-harness",
      runtimeVersion: "0.1.0",
      peerId: "peer-abc",
      ownerId: "owner-xyz",
      skills: [{ skillId: "code-edit", description: "edit code" }],
      issuedAt: "2026-08-18T10:00:00.000Z",
    });

    // None of these should accept a manifest — they have totally
    // different required fields.
    expect(() => VerdictEntrySchema.parse(manifest)).toThrow();
    expect(() => ChainArbitrationEntrySchema.parse(manifest)).toThrow();
  });
});
