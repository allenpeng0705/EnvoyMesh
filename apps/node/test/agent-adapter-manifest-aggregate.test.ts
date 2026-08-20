/**
 * Phase 8 Step 4 — unit tests for the
 * `aggregateNodeManifest` function.
 *
 * **Acceptance (per `docs/agent-harness-integration-step4.md` §3.4):**
 * 1. Empty input (no adapters) → empty manifest
 * 2. Single adapter → manifest with that adapter's
 *    skills, tagged with its runtime
 * 3. Two adapters (envoy-harness + OpenClaw) →
 *    manifest with the union of skills, each tagged
 *    with its runtime
 * 4. `SkillId` collision → throws
 *    `SkillIdCollisionError`
 * 5. `runtimeVersion` is `"unknown"` for v0
 * 6. `tags` + `costCeilingUsd` are preserved
 * 7. `maxSensitivity` is preserved
 * 8. Order of skills is preserved (insertion order)
 *
 * **Why these tests are hermetic:** the aggregator
 * is a pure function (no I/O, no `process.env`, no
 * global state). Tests construct fake `AgentAdapter`
 * instances inline; no need to set up a real
 * `NodeServiceImpl`.
 */

import { describe, expect, it } from "vitest";
import type {
  AgentRuntime,
  SkillDescriptor,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";
import {
  aggregateNodeManifest,
  SkillIdCollisionError,
  type MergedSkillEntry,
} from "../src/agent-adapter-manifest-aggregate.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal `AgentAdapter` for testing. The
 * aggregator only calls `describeSkills()` and reads
 * `runtime`; other methods are stubs that throw if
 * invoked (the aggregator must not call them).
 */
function makeFakeAdapter(input: {
  runtime: AgentRuntime;
  skills: ReadonlyArray<SkillDescriptor>;
}): AgentAdapter {
  return {
    runtime: input.runtime,
    describeSkills: () => input.skills as SkillDescriptor[],
    buildManifest: () => {
      throw new Error(
        `buildManifest must not be called by aggregateNodeManifest ` +
          `(adapter runtime: ${input.runtime})`,
      );
    },
    execute: () => {
      throw new Error(
        `execute must not be called by aggregateNodeManifest ` +
          `(adapter runtime: ${input.runtime})`,
      );
    },
    verify: () => {
      throw new Error(
        `verify must not be called by aggregateNodeManifest ` +
          `(adapter runtime: ${input.runtime})`,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("aggregateNodeManifest (Phase 8 / Step 4 — merged manifest at node level)", () => {
  describe("empty input", () => {
    it("returns an empty manifest when no adapters are registered", () => {
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWEmpty",
        adapters: [],
      });
      expect(manifest.peerId).toBe("12D3KooWEmpty");
      expect(manifest.runtimes).toEqual([]);
      expect(manifest.skills).toEqual([]);
    });
  });

  describe("single adapter", () => {
    it("emits the adapter's skills, tagged with its runtime", () => {
      const envoyHarnessAdapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          { skillId: "code-review", description: "Review a diff", maxSensitivity: "private", tags: ["code", "review"] },
          { skillId: "code-edit", description: "Edit a file", maxSensitivity: "private", tags: ["code", "edit"] },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWSolo",
        adapters: [envoyHarnessAdapter],
      });
      expect(manifest.peerId).toBe("12D3KooWSolo");
      expect(manifest.runtimes).toEqual([
        { runtime: "envoy-harness", runtimeVersion: "unknown" },
      ]);
      expect(manifest.skills).toEqual([
        { skillId: "code-review", description: "Review a diff", costCeilingUsd: undefined, maxSensitivity: "private", tags: ["code", "review"], runtime: "envoy-harness" },
        { skillId: "code-edit", description: "Edit a file", costCeilingUsd: undefined, maxSensitivity: "private", tags: ["code", "edit"], runtime: "envoy-harness" },
      ]);
    });
  });

  describe("two adapters", () => {
    it("emits the union of skills, each tagged with its runtime", () => {
      const envoyHarnessAdapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          { skillId: "code-review", description: "Review", maxSensitivity: "private", tags: [] },
          { skillId: "code-edit", description: "Edit", maxSensitivity: "private", tags: [] },
          { skillId: "doc-search", description: "Search", maxSensitivity: "private", tags: [] },
          { skillId: "bash-run", description: "Run", maxSensitivity: "private", tags: [] },
          { skillId: "plan", description: "Plan", maxSensitivity: "private", tags: [] },
        ],
      });
      const openClawAdapter = makeFakeAdapter({
        runtime: "openclaw",
        skills: [
          { skillId: "research", description: "Research", maxSensitivity: "friends", tags: [] },
          { skillId: "summarize", description: "Summarize", maxSensitivity: "private", tags: [] },
          { skillId: "translate", description: "Translate", maxSensitivity: "friends", tags: [] },
          { skillId: "draft", description: "Draft", maxSensitivity: "private", tags: [] },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWBoth",
        adapters: [envoyHarnessAdapter, openClawAdapter],
      });
      expect(manifest.runtimes).toEqual([
        { runtime: "envoy-harness", runtimeVersion: "unknown" },
        { runtime: "openclaw", runtimeVersion: "unknown" },
      ]);
      // 5 + 4 = 9 skills; envoy-harness first
      // (insertion order).
      expect(manifest.skills.length).toBe(9);
      expect(
        manifest.skills.filter((s) => s.runtime === "envoy-harness").length,
      ).toBe(5);
      expect(
        manifest.skills.filter((s) => s.runtime === "openclaw").length,
      ).toBe(4);
      // Spot-check: code-review is tagged with envoy-harness
      expect(
        manifest.skills.find((s) => s.skillId === "code-review")?.runtime,
      ).toBe("envoy-harness");
      // Spot-check: research is tagged with openclaw
      expect(
        manifest.skills.find((s) => s.skillId === "research")?.runtime,
      ).toBe("openclaw");
    });
  });

  describe("skillId collision", () => {
    it("throws SkillIdCollisionError when two adapters expose the same skillId", () => {
      const envoyHarnessAdapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          { skillId: "shared-skill", description: "From envoy-harness", maxSensitivity: "private", tags: [] },
        ],
      });
      const openClawAdapter = makeFakeAdapter({
        runtime: "openclaw",
        skills: [
          { skillId: "shared-skill", description: "From openclaw", maxSensitivity: "private", tags: [] },
        ],
      });
      expect(() =>
        aggregateNodeManifest({
          peerId: "12D3KooWCollide",
          adapters: [envoyHarnessAdapter, openClawAdapter],
        }),
      ).toThrow(SkillIdCollisionError);
      // Verify the error details
      try {
        aggregateNodeManifest({
          peerId: "12D3KooWCollide",
          adapters: [envoyHarnessAdapter, openClawAdapter],
        });
        // Should not reach here
        expect.fail("expected SkillIdCollisionError");
      } catch (err) {
        expect(err).toBeInstanceOf(SkillIdCollisionError);
        const collisionErr = err as SkillIdCollisionError;
        expect(collisionErr.skillId).toBe("shared-skill");
        expect(collisionErr.runtimeA).toBe("envoy-harness");
        expect(collisionErr.runtimeB).toBe("openclaw");
      }
    });
  });

  describe("runtimeVersion v0 (always 'unknown')", () => {
    it("reports runtimeVersion='unknown' for every runtime (v0 limitation)", () => {
      // Future: read from `buildManifest()` output
      // (requires async aggregator). v0 hard-codes
      // 'unknown'.
      const adapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWVersion",
        adapters: [adapter],
      });
      expect(manifest.runtimes[0].runtimeVersion).toBe("unknown");
    });
  });

  describe("tags + costCeilingUsd preservation", () => {
    it("preserves tags[] and costCeilingUsd as-is from the descriptor", () => {
      const adapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          {
            skillId: "code-review",
            description: "Review a diff",
            maxSensitivity: "private",
            tags: ["code", "review", "llm"],
            costCeilingUsd: 3.0,
          },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWPreserve",
        adapters: [adapter],
      });
      const skill = manifest.skills[0] as MergedSkillEntry;
      expect(skill.tags).toEqual(["code", "review", "llm"]);
      expect(skill.costCeilingUsd).toBe(3.0);
    });

    it("preserves costCeilingUsd=undefined when the descriptor omits it", () => {
      const adapter = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          {
            skillId: "code-review",
            description: "Review a diff",
            maxSensitivity: "private",
            tags: [],
            // no costCeilingUsd
          },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWNoCost",
        adapters: [adapter],
      });
      const skill = manifest.skills[0] as MergedSkillEntry;
      expect(skill.costCeilingUsd).toBeUndefined();
    });
  });

  describe("maxSensitivity preservation", () => {
    it("preserves maxSensitivity for all 3 values (public / friends / private)", () => {
      const adapter = makeFakeAdapter({
        runtime: "openclaw",
        skills: [
          { skillId: "a", description: "A", maxSensitivity: "public", tags: [] },
          { skillId: "b", description: "B", maxSensitivity: "friends", tags: [] },
          { skillId: "c", description: "C", maxSensitivity: "private", tags: [] },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWSens",
        adapters: [adapter],
      });
      expect(manifest.skills[0].maxSensitivity).toBe("public");
      expect(manifest.skills[1].maxSensitivity).toBe("friends");
      expect(manifest.skills[2].maxSensitivity).toBe("private");
    });
  });

  describe("skill order preservation (insertion order)", () => {
    it("emits skills in adapter-insertion order, then per-adapter descriptor order", () => {
      const adapterA = makeFakeAdapter({
        runtime: "envoy-harness",
        skills: [
          { skillId: "a-1", description: "A1", maxSensitivity: "private", tags: [] },
          { skillId: "a-2", description: "A2", maxSensitivity: "private", tags: [] },
          { skillId: "a-3", description: "A3", maxSensitivity: "private", tags: [] },
        ],
      });
      const adapterB = makeFakeAdapter({
        runtime: "openclaw",
        skills: [
          { skillId: "b-1", description: "B1", maxSensitivity: "private", tags: [] },
          { skillId: "b-2", description: "B2", maxSensitivity: "private", tags: [] },
        ],
      });
      const manifest = aggregateNodeManifest({
        peerId: "12D3KooWOrder",
        adapters: [adapterA, adapterB],
      });
      expect(manifest.skills.map((s) => s.skillId)).toEqual([
        "a-1",
        "a-2",
        "a-3",
        "b-1",
        "b-2",
      ]);
    });
  });
});
