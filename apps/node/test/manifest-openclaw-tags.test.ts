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
import {
  extractEnvoyHarnessTags,
  extractOpenClawTags,
  extractTagsByRuntime,
} from "../src/manifest-envoy-harness-tags.js";
import type { AgentRuntime } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManifest(
  skills: ReadonlyArray<{
    runtime: AgentRuntime;
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

// ---------------------------------------------------------------------------
// Phase 8 / v1.9 — generic `extractTagsByRuntime`
// ---------------------------------------------------------------------------

describe("extractTagsByRuntime (v1.9 generic extractor)", () => {
  it("returns the union of tags for envoy-harness skills (mirrors `extractEnvoyHarnessTags`)", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["mesh", "observability"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "envoy-harness")).toEqual([
      "mesh",
      "observability",
    ]);
  });

  it("returns the union of tags for openclaw skills (mirrors `extractOpenClawTags`)", () => {
    const manifest = makeManifest([
      {
        runtime: "openclaw",
        skillId: "openclaw-skill",
        tags: ["creative", "writing"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "openclaw")).toEqual([
      "creative",
      "writing",
    ]);
  });

  it("returns the union of tags for pi skills (v1.9 — new runtime)", () => {
    const manifest = makeManifest([
      {
        runtime: "pi",
        skillId: "pi-skill",
        tags: ["reasoning", "math"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "pi")).toEqual([
      "reasoning",
      "math",
    ]);
  });

  it("returns the union of tags for hermes skills (v1.9 — new runtime)", () => {
    const manifest = makeManifest([
      {
        runtime: "hermes",
        skillId: "hermes-skill",
        tags: ["translation", "language"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "hermes")).toEqual([
      "translation",
      "language",
    ]);
  });

  it("returns the union of tags for codex + codex-cli skills (v1.9 — new runtimes)", () => {
    const manifest = makeManifest([
      {
        runtime: "codex",
        skillId: "codex-skill",
        tags: ["code-gen", "python"],
      },
      {
        runtime: "codex-cli",
        skillId: "codex-cli-skill",
        tags: ["shell", "bash"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "codex")).toEqual([
      "code-gen",
      "python",
    ]);
    expect(extractTagsByRuntime(manifest, "codex-cli")).toEqual([
      "shell",
      "bash",
    ]);
  });

  it("returns the union of tags for openhuman skills (v1.9 — new runtime)", () => {
    const manifest = makeManifest([
      {
        runtime: "openhuman",
        skillId: "openhuman-skill",
        tags: ["review", "approval"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "openhuman")).toEqual([
      "review",
      "approval",
    ]);
  });

  it("excludes skills of other runtimes (the runtime filter is exact)", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["eh-tag"],
      },
      {
        runtime: "pi",
        skillId: "pi-skill",
        tags: ["pi-tag"],
      },
    ]);
    // The pi extractor only returns the pi tags,
    // not the eh tags.
    const piResult = extractTagsByRuntime(manifest, "pi");
    expect(piResult).toEqual(["pi-tag"]);
    expect(piResult).not.toContain("eh-tag");
  });

  it("deduplicates tags across multiple skills of the same runtime", () => {
    const manifest = makeManifest([
      {
        runtime: "pi",
        skillId: "pi-skill-1",
        tags: ["reasoning", "math"],
      },
      {
        runtime: "pi",
        skillId: "pi-skill-2",
        tags: ["reasoning", "logic"],
      },
    ]);
    // "reasoning" appears in both skills; it's
    // deduplicated.
    const result = extractTagsByRuntime(manifest, "pi");
    expect(result).toContain("reasoning");
    expect(result.filter((t) => t === "reasoning")).toHaveLength(1);
    expect(result).toContain("math");
    expect(result).toContain("logic");
  });

  it("returns `[]` when the manifest has no skills of the given runtime", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["eh-tag"],
      },
    ]);
    expect(extractTagsByRuntime(manifest, "pi")).toEqual([]);
  });

  it("returns `[]` when the manifest is empty", () => {
    const manifest = makeManifest([]);
    expect(extractTagsByRuntime(manifest, "pi")).toEqual([]);
    expect(extractTagsByRuntime(manifest, "openclaw")).toEqual([]);
    expect(extractTagsByRuntime(manifest, "envoy-harness")).toEqual([]);
  });
});

describe("v1.9 deprecation shims (Q3 + Q10)", () => {
  it("`extractEnvoyHarnessTags` still returns the v1.1 result (deprecation shim)", () => {
    const manifest = makeManifest([
      {
        runtime: "envoy-harness",
        skillId: "eh-skill",
        tags: ["mesh", "observability"],
      },
    ]);
    expect(extractEnvoyHarnessTags(manifest)).toEqual([
      "mesh",
      "observability",
    ]);
  });

  it("`extractOpenClawTags` still returns the v1.7 result (deprecation shim)", () => {
    const manifest = makeManifest([
      {
        runtime: "openclaw",
        skillId: "openclaw-skill",
        tags: ["creative", "writing"],
      },
    ]);
    expect(extractOpenClawTags(manifest)).toEqual(["creative", "writing"]);
  });
});
