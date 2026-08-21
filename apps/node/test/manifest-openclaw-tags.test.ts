/**
 * Phase 8 / v1.7 — tests for the OpenClaw tag
 * extractor (`manifest-envoy-harness-tags.ts` →
 * `extractOpenClawTags`).
 *
 * **What this covers:**
 * - `extractOpenClawTags(manifest)` returns the
 *   union of tags from OpenClaw skills in the
 *   manifest.
 * - The extractor excludes non-OpenClaw skills
 *   (only `runtime === "openclaw"` skills are
 *   considered).
 * - The extractor deduplicates tags across skills
 *   (per the v1.1 design).
 * - Empty array handling: empty manifest, no
 *   OpenClaw skills, etc.
 *
 * **Why a separate file (not in
 * `manifest-envoy-harness-tags.test.ts`):** the
 * two extractors (`extractEnvoyHarnessTags` +
 * `extractOpenClawTags`) are mirror functions with
 * different semantics (positive vs. negative
 * signals). Keeping the tests in separate files
 * makes the v1.7 intent explicit.
 *
 * **Pure function tests:** the manifest is
 * constructed inline; no I/O, no `process.env`,
 * no clock. The tests pass a synthetic
 * `NodeManifest` shape.
 */

import { describe, expect, it } from "vitest";

import type { NodeManifest } from "../src/agent-adapter-manifest-aggregate.js";
import { extractOpenClawTags } from "../src/manifest-envoy-harness-tags.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(
  skills: ReadonlyArray<{
    runtime: "openclaw" | "envoy-harness" | "ext" | "pi" | "openhuman";
    skillId: string;
    tags: ReadonlyArray<string>;
  }>,
): NodeManifest {
  return {
    peerId: "local",
    skills: skills.map((s) => ({
      ...s,
      description: `skill ${s.skillId}`,
      inputSchema: { type: "object" },
    })),
  } as unknown as NodeManifest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractOpenClawTags", () => {
  it("returns the union of tags from OpenClaw skills (the basic case)", () => {
    const manifest = makeManifest([
      {
        runtime: "openclaw",
        skillId: "creative-writing",
        tags: ["creative", "writing", "story"],
      },
    ]);
    expect(extractOpenClawTags(manifest)).toEqual([
      "creative",
      "writing",
      "story",
    ]);
  });

  it("excludes non-OpenClaw skills (only `runtime === \"openclaw\"` skills are considered)", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["eh-tag-1", "eh-tag-2"],
      },
      {
        runtime: "ext",
        skillId: "ext-skill",
        tags: ["ext-tag-1"],
      },
      {
        runtime: "openclaw",
        skillId: "openclaw-skill",
        tags: ["openclaw-tag-1"],
      },
    ]);
    const result = extractOpenClawTags(manifest);
    expect(result).toEqual(["openclaw-tag-1"]);
    // The EH + ext tags are NOT in the result.
    expect(result).not.toContain("eh-tag-1");
    expect(result).not.toContain("eh-tag-2");
    expect(result).not.toContain("ext-tag-1");
  });

  it("deduplicates tags across multiple OpenClaw skills", () => {
    const manifest = makeManifest([
      {
        runtime: "openclaw",
        skillId: "creative-writing",
        tags: ["creative", "writing"],
      },
      {
        runtime: "openclaw",
        skillId: "casual-chat",
        tags: ["creative", "casual", "chat"],
      },
    ]);
    // "creative" appears in both skills;
    // it's deduplicated.
    const result = extractOpenClawTags(manifest);
    expect(result).toContain("creative");
    expect(result.filter((t) => t === "creative")).toHaveLength(1);
    expect(result).toContain("writing");
    expect(result).toContain("casual");
    expect(result).toContain("chat");
  });

  it("returns `[]` when the manifest has no skills (empty manifest)", () => {
    const manifest = makeManifest([]);
    expect(extractOpenClawTags(manifest)).toEqual([]);
  });

  it("returns `[]` when the manifest has no OpenClaw skills (Q9 — empty array handling)", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["eh-tag-1"],
      },
    ]);
    expect(extractOpenClawTags(manifest)).toEqual([]);
  });

  it("preserves insertion order (first-skill-first-tag order)", () => {
    // Per the v1.1 design (Q3 of the v1.1
    // sub-plan), insertion order is preserved:
    // the first tag of the first skill comes
    // first, then the next tag, etc. The router
    // doesn't depend on order (it just iterates
    // the tags to build a vocabulary), but the
    // determinism is useful for tests.
    const manifest = makeManifest([
      {
        runtime: "openclaw",
        skillId: "skill-a",
        tags: ["alpha", "beta"],
      },
      {
        runtime: "openclaw",
        skillId: "skill-b",
        tags: ["gamma", "delta"],
      },
    ]);
    const result = extractOpenClawTags(manifest);
    expect(result).toEqual(["alpha", "beta", "gamma", "delta"]);
  });

  it("mirror-symmetric with `extractEnvoyHarnessTags` (same algorithm, different filter)", () => {
    // The two extractors share the algorithm;
    // they differ only in the `runtime` filter.
    // A manifest with mixed runtimes should
    // produce non-overlapping tag sets (one
    // for EH, one for OpenClaw).
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["eh-only-tag"],
      },
      {
        runtime: "openclaw",
        skillId: "openclaw-skill",
        tags: ["openclaw-only-tag"],
      },
    ]);
    const openClawResult = extractOpenClawTags(manifest);
    expect(openClawResult).toEqual(["openclaw-only-tag"]);
    expect(openClawResult).not.toContain("eh-only-tag");
  });
});
