/**
 * Phase 8 — envoy-harness skill manifest for the Agent Network engine picker.
 *
 * **Source of truth:** the `ENVOY_HARNESS_SKILLS` array in
 * `@envoymesh/envoy-harness-adapter` (the cross-monorepo bridge).
 * The bridge re-exports the catalog from
 * `envoy-harness/packages/envoy-harness-adapter/src/skills.ts`.
 *
 * **Why re-export here:** EnvoyMesh's orchestrator wants the catalog
 * in a single place (the `OPENCLAW_SKILLS` analog in
 * `packages/agent-adapter/src/openclaw-adapter.ts`). Wrapping the
 * import here keeps the runtime-specific knowledge inside the
 * `agent-runtime-envoy/` directory and lets the orchestrator import
 * `ENVOY_HARNESS_RUNTIME_SKILLS` from `@envoymesh/node`.
 *
 * **Stability:** additive. New skills in the adapter flow through
 * automatically. Bumping the schema version in the protocol package
 * is the orchestrator's responsibility, not ours.
 */

import { ENVOY_HARNESS_SKILLS } from "@envoymesh/envoy-harness-adapter";

/**
 * Skills this runtime advertises on the mesh. Same shape as
 * `OPENCLAW_SKILLS` (Team-job `requiredSkill` tags + cost ceiling
 * + sensitivity + tags). See `SkillDescriptor` in
 * `@envoymesh/protocol`.
 */
export const ENVOY_HARNESS_RUNTIME_SKILLS = ENVOY_HARNESS_SKILLS;
