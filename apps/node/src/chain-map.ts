/**
 * MAP interop layer — worker side.
 *
 * Bridges the Mesh Adapter Pattern (`AgentAdapter` from `@envoymesh/agent-adapter`)
 * into the existing Team-job worker contract (`ChainWorkerHandlerDeps.executeSubtask`).
 *
 * **Why this file exists:** the wire protocol between worker and orchestrator
 * (`task.chain.partial` with `ChainSubtaskPartial` + named artifacts) does not
 * change. What changes is *how* a worker produces a result: instead of the
 * legacy `{ isReady, ask }` engine contract (`createEngineChainSubtaskExecutor`),
 * the adapter path is `AgentAdapter.execute → SignedAgentResult` (typed
 * `ContentBlock[]`) plus `AgentAdapter.verify` for a runtime-specific verdict.
 *
 * This module owns:
 *   1. `mapChainSubtaskToExecuteInput` — pure `ChainSubtask → ExecuteInput`.
 *   2. `contentBlocksToResultArtifacts` — pure `ContentBlock[] → ChainSubtaskPartial` artifacts.
 *   3. `resultArtifactsToContentBlocks` / `contentBlocksToText` — the merge-step
 *      currency: reconstructs the normalized `ContentBlock[]` a worker produced
 *      and renders it to text through one canonical projection (used by
 *      `synthesizeChain`, so the merge step never sees an opaque string).
 *   4. `combineVerdicts` — OR-of-pass / AND-of-fail / default-disputed (design §6.2).
 *   5. `createMapChainSubtaskExecutor` — an executor with the same shape as
 *      `createOpenClawChainSubtaskExecutor`, ready to slot into the
 *      `executeSubtask` wiring in `node-service-chain-orchestration.ts`.
 *
 * Design doc: `docs/improving-agent-network.en.md` §3.1 (MAP interop layer),
 * §1.7 (real worker-side seam).
 */

import {
  CHAIN_NAMED_ARTIFACTS_MAX,
  ChainSubtaskPartialSchema,
  TaskChainPartialPayloadSchema,
  clipChainSubtaskPartialNote,
  createFileArtifact,
  createStructuredArtifact,
  createTextArtifact,
  type AgentNetworkProfile,
  type CapabilityManifest,
  type Artifact,
  type ChainSubtask,
  type ChainSubtaskPartial,
  type ContentBlock,
  type NamedArtifact,
  type SignedAgentResult,
  type SkillDescriptor,
  type Verdict,
} from "@envoymesh/protocol";
import { ContentBlockSchema, SignedAgentResultSchema } from "@envoymesh/protocol";
import type { AgentAdapter, ExecuteInput } from "@envoymesh/agent-adapter";
import { chainLog, chainWarn, shortPeerId } from "./chain-debug.js";
import type { ChainWorkerHandlerDeps } from "./chain-worker.js";
import { buildOpenClawSubtaskPrompt } from "./chain-worker-executor.js";

/** Text blocks longer than the protocol's TextArtifact max would fail Zod. Clip here. */
const MAP_TEXT_ARTIFACT_MAX = 64_000;

/**
 * Default wall-clock deadline for a subtask that carries no `deadlineAt`.
 * Mirrors the OpenClaw engine executor's ~120s response budget.
 */
export const MAP_DEFAULT_DEADLINE_MS = 120_000;

// ---------------------------------------------------------------------------
// Pure mappings
// ---------------------------------------------------------------------------

/**
 * Build a `CapabilityManifest` from a worker's owner-attested Agent Network
 * profile. This is the Sprint 2 bridge between the legacy card surface and the
 * MAP manifest pool: until per-runtime manifests are broadcast on the wire
 * (a later MAP step), the orchestrator synthesizes manifests from the skills
 * the card already advertises.
 *
 * `runtime` is fixed to `"openclaw"` (the only runtime with a MAP adapter
 * today); `reputationBySkill` is deliberately empty here — the 3-tuple book
 * (`chain-reputation-3tuple.ts`) fills it on the live path.
 *
 * Returns `undefined` when the profile advertises no skills (a peer with no
 * skills is not eligible for the manifest pool).
 */
export function manifestFromAgentNetworkProfile(
  profile: AgentNetworkProfile | undefined,
  peerId: string,
  ownerId: string,
  now?: () => Date,
): CapabilityManifest | undefined {
  if (!profile || profile.skills.length === 0) return undefined;
  const skills: SkillDescriptor[] = [];
  for (const raw of profile.skills) {
    // Defensive: some card sources still advertise legacy plain-string skills.
    const id = typeof raw === "string" ? raw : raw?.id;
    if (!id) continue;
    skills.push({
      skillId: id,
      description: `skill attested by ${ownerId}`,
      maxSensitivity: "public",
      tags: [],
    });
  }
  if (skills.length === 0) return undefined;
  return {
    runtime: "openclaw",
    runtimeVersion: "mesh-profile",
    peerId,
    ownerId,
    skills,
    reputationBySkill: {},
    issuedAt: (now ?? (() => new Date()))().toISOString(),
    ttlSeconds: 300,
  };
}

/**
 * Map a `ChainSubtask` (+ Phase 53 input artifacts) to an `AgentAdapter.ExecuteInput`.
 *
 * The returned `signal` fires (best-effort) at the computed deadline so
 * cooperative adapters can abort; the executor still awaits `execute`, so a
 * hung adapter cannot wedge the worker past what the wire-level heartbeat
 * bounds (same trade-off as the legacy engine executor).
 */
export function mapChainSubtaskToExecuteInput(opts: {
  subtask: ChainSubtask;
  inputArtifacts?: readonly NamedArtifact[];
  now?: () => Date;
  defaultDeadlineMs?: number;
}): { input: ExecuteInput; signal: AbortSignal } {
  const now = (opts.now ?? (() => new Date()))();
  const deadlineMs = opts.subtask.deadlineAt
    ? Math.max(0, Date.parse(opts.subtask.deadlineAt) - now.getTime())
    : opts.defaultDeadlineMs ?? MAP_DEFAULT_DEADLINE_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  // Do not keep the event loop alive waiting for a deadline that never fires.
  timer.unref?.();

  return {
    input: {
      skillId: normalizeSkillId(opts.subtask.requiredSkill),
      objective: opts.subtask.objective,
      inputArtifacts: opts.inputArtifacts ?? [],
      costCeilingUsd: opts.subtask.costCeilingUsd ?? 0,
      deadlineMs,
      correlationId: `${opts.subtask.chainId}:${opts.subtask.subtaskId}`,
      signal: controller.signal,
    },
    signal: controller.signal,
  };
}

/**
 * `SignedAgentResult.skillId` must match `^[a-z][a-z0-9_-]{1,63}$`, but
 * `ChainSubtask.requiredSkill` is a free string (LLM plans can emit "Data
 * Analysis" or "UI Design"). Normalize at the MAP boundary so an uppercase or
 * spaced skill tag cannot fail the result-schema parse after a successful run.
 */
export function normalizeSkillId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const withPrefix = /^[a-z]/.test(slug) ? slug : `skill-${slug}`;
  return withPrefix.slice(0, 64);
}

/**
 * Adapter `buildPrompt` that preserves the legacy prompt's mandate surface:
 * `subtask.constraints`, `requiredRole`, `threadId`, and the brief/report
 * deliverable-policy constraints. The `OpenClawAdapter` default prompt only
 * renders skill hint + objective + artifacts, so without this a `useMAP`
 * worker silently ignores chain constraints (design §3.4 / §6.5).
 */
export function buildSubtaskPromptForAdapter(subtask: ChainSubtask) {
  return (input: ExecuteInput): string => buildOpenClawSubtaskPrompt(subtask, input.inputArtifacts);
}

export interface ResultArtifacts {
  /** First convertible block, for the legacy `artifactFragment` channel. */
  artifactFragment?: Artifact;
  /** Keyed outputs for Phase 53 handoff / worker finals. Capped at CHAIN_NAMED_ARTIFACTS_MAX. */
  namedArtifacts: NamedArtifact[];
  /** Human-readable reasons blocks were dropped (e.g. non-record structured data). */
  skipped: string[];
}

/**
 * Convert a `SignedAgentResult`'s typed `ContentBlock[]` into the
 * `ChainSubtaskPartial` artifact channels. Structured blocks are converted
 * only when their `data` is a plain record (the protocol's
 * `StructuredArtifactSchema.data` requires `Record<string, unknown>`);
 * otherwise the block is dropped and reported in `skipped`.
 */
export function contentBlocksToResultArtifacts(
  blocks: readonly ContentBlock[],
): ResultArtifacts {
  const namedArtifacts: NamedArtifact[] = [];
  const skipped: string[] = [];
  let artifactFragment: Artifact | undefined;

  for (let i = 0; i < blocks.length; i += 1) {
    if (namedArtifacts.length >= CHAIN_NAMED_ARTIFACTS_MAX) {
      skipped.push(`block ${i} (artifact cap ${CHAIN_NAMED_ARTIFACTS_MAX})`);
      continue;
    }
    const block = blocks[i];
    let artifact: Artifact | undefined;
    if (block.kind === "text") {
      artifact = createTextArtifact({
        content: block.text.slice(0, MAP_TEXT_ARTIFACT_MAX),
        mimeType: block.mimeType,
      });
    } else if (block.kind === "file") {
      artifact = createFileArtifact({
        vaultPath: block.vaultPath,
        contentHash: block.contentHash,
        displayName: block.displayName,
        mimeType: block.mimeType,
      });
    } else if (block.kind === "image") {
      artifact = createFileArtifact({
        vaultPath: block.vaultPath,
        contentHash: block.contentHash,
        displayName: block.altText,
        mimeType: block.mimeType,
      });
    } else if (block.kind === "structured") {
      if (isPlainRecord(block.data)) {
        artifact = createStructuredArtifact({
          schemaRef: block.schemaRef,
          data: block.data,
        });
      } else {
        skipped.push(`block ${i} (structured data is not a record)`);
      }
    }
    if (!artifact) continue;
    const key = namedArtifacts.length === 0 ? "result" : `result.${namedArtifacts.length + 1}`;
    namedArtifacts.push({ key, artifact });
    if (!artifactFragment) artifactFragment = artifact;
  }

  return { artifactFragment, namedArtifacts, skipped };
}

/**
 * Reconstruct the normalized `ContentBlock[]` a worker produced from the
 * `ChainSubtaskPartial` artifact channels. This is the inverse of
 * `contentBlocksToResultArtifacts`, so MAP partials and legacy partials flow
 * through the same merge-step currency (`ContentBlock[]`) no matter which
 * executor produced them.
 *
 * Lossy edges (mirror of the forward map): `image` blocks were flattened to
 * `file` artifacts on the wire, and text was clipped at the wire artifact max.
 * The vault path + hash and the clipped text survive.
 */
export function resultArtifactsToContentBlocks(partial: ChainSubtaskPartial): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const fragment = partial.artifactFragment;
  if (fragment && typeof fragment === "object" && (fragment as { kind?: unknown }).kind !== "composite") {
    pushContentBlock(blocks, fragment);
  }
  for (const named of partial.namedArtifacts ?? []) {
    const artifact = named?.artifact;
    if (artifact && typeof artifact === "object" && (artifact as { kind?: unknown }).kind !== "composite") {
      pushContentBlock(blocks, artifact);
    }
  }
  return blocks;
}

/** Shape-checked block reconstruction — the wire schema is a loose sync copy. */
function pushContentBlock(out: ContentBlock[], artifact: unknown): void {
  if (artifact && typeof artifact === "object" && (artifact as { kind?: unknown }).kind === "text") {
    // Text artifacts carry `content`; text blocks carry `text`. Remap here —
    // the only field-name difference between the two shapes.
    const t = artifact as { content?: unknown; mimeType?: unknown };
    if (typeof t.content === "string") {
      out.push({
        kind: "text",
        text: t.content,
        mimeType: typeof t.mimeType === "string" ? t.mimeType : undefined,
      });
    }
    return;
  }
  const parsed = ContentBlockSchema.safeParse(artifact);
  if (parsed.success) out.push(parsed.data);
}

/**
 * Canonical projection of normalized `ContentBlock[]` to merge-step text.
 * This is the single place that knows how to render a block array, so the
 * merge step (`synthesizeChain`) consumes the blocks themselves and gets a
 * deterministic text view through here — never an opaque per-executor string.
 */
export function contentBlocksToText(blocks: readonly ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "text") {
      parts.push(block.text);
    } else if (block.kind === "file") {
      parts.push(`[file: ${block.vaultPath}]${block.displayName ? ` (${block.displayName})` : ""}`);
    } else if (block.kind === "image") {
      parts.push(`[image: ${block.vaultPath}]${block.altText ? ` (${block.altText})` : ""}`);
    } else {
      // structured — keep the schema ref so the merge prompt can tell data from prose
      try {
        parts.push(`[data: ${block.schemaRef}]\n${JSON.stringify(block.data)}`);
      } catch {
        parts.push(`[data: ${block.schemaRef}]`);
      }
    }
  }
  return parts.join("\n\n");
}

/**
 * Combine multiple verdicts on one result: OR-of-pass, AND-of-fail, default
 * disputed (design §6.2). Empty verdicts = uncertain = `disputed`.
 */
export function combineVerdicts(verdicts: readonly Verdict[]): Verdict["kind"] {
  for (const v of verdicts) if (v.kind === "pass") return "pass";
  for (const v of verdicts) if (v.kind === "fail") return "fail";
  return "disputed";
}

// ---------------------------------------------------------------------------
// Adapter-backed executor
// ---------------------------------------------------------------------------

export interface MapChainSubtaskExecutorInput {
  /** The node's agent peerId (same as `createOpenClawChainSubtaskExecutor`). */
  workerPeerId: string;
  now?: () => Date;
  /** Human label for logs / fail notes, e.g. `"OpenClaw (MAP)"`. */
  engineLabel: string;
  /** Short code returned as `finalNote` when the runtime is not ready. */
  unavailableCode: string;
  /** Whether the wrapped runtime is ready. Mirrors `isOpenClawReady()`. */
  isReady: () => boolean;
  /** The MAP adapter that executes + verifies this node's runtime. */
  adapter: AgentAdapter;
  /**
   * Run `adapter.verify` before finalizing. A `fail` verdict fails the
   * subtask (worker-side advisory gate; the orchestrator still re-verifies
   * and issues the authoritative verdict for reputation in Sprint 2).
   */
  runVerify?: boolean;
  /**
   * Shadow-mode / audit hook. Called once per subtask with the outcome.
   * Never throws into the executor.
   */
  onShadowRecord?: (record: {
    subtaskId: string;
    ok: boolean;
    finalNote?: string;
    verdicts: Verdict[];
    overall: Verdict["kind"] | null;
  }) => void;
  defaultDeadlineMs?: number;
}

/**
 * Build a `ChainWorkerHandlerDeps["executeSubtask"]` that runs through the
 * MAP adapter instead of the legacy `{ isReady, ask }` engine. Emits the
 * same `task.chain.partial` stream (progress + final with named artifacts),
 * so the orchestrator's wire protocol is unchanged.
 */
export function createMapChainSubtaskExecutor(
  input: MapChainSubtaskExecutorInput,
): NonNullable<ChainWorkerHandlerDeps["executeSubtask"]> {
  const runVerify = input.runVerify !== false;

  return async (subtask, onPartial, opts) => {
    let seq = 0;
    const emit = async (
      note: string | undefined,
      isFinal: boolean,
      confidence?: number,
      artifacts?: { artifactFragment?: Artifact; namedArtifacts: NamedArtifact[] },
    ) => {
      seq += 1;
      await onPartial(
        TaskChainPartialPayloadSchema.parse({
          partial: ChainSubtaskPartialSchema.parse({
            version: "0.1",
            subtaskId: subtask.subtaskId,
            chainId: subtask.chainId,
            workerPeerId: input.workerPeerId,
            seq,
            isFinal,
            note: clipChainSubtaskPartialNote(note),
            confidence,
            ...(isFinal && artifacts
              ? {
                  artifactFragment: artifacts.artifactFragment,
                  namedArtifacts: artifacts.namedArtifacts,
                }
              : {}),
            createdAt: (input.now ?? (() => new Date()))().toISOString(),
          }),
        }),
      );
    };

    const record = (
      ok: boolean,
      finalNote: string,
      verdicts: Verdict[],
      overall: Verdict["kind"] | null,
    ) => {
      try {
        input.onShadowRecord?.({ subtaskId: subtask.subtaskId, ok, finalNote, verdicts, overall });
      } catch (err) {
        // An observer must never break the worker.
        chainWarn("exec", "[map] shadow record failed", {
          subtaskId: subtask.subtaskId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    chainLog("exec", `[map] ${input.engineLabel} subtask start`, {
      chainId: subtask.chainId,
      subtaskId: subtask.subtaskId,
      skill: subtask.requiredSkill,
      worker: shortPeerId(input.workerPeerId),
      ready: input.isReady(),
      inputArtifacts: opts?.inputArtifacts?.length ?? 0,
      runtime: input.adapter.runtime,
    });

    if (!input.isReady()) {
      await emit(`AN_ENGINE_FAIL: ${input.engineLabel} is not ready on this node`, true, 0.1);
      chainWarn("exec", `[map] ${input.engineLabel} unavailable`, {
        subtaskId: subtask.subtaskId,
      });
      record(false, input.unavailableCode, [], null);
      return { ok: false, finalNote: input.unavailableCode };
    }

    await emit(`Working on: ${subtask.objective}`, false, 0.3);

    const startedAt = (input.now ?? (() => new Date()))();
    try {
      const { input: executeInput, signal } = mapChainSubtaskToExecuteInput({
        subtask,
        inputArtifacts: opts?.inputArtifacts,
        now: input.now,
        defaultDeadlineMs: input.defaultDeadlineMs,
      });
      if (signal.aborted) {
        await emit(`AN_ENGINE_FAIL: ${input.engineLabel} deadline already expired`, true, 0.1);
        record(false, "map_deadline_expired", [], null);
        return { ok: false, finalNote: "map_deadline_expired" };
      }

      // Validate shape (defense-in-depth; the adapter signs, the orchestrator
      // re-verifies the signature on the wire in Sprint 2 — chain-map cannot
      // verify locally because SignedAgentResult carries no public key).
      const result = SignedAgentResultSchema.parse(await input.adapter.execute(executeInput));

      const verdicts = runVerify ? await input.adapter.verify({ result, objective: subtask.objective }) : [];
      const overall = verdicts.length > 0 ? combineVerdicts(verdicts) : null;

      if (overall === "fail") {
        const firstFail = verdicts.find((v): v is Extract<Verdict, { kind: "fail" }> => v.kind === "fail");
        const reason = firstFail?.reason ?? "no reason";
        await emit(`AN_ENGINE_FAIL: MAP verify failed: ${reason}`, true, 0.1);
        chainWarn("exec", `[map] verify fail`, { subtaskId: subtask.subtaskId, reason });
        record(false, "map_verify_fail", verdicts, overall);
        return { ok: false, finalNote: "map_verify_fail" };
      }

      const artifacts = contentBlocksToResultArtifacts(result.content);
      if (artifacts.namedArtifacts.length === 0) {
        await emit(`AN_ENGINE_FAIL: ${input.engineLabel} returned no usable content`, true, 0.1);
        chainWarn("exec", `[map] empty result`, {
          subtaskId: subtask.subtaskId,
          skipped: artifacts.skipped,
        });
        record(false, "map_empty_result", verdicts, overall);
        return { ok: false, finalNote: "map_empty_result" };
      }

      const durationMs = (input.now ?? (() => new Date()))().getTime() - startedAt.getTime();
      const finalNote = primaryText(result.content) ?? summarizeArtifacts(artifacts);
      const confidence = overall === "pass" ? bestPassScore(verdicts) : 0.85;
      const clipped = clipChainSubtaskPartialNote(finalNote) ?? finalNote;
      await emit(clipped, true, confidence, {
        artifactFragment: artifacts.artifactFragment,
        namedArtifacts: artifacts.namedArtifacts,
      });

      chainLog("exec", `[map] ${input.engineLabel} subtask done`, {
        subtaskId: subtask.subtaskId,
        blocks: result.content.length,
        artifacts: artifacts.namedArtifacts.length,
        verdicts: verdicts.length,
        overall: overall ?? undefined,
        durationMs,
        costUsd: result.metrics.costUsd,
        runtime: result.runtime,
        worker: shortPeerId(result.peerId),
      });
      record(true, clipped, verdicts, overall);
      return { ok: true, finalNote: clipped };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit(`AN_ENGINE_FAIL: ${msg}`, true, 0.1);
      chainWarn("exec", `[map] ${input.engineLabel} error`, {
        subtaskId: subtask.subtaskId,
        error: msg,
      });
      record(false, msg, [], null);
      return { ok: false, finalNote: msg };
    }
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function primaryText(content: readonly ContentBlock[]): string | undefined {
  const block = content.find((b) => b.kind === "text");
  if (!block || block.kind !== "text") return undefined;
  const trimmed = block.text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function summarizeArtifacts(artifacts: ResultArtifacts): string {
  const kinds = artifacts.namedArtifacts.map((n) => artifactKindOf(n.artifact));
  const skipNote = artifacts.skipped.length > 0 ? `; skipped ${artifacts.skipped.join(", ")}` : "";
  return `MAP result: ${kinds.length} block(s) [${kinds.join(", ")}]${skipNote}`;
}

/**
 * `NamedArtifact.artifact` is inferred as `unknown` (the schema-sync copy of
 * `ArtifactSchema` in `agent-network.ts` is a `z.ZodTypeAny` union). Narrow
 * the `kind` discriminator for human-readable summaries.
 */
function artifactKindOf(artifact: unknown): string {
  if (typeof artifact !== "object" || artifact === null || !("kind" in artifact)) {
    return "unknown";
  }
  const kind = (artifact as { kind?: unknown }).kind;
  return typeof kind === "string" ? kind : "unknown";
}

function bestPassScore(verdicts: readonly Verdict[]): number {
  let score = 0.85;
  for (const v of verdicts) if (v.kind === "pass") score = Math.max(score, v.score);
  return score;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
