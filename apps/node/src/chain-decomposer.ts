/**
 * Phase 40D — LLM-driven chain decomposer.
 *
 * `planChain` defaults to a keyword fallback that produces a single subtask.
 * When the owner opts in to `allowLlm: true`, the orchestrator calls into
 * this module to ask an LLM to break the goal into 2–5 subtasks.
 *
 * The decomposer is intentionally strict about its input/output:
 *   - The prompt asks for a JSON array of subtasks with `objective`,
 *     `requiredSkill`, and `depth` (1..3).
 *   - The response is parsed as `ChainSubtask`-shaped JSON, validated by
 *     `ChainSubtaskSchema`, and tagged with `subtaskId`, `chainId`, etc.
 *   - The chain orchestrator enforces depth ≤ 3 separately so this module
 *     can stay focused on prompt engineering + parsing.
 *
 * Provider selection is the owner's job — pass the `ModelProvider[]` built
 * from `buildModelProviders()` and we'll pick the cheapest cloud provider.
 */

import { randomUUID } from "node:crypto";

import {
  type ChainSubtask,
  ChainSubtaskSchema,
} from "@envoymesh/protocol";
import {
  type ModelProvider,
  routeModelRequest,
} from "@envoymesh/models";

import type { ChainAuditSink } from "./chain-inbound-types.js";
import { planPromptAddonForGoal } from "./chain-deliverable-policy.js";

export interface DecomposerInput {
  goal: string;
  /** Maximum number of subtasks to request. Clamped to [1, 5]. */
  maxSubtasks?: number;
}

export type DecomposerResult =
  | {
      ok: true;
      steps: ChainSubtask[];
      modelUsed: string;
      tokensIn: number;
      tokensOut: number;
      planWarnings?: import("./chain-plan-assign.js").PlanAssignWarning[];
      assignmentMode?: import("./chain-plan-assign.js").ChainAssignmentMode;
    }
  | { ok: false; reason: "no_provider" | "firewall" | "model_deny" | "parse_failed" | "empty_goal" | "too_deep" };

export interface CreateLlmDecomposerOptions {
  providers: readonly ModelProvider[];
  /** Audit sink for recording the prompt + outcome. */
  audit?: ChainAuditSink;
  /** Per-call timeout for the LLM roundtrip. Defaults to 30s; Team preview uses 120s. */
  timeoutMs?: number;
  /**
   * Optional roster for plan+assign. When non-empty, the prompt asks the LLM
   * to both decompose and name preferredWorkerPeerId per step.
   */
  getRoster?: () => Promise<
    import("./chain-plan-assign.js").PlanAssignRosterEntry[]
  >;
  /** Skill vs role plan+assign mode (default skill). */
  getAssignmentMode?: () =>
    | Promise<import("./chain-plan-assign.js").ChainAssignmentMode>
    | import("./chain-plan-assign.js").ChainAssignmentMode;
  /** Receives structured plan warnings after materialize (role/skill modes). */
  onPlanMeta?: (meta: {
    warnings: import("./chain-plan-assign.js").PlanAssignWarning[];
    notes?: string;
    assignmentMode: import("./chain-plan-assign.js").ChainAssignmentMode;
  }) => void;
  /** Mandate/chain ids so plan+assign can mint valid ChainSubtask rows. */
  chainContext?: {
    chainId: string;
    chainMandateId: string;
    deadlineAt?: string;
  };
}

export type LlmDecomposer = (
  goal: string,
  callOpts?: { assignmentMode?: import("./chain-plan-assign.js").ChainAssignmentMode },
) => Promise<DecomposerResult>;

/**
 * Construct an `llmDecompose` callback suitable for `ChainOrchestratorHandlerDeps`.
 *
 * The returned function is async, idempotent (safe to call concurrently for
 * different goals), and never throws — failures are surfaced as
 * `{ ok: false, reason }` so the orchestrator can fall back to the keyword
 * decomposer. Prefer `callOpts.assignmentMode` over `getAssignmentMode` so
 * concurrent previews stay request-scoped.
 */
export function createLlmDecomposer(opts: CreateLlmDecomposerOptions): LlmDecomposer {
  if (opts.providers.length === 0) {
    return async () => ({ ok: false, reason: "no_provider" });
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return async (goal: string, callOpts) => {
    if (!goal || goal.trim().length === 0) {
      return { ok: false, reason: "empty_goal" };
    }

    const roster = opts.getRoster ? await opts.getRoster() : [];
    const usePlanAssign = roster.length > 0;
    const rawMode =
      callOpts?.assignmentMode === "role" || callOpts?.assignmentMode === "skill"
        ? callOpts.assignmentMode
        : opts.getAssignmentMode
          ? await opts.getAssignmentMode()
          : "skill";
    const assignmentMode = rawMode === "role" ? "role" : "skill";

    let prompt: string;
    if (usePlanAssign) {
      const { buildPlanAssignPrompt } = await import("./chain-plan-assign.js");
      prompt = buildPlanAssignPrompt(goal, roster, { assignmentMode });
    } else {
      prompt = buildDecomposePrompt(goal, opts);
    }

    let result: Awaited<ReturnType<typeof routeModelRequest>>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        routeModelRequest(
          {
            taskType: usePlanAssign ? "chain.plan_assign" : "chain.decompose",
            prompt,
            sensitivity: "public",
            ownerApproved: true,
          },
          opts.providers,
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("llm_timeout")), timeoutMs);
        }),
      ]);
    } catch {
      return { ok: false, reason: "model_deny" };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    opts.audit?.record({
      type: usePlanAssign ? "chain.plan_assign.llm" : "chain.decompose.llm",
      outcome: result.decision.action === "allow" ? "allow" : "deny",
      intent: usePlanAssign ? "task.chain.plan_assign" : "task.chain.decompose",
      summary: `goal.length=${goal.length} roster=${roster.length} action=${result.decision.action}`,
    });

    if (result.decision.action !== "allow") {
      if (result.decision.reason.startsWith("semantic_firewall")) {
        return { ok: false, reason: "firewall" };
      }
      return { ok: false, reason: "model_deny" };
    }
    if (!result.response) {
      return { ok: false, reason: "model_deny" };
    }

    if (usePlanAssign) {
      const {
        parsePlanAssignResult,
        materializePlanAssignWithMeta,
        hasDependsOnCycle,
      } = await import("./chain-plan-assign.js");
      const parsed = parsePlanAssignResult(result.response.text);
      if (!parsed) return { ok: false, reason: "parse_failed" };
      const chainId = opts.chainContext?.chainId ?? `chain_${randomUUID()}`;
      const chainMandateId =
        opts.chainContext?.chainMandateId ?? `chainmandate_${randomUUID()}`;
      const { subtasks, warnings } = materializePlanAssignWithMeta({
        goal,
        chainId,
        chainMandateId,
        drafts: parsed.steps,
        roster,
        createdAt: new Date().toISOString(),
        deadlineAt: opts.chainContext?.deadlineAt,
        assignmentMode,
        warnings: parsed.warnings,
      });
      if (hasDependsOnCycle(subtasks)) return { ok: false, reason: "parse_failed" };
      if (subtasks.some((s) => s.depth < 1 || s.depth > 3)) {
        return { ok: false, reason: "too_deep" };
      }
      opts.onPlanMeta?.({
        warnings,
        notes: parsed.notes,
        assignmentMode,
      });
      return {
        ok: true,
        steps: subtasks,
        modelUsed: result.response.modelName,
        tokensIn: result.response.usage?.inputTokens ?? 0,
        tokensOut: result.response.usage?.outputTokens ?? 0,
        planWarnings: warnings,
        assignmentMode,
      };
    }

    let rawSteps: unknown;
    try {
      const parsed: unknown = JSON.parse(extractJson(result.response.text));
      rawSteps = parsed;
    } catch {
      return { ok: false, reason: "parse_failed" };
    }
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      return { ok: false, reason: "parse_failed" };
    }
    if (rawSteps.length > 5) rawSteps = (rawSteps as unknown[]).slice(0, 5);

    const chainIdSuffix = randomUUID();
    const baseCreatedAt = new Date().toISOString();
    const subtasks: ChainSubtask[] = [];
    const rawArr = rawSteps as unknown[];
    for (const [i, raw] of rawArr.entries()) {
      const candidate = (raw ?? {}) as Record<string, unknown>;
      const depth = Math.max(1, Math.min(3, Math.floor(Number(candidate.depth ?? 1))));
      const obj: Record<string, unknown> = {
        version: "0.1",
        subtaskId: `subtask_${chainIdSuffix}_${i + 1}`,
        chainId: candidate.chainId ?? `chain_${chainIdSuffix}`,
        chainMandateId: candidate.chainMandateId ?? `chainmandate_${chainIdSuffix}`,
        depth,
        requiredSkill:
          typeof candidate.requiredSkill === "string" && candidate.requiredSkill.length > 0
            ? candidate.requiredSkill
            : "task.execute",
        objective:
          typeof candidate.objective === "string" && candidate.objective.length > 0
            ? candidate.objective
            : goal,
        requestedResult:
          typeof candidate.requestedResult === "string" && candidate.requestedResult.length > 0
            ? candidate.requestedResult
            : `result of: ${candidate.objective ?? goal}`,
        constraints: Array.isArray(candidate.constraints)
          ? candidate.constraints.filter((c) => typeof c === "string")
          : [],
        dependsOn: Array.isArray(candidate.dependsOn)
          ? candidate.dependsOn.filter((d) => typeof d === "string")
          : [],
        costCeilingUsd: typeof candidate.costCeilingUsd === "number" ? candidate.costCeilingUsd : undefined,
        deadlineAt: typeof candidate.deadlineAt === "string" ? candidate.deadlineAt : undefined,
        createdAt: baseCreatedAt,
      };
      try {
        subtasks.push(ChainSubtaskSchema.parse(obj));
      } catch {
        return { ok: false, reason: "parse_failed" };
      }
    }

    if (subtasks.some((s) => s.depth < 1 || s.depth > 3)) {
      return { ok: false, reason: "too_deep" };
    }

    return {
      ok: true,
      steps: subtasks,
      modelUsed: result.response.modelName,
      tokensIn: result.response.usage?.inputTokens ?? 0,
      tokensOut: result.response.usage?.outputTokens ?? 0,
    };
  };
}

/**
 * Build the prompt that asks the LLM to return a JSON array of subtasks.
 * Kept as a separate function so tests can verify the exact prompt without
 * going through the full `createLlmDecomposer` plumbing.
 */
export function buildDecomposePrompt(goal: string, opts: CreateLlmDecomposerOptions): string {
  const max = Math.max(1, Math.min(5, opts.timeoutMs === undefined ? 5 : 5));
  void max;
  return [
    "You are a planning assistant for a multi-agent task system.",
    "Decompose the user's goal into 2–5 subtasks that can each be assigned to a different worker agent.",
    "Return ONLY a JSON array (no prose, no markdown fencing) where each element has:",
    '  - "objective": a single concrete sentence describing what the worker should produce',
    '  - "requiredSkill": one short kebab-case tag, e.g. "research.web", "summarize.text", "code.write"',
    '  - "depth": integer 1 (leaf subtask), 2 (combines 2+ leaves), or 3 (top-level rollup). Use 1 for most subtasks.',
    '  - "constraints": optional array of short strings (max 4 items)',
    '  - "dependsOn": optional array of subtask indices (0-based) this subtask depends on',
    "",
    `User goal: ${JSON.stringify(goal)}`,
    planPromptAddonForGoal(goal).trim(),
    "",
    "Output the JSON array now.",
  ]
    .filter((l) => l.length > 0)
    .join("\n");
}

/**
 * Extract the first JSON object/array from an LLM response. Some models
 * wrap their answer in prose despite being told not to; this is a
 * best-effort salvage so a noisy model doesn't tank the whole flow.
 *
 * MiniMax (and similar reasoning models) often emit `<think>…</think>`
 * before the answer; braces inside that monologue must not win over the
 * real JSON that follows.
 */
export function extractJson(text: string): string {
  const withoutThink = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, " ");
  const trimmed = withoutThink.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed;
  }
  const firstBracket = trimmed.indexOf("[");
  if (firstBracket >= 0) {
    const lastBracket = trimmed.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      return trimmed.slice(firstBracket, lastBracket + 1);
    }
  }
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace >= 0) {
    const lastBrace = trimmed.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }
  }
  return trimmed;
}

/** Test seam: expose the full result type for unit tests. */
export type { DecomposerResult as DecomposerResultForTest };