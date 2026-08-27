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
import type { AgentRuntime } from "@envoymesh/protocol";

/**
 * Phase 8 / v1.9 — extract the union of
 * `tags[]` across all skills of a given
 * `AgentRuntime` in the merged manifest.
 * Generalizes the v1.1 `extractEnvoyHarnessTags`
 * + the v1.7 `extractOpenClawTags` into a
 * single function.
 *
 * **Why a single function (not per-runtime
 * extractors):** the algorithm is identical
 * across runtimes; the only difference is the
 * `runtime` filter. A single function with a
 * parameter is DRY and easier to test.
 *
 * **Empty result handling:** when the
 * manifest has no skills of the given runtime,
 * the returned array is empty. The router
 * treats `[]` as "no tag-based signals" (Q8 of
 * the v1.1 sub-plan; the v1.9 equivalent).
 *
 * **Order:** insertion order is the order in
 * which tags are first seen in `manifest.skills`.
 * The router doesn't depend on order.
 *
 * @param manifest The merged node manifest
 *   (typically from `NodeServiceImpl.getNodeManifest()`).
 * @param runtime The runtime to filter by
 *   (`AgentRuntime` — one of "envoy-harness",
 *   "openclaw", "pi", "hermes", "codex",
 *   "codex-cli", "openhuman").
 * @returns The deduplicated union of skills'
 *   tags for the given runtime (read-only).
 */
export function extractTagsByRuntime(
  manifest: NodeManifest,
  runtime: AgentRuntime,
): ReadonlyArray<string> {
  const tags = new Set<string>();
  for (const skill of manifest.skills) {
    if (skill.runtime !== runtime) continue;
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return [...tags];
}

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

/**
 * Phase 8 / v1.7 — extract the union of `tags[]`
 * across all openclaw skills in the merged
 * manifest. The result is the **negative-signal
 * vocabulary** the user-prompt router uses to
 * veto EH routing (Q1 + Q2 of the v1.7
 * sub-plan).
 *
 * **Mirror of `extractEnvoyHarnessTags`:** the
 * same algorithm, filtered by
 * `runtime === "openclaw"` instead of
 * `runtime === "envoy-harness"`. Both
 * extractors share the manifest staleness +
 * empty-array semantics.
 *
 * **Why a separate function (not merging the
 * two):** the two vocabularies have different
 * semantics (positive vs. negative signals).
 * Keeping them apart makes the v1.7 intent
 * explicit and lets the router apply the
 * negative rule separately from the positive
 * rule.
 *
 * **Empty result handling:** when the manifest
 * has no openclaw skills (e.g. openclaw isn't
 * installed, or the manifest is empty), the
 * returned array is empty. The router treats
 * `[]` as "no negative signal scan" (Q9 of the
 * v1.7 sub-plan) — the v1.6 positive-signal
 * behavior is preserved.
 *
 * **Order:** insertion order is the order in
 * which tags are first seen in `manifest.skills`
 * (which is adapter-insertion order per the
 * aggregator's order-preservation contract).
 * The router doesn't depend on order.
 *
 * @param manifest The merged node manifest
 *   (typically from `NodeServiceImpl.getNodeManifest()`).
 * @returns The deduplicated union of openclaw
 *   skill tags (read-only).
 */
