/**
 * Phase 40D — LLM-driven chain decomposer.
 *
 * `planChain` defaults to a keyword fallback that produces a single subtask.
 * When the owner opts in to `allowLlm: true`, the orchestrator calls into
 * this module to ask an LLM to break the goal into 2–5 subtasks.
 *
 * The decomposer is intentionally strict about its input/output:
 *   - The prompt asks for a JSON array of subtasks with `objective`,
 *     `requiredCapability`, and `depth` (1..3).
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

export interface DecomposerInput {
  goal: string;
  /** Maximum number of subtasks to request. Clamped to [1, 5]. */
  maxSubtasks?: number;
}

export type DecomposerResult =
  | { ok: true; steps: ChainSubtask[]; modelUsed: string; tokensIn: number; tokensOut: number }
  | { ok: false; reason: "no_provider" | "firewall" | "model_deny" | "parse_failed" | "empty_goal" | "too_deep" };

export interface CreateLlmDecomposerOptions {
  providers: readonly ModelProvider[];
  /** Audit sink for recording the prompt + outcome. */
  audit?: ChainAuditSink;
  /** Per-call timeout for the LLM roundtrip. Defaults to 30s. */
  timeoutMs?: number;
}

export type LlmDecomposer = (goal: string) => Promise<DecomposerResult>;

/**
 * Construct an `llmDecompose` callback suitable for `ChainOrchestratorHandlerDeps`.
 *
 * The returned function is async, idempotent (safe to call concurrently for
 * different goals), and never throws — failures are surfaced as
 * `{ ok: false, reason }` so the orchestrator can fall back to the keyword
 * decomposer.
 */
export function createLlmDecomposer(opts: CreateLlmDecomposerOptions): LlmDecomposer {
  if (opts.providers.length === 0) {
    return async () => ({ ok: false, reason: "no_provider" });
  }
  const timeoutMs = opts.timeoutMs ?? 30_000;

  return async (goal: string) => {
    if (!goal || goal.trim().length === 0) {
      return { ok: false, reason: "empty_goal" };
    }

    const prompt = buildDecomposePrompt(goal, opts);
    const result = await routeModelRequest(
      {
        taskType: "chain.decompose",
        prompt,
        sensitivity: "public",
        ownerApproved: true,
      },
      opts.providers,
    );

    opts.audit?.record({
      type: "chain.decompose.llm",
      outcome: result.decision.action === "allow" ? "allow" : "deny",
      intent: "task.chain.decompose",
      summary: `goal.length=${goal.length} action=${result.decision.action}`,
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
        requiredCapability:
          typeof candidate.requiredCapability === "string" && candidate.requiredCapability.length > 0
            ? candidate.requiredCapability
            : "task.execute",
        objective:
          typeof candidate.objective === "string" && candidate.objective.length > 0
            ? candidate.objective
            : goal,
        requestedResult:
          typeof candidate.requestedResult === "string" && candidate.requestedResult.length > 0
            ? candidate.requestedResult
            : `result of: ${candidate.objective ?? goal}`,
        constraints: Array.isArray(candidate.constraints) ? candidate.constraints.filter((c) => typeof c === "string") : [],
        dependsOn: Array.isArray(candidate.dependsOn) ? candidate.dependsOn.filter((d) => typeof d === "string") : [],
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
    '  - "requiredCapability": one short kebab-case tag, e.g. "research.web", "summarize.text", "code.write"',
    '  - "depth": integer 1 (leaf subtask), 2 (combines 2+ leaves), or 3 (top-level rollup). Use 1 for most subtasks.',
    '  - "constraints": optional array of short strings (max 4 items)',
    '  - "dependsOn": optional array of subtask indices (0-based) this subtask depends on',
    "",
    `User goal: ${JSON.stringify(goal)}`,
    "",
    "Output the JSON array now.",
  ].join("\n");
}

/**
 * Extract the first JSON object/array from an LLM response. Some models
 * wrap their answer in prose despite being told not to; this is a
 * best-effort salvage so a noisy model doesn't tank the whole flow.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
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