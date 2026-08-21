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
// v1.17 — the v1.9 deprecation shims
// (`extractEnvoyHarnessTags` +
// `extractOpenClawTags`) were removed.
// All production callers migrated to
// `extractTagsByRuntime(manifest, runtime)`
// in v1.9. The shim tests are no longer
// needed.
