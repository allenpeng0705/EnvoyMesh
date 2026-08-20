/**
 * Phase 8 / v1.1 — extract envoy-harness skill tags
 * from the merged `NodeManifest`.
 *
 * **What this is:** a pure function that filters
 * the manifest's skills by `runtime === "envoy-harness"`
 * and unions their `tags[]` arrays. The result is
 * the dynamic vocabulary the user-prompt router
 * uses to detect signal-bearing prompts.
 *
 * **Why a separate file (not in
 * `agent-adapter-manifest-aggregate.ts`):** the
 * aggregator is a generic host primitive; the
 * envoy-harness-specific filter is a v1.1 routing
 * concern. Keeping them apart lets the aggregator
 * stay runtime-agnostic.
 *
 * **Pure function:** no I/O, no `process.env`, no
 * clock. Tests pass a synthetic `NodeManifest`
 * shape (the `MergedSkillEntry` aggregator test
 * helper). The host's `getNodeManifest()` is
 * synchronous (the manifest is cached after init),
 * so this stays sync-friendly.
 *
 * **Stability:** the public surface is
 * `extractEnvoyHarnessTags(manifest)`. The input
 * is `NodeManifest` (from
 * [`agent-adapter-manifest-aggregate.ts`](./agent-adapter-manifest-aggregate.ts));
 * the output is `ReadonlyArray<string>` (the union
 * of tags; deduplicated; insertion order preserved
 * per the first skill that contributes each tag).
 */

import type { NodeManifest } from "./agent-adapter-manifest-aggregate.js";
import type { EnvoyHarnessSkillEntry } from "./user-prompt-router.js";

/**
 * Extract the union of `tags[]` across all
 * envoy-harness skills in the merged manifest.
 *
 * **Algorithm:**
 * 1. Iterate `manifest.skills`.
 * 2. For each skill with `runtime === "envoy-harness"`,
 *    add its tags to a `Set` (deduplicates).
 * 3. Return the `Set` as an array.
 *
 * **Empty result handling:** when the manifest
 * has no envoy-harness skills (e.g. envoy-harness
 * isn't installed, or the manifest is empty),
 * the returned array is empty. The router treats
 * `[]` as "no tag-based signals" (Q8 of the
 * v1.1 sub-plan) — the v0 tool names / lsp regex
 * / hint prefix still work.
 *
 * **Order:** insertion order is the order in
 * which tags are first seen in `manifest.skills`
 * (which is adapter-insertion order per the
 * aggregator's order-preservation contract). The
 * router doesn't depend on order (it just iterates
 * the tags to build a vocabulary); tests don't
 * assert on a specific order.
 *
 * @param manifest The merged node manifest
 *   (typically from `NodeServiceImpl.getNodeManifest()`).
 * @returns The deduplicated union of envoy-harness
 *   skill tags (read-only).
 */
export function extractEnvoyHarnessTags(
  manifest: NodeManifest,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime !== "envoy-harness") continue;
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}

/**
 * Phase 8 / v1.2 — extract the structured skill
 * list from the merged manifest's envoy-harness
 * skills. Returns `{ skillId, tags }[]` for each
 * envoy-harness skill — the projected shape the
 * v1.2 router's per-skill matching expects.
 *
 * **Why a separate helper (not in
 * `agent-adapter-manifest-aggregate.ts`):** the
 * aggregator is runtime-agnostic. The
 * envoy-harness-specific filter is a v1.2 routing
 * concern. Keeping the projection here lets the
 * host stay close to the router's input type.
 *
 * **Why a projected shape (vs full
 * `MergedSkillEntry`):** the router is
 * manifest-independent (Q8 of the v1.2 sub-plan).
 * The host does the projection here.
 *
 * **Order:** insertion order matches
 * `manifest.skills` (which is adapter-insertion
 * order per the aggregator's order-preservation
 * contract). The router's per-skill matching uses
 * this order for the Q3 insertion-order tiebreak
 * (moot given Q1's uniquely-held threshold but
 * kept as insurance).
 *
 * @param manifest The merged node manifest.
 * @returns The structured skill list, ready to
 *   pass to `routeUserPrompt` as
 *   `envoyHarnessSkills`.
 */
export function extractEnvoyHarnessSkills(
  manifest: NodeManifest,
): ReadonlyArray<EnvoyHarnessSkillEntry> {
  const skills: EnvoyHarnessSkillEntry[] = [];
  for (const skill of manifest.skills) {
    if (skill.runtime !== "envoy-harness") continue;
    skills.push({
      skillId: skill.skillId,
      tags: skill.tags,
    });
  }
  return skills;
}
