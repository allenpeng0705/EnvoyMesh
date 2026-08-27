/**
 * Phase 8 Step 4 — Agent-adapter manifest aggregator.
 *
 * **What this is:** a pure function that takes a list of
 * `AgentAdapter` instances and the node's peerId, and
 * returns a `NodeManifest` — a **local merged view** of
 * what the node can do. The orchestrator's manifest
 * picker reads from this; the wire-level broadcast
 * (`agent-adapter-broadcast.ts`) stays per-runtime.
 *
 * **Why a local view, not a wire format:** the wire
 * `CapabilityManifest` (in
 * `packages/protocol/src/agent-adapter.ts:121`) is
 * **per-runtime** — one `runtime: AgentRuntime` per
 * manifest, with that runtime's `skills[]`. A node
 * with 2 runtimes broadcasts **2 separate manifests**.
 * The merged manifest is the host's **local aggregate**
 * of what those 2 manifests would say, for the
 * orchestrator to query without iterating per-adapter.
 *
 * **Why this matters today (Q5 routing):** the
 * orchestrator's "per-node primary + best-fit skill
 * fallback" routing decision (per the design doc §4
 * Q5) needs to know "what skills does this node have,
 * and which runtime owns each". The merged manifest
 * answers that in one read. Without it, the
 * orchestrator would have to instantiate each adapter,
 * call `describeSkills()`, union the results, and tag
 * each with the adapter's runtime — every routing
 * decision.
 *
 * **Why fail loud on `skillId` collision:** the merged
 * manifest is the **single source of truth** for the
 * orchestrator. A `skillId` that exists in two
 * runtimes is a **bug in one of the runtimes** — the
 * model would see two skills with the same name in its
 * tool list, which is undefined behavior. We fail loud
 * at aggregation time, not silently.
 *
 * **`runtimeVersion: "unknown"` v0:** the `AgentAdapter`
 * interface doesn't expose `runtimeVersion` directly
 * (it's on the manifest, not the adapter). v0
 * hard-codes `"unknown"`; a follow-up can add a
 * `getRuntimeVersion()` method to the interface (or
 * move to an async aggregator that calls
 * `buildManifest()`).
 *
 * **Stability:** the public surface is
 * `aggregateNodeManifest` + `NodeManifest` +
 * `MergedSkillEntry` + `MergedRuntimeEntry` +
 * `SkillIdCollisionError`. Additive; new fields are
 * optional; the function is pure (no side effects).
 */

import type {
  AgentRuntime,
  SkillDescriptor,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

/**
 * A single skill entry in the merged manifest, tagged
 * with the runtime that owns it. The orchestrator
 * uses the `runtime` tag to dispatch "best-fit
 * fallback" tasks to the right runtime.
 */
export interface MergedSkillEntry {
  skillId: string;
  description: string;
  costCeilingUsd: number | undefined;
  maxSensitivity: SkillDescriptor["maxSensitivity"];
  tags: ReadonlyArray<string>;
  /** The runtime that owns this skill (where the model can call it). */
  runtime: AgentRuntime;
}

/**
 * A runtime entry in the merged manifest. v0 always
 * reports `runtimeVersion: "unknown"` (see file header
 * for why); future: real version from the adapter or
 * `buildManifest()`.
 */
export interface MergedRuntimeEntry {
  runtime: AgentRuntime;
  /** v0 always `"unknown"`; see file header. */
  runtimeVersion: string;
}

/**
 * The local merged manifest for this node. The
 * orchestrator's manifest picker reads this once
 * per routing decision (or caches it at startup +
 * refreshes on adapter config change).
 */
export interface NodeManifest {
  /** The owning node's peerId. */
  peerId: string;
  /** All runtimes registered on this node. */
  runtimes: ReadonlyArray<MergedRuntimeEntry>;
  /**
   * Union of all `describeSkills()` outputs, each
   * tagged with the runtime that owns it. SkillIds
   * are unique across runtimes (the aggregator
   * fails loud on collision).
   */
  skills: ReadonlyArray<MergedSkillEntry>;
}

/**
 * Thrown when two adapters expose the same `skillId`.
 * Indicates a bug in one of the adapters — the model
 * would see two skills with the same name in its
 * tool list. We fail loud at aggregation time, not
 * silently.
 */
export class SkillIdCollisionError extends Error {
  constructor(
    public readonly skillId: string,
    public readonly runtimeA: AgentRuntime,
    public readonly runtimeB: AgentRuntime,
  ) {
    super(
      `skillId collision: '${skillId}' is in both ` +
        `runtime '${runtimeA}' and runtime '${runtimeB}'`,
    );
    this.name = "SkillIdCollisionError";
  }
}

/**
 * Build the node's local merged manifest.
 *
 * **Pure function:** no I/O, no `process.env`, no
 * global state. The caller injects the list of
 * adapters (typically from the host's bootstrap
 * path). Tests can pass any list of adapters; no
 * need to set up a real `NodeServiceImpl`.
 *
 * **Order preservation:** skills are emitted in
 * adapter-insertion order (the first adapter's
 * skills come first, then the second's, etc.). The
 * orchestrator's manifest picker relies on this
 * for deterministic "first match wins" routing.
 *
 * **Tags preservation:** the `tags[]` array from
 * the `SkillDescriptor` is preserved as-is
 * (`ReadonlyArray<string>`). The orchestrator may
 * filter by tag for marketplace-style queries.
 *
 * **Cost / sensitivity preservation:** both fields
 * are optional on `SkillDescriptor`; we keep them
 * as `undefined` when not set. The orchestrator's
 * budget ledger reads `costCeilingUsd`; the
 * sensitivity filter reads `maxSensitivity`.
 */
export function aggregateNodeManifest(input: {
  peerId: string;
  adapters: ReadonlyArray<AgentAdapter>;
}): NodeManifest {
  const runtimes: MergedRuntimeEntry[] = [];
  const skills: MergedSkillEntry[] = [];
  const seenSkillIds = new Map<string, AgentRuntime>();

  for (const adapter of input.adapters) {
    // The adapter's runtimeVersion is on the
    // manifest, not the adapter itself. v0 uses
    // "unknown" for adapters that don't expose it;
    // future: read from `buildManifest()` output
    // (requires async aggregator).
    runtimes.push({
      runtime: adapter.runtime,
      runtimeVersion: "unknown",
    });

    for (const skill of adapter.describeSkills()) {
      const existing = seenSkillIds.get(skill.skillId);
      if (existing !== undefined) {
        throw new SkillIdCollisionError(
          skill.skillId,
          existing,
          adapter.runtime,
        );
      }
      seenSkillIds.set(skill.skillId, adapter.runtime);
      skills.push({
        skillId: skill.skillId,
        description: skill.description,
        costCeilingUsd: skill.costCeilingUsd,
        maxSensitivity: skill.maxSensitivity,
        tags: skill.tags,
        runtime: adapter.runtime,
      });
    }
  }

  return {
    peerId: input.peerId,
    runtimes,
    skills,
  };
}
