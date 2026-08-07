/**
 * Phase 41A — LLM decomposition & merge adapter for EnvoyAI/OpenClaw.
 *
 * Provides `createLlmDecompose()` and `createLlmMerge()` callbacks that
 * wire the orchestrator's `llmDecompose` and `llmMerge` hooks to a local
 * LLM provider (EnvoyAI or OpenClaw running on the owner's node).
 *
 * Safety:
 *   - The LLM runs on the owner's hardware, not on worker nodes.
 *   - Workers only see their assigned `objective`, never the full goal.
 *   - Synthesis includes a pre-flight budget check (caller's responsibility).
 *   - All prompts are capped at 48KB (existing semantic firewall limit).
 *
 * @see docs/agent_network.md §13.2 (41A)
 */

import type { ChainSubtask, ChainSubtaskBid, TaskChainPartialPayload } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default system prompt for decomposing goals into subtasks. */
const DECOMPOSE_SYSTEM_PROMPT = `You are a task decomposition engine. Given a natural-language goal,
break it down into a sequence of subtasks. Each subtask must have:
  - requiredSkill: one of [translation, review, search, summarize, analyze, extract, compare, rank]
  - objective: a clear, self-contained description (max 200 chars)
  - costCeilingUsd: estimated cost in USD (0.50–50.00)
  - deadlineMinutes: estimated time in minutes (1–60)

Return ONLY a JSON array. Do not include markdown fences or explanations.
Example: [{"requiredSkill":"search","objective":"Search bonded contacts' vaults","costCeilingUsd":5,"deadlineMinutes":10}]`;

/** Default system prompt for merging partial results into a composite. */
const MERGE_SYSTEM_PROMPT = `You are a report synthesis engine. Given multiple worker contributions
for a task, produce a coherent merged report. Rules:
  - Resolve contradictions by prioritizing more recent contributions.
  - Cite sources by worker index (e.g. [Worker 1]).
  - If contributions disagree, note the disagreement explicitly.
  - Return ONLY a JSON object with fields: { summary, sections, sources }.
  - sections[]: each has { title, body, confidence (0..1) }.
  - sources[]: each has { workerIndex, contributionSummary }.

Do not include markdown fences or explanations.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmDecomposeInput {
  goal: string;
  /** Available capability tags (from the orchestrator's worker pool). */
  availableCapabilities: string[];
  /** Maximum subtask depth (default 2). */
  maxDepth?: number;
}

export type LlmDecomposeSuccess = {
  ok: true;
  subtasks: Pick<ChainSubtask, "requiredSkill" | "objective" | "costCeilingUsd">[];
  estimatedTotalCostUsd: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
};

export type LlmDecomposeFailure = {
  ok: false;
  reason: "empty_goal" | "no_capabilities" | "llm_unavailable" | "parse_failed" | "too_many_subtasks";
  detail?: string;
};

export type LlmDecomposeResult = LlmDecomposeSuccess | LlmDecomposeFailure;

export interface LlmMergeResultSuccess {
  ok: true;
  merged: { summary: string; sections: Array<{ title: string; body: string; confidence: number }>; sources: Array<{ workerIndex: number; contributionSummary: string }> };
  tokenUsage: { promptTokens: number; completionTokens: number };
}

export interface LlmMergeResultFailure {
  ok: false;
  reason: "no_contributions" | "llm_unavailable" | "parse_failed";
  detail?: string;
}

export type LlmMergeResult = LlmMergeResultSuccess | LlmMergeResultFailure;

export interface LlmMergeInput {
  contributions: Array<{
    workerIndex: number;
    partial: TaskChainPartialPayload;
    bid?: ChainSubtaskBid;
  }>;
  goal: string;
}

// See LlmMergeResultSuccess, LlmMergeResultFailure, and LlmMergeResult type above

// ---------------------------------------------------------------------------
// Provider interface — injectable for testing
// ---------------------------------------------------------------------------

export interface LlmProvider {
  /** Send a prompt to the LLM and return the response text. */
  complete(params: { systemPrompt: string; userPrompt: string; maxTokens?: number }): Promise<{
    text: string;
    usage: { promptTokens: number; completionTokens: number };
  }>;
}

// ---------------------------------------------------------------------------
// Token estimation (simple heuristic — replace with real tokenizer later)
// ---------------------------------------------------------------------------

export function estimateTokens(text: string): number {
  // ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

export function estimateSynthesisCostUsd(tokenCount: number): number {
  // Conservative: $0.002 / 1K tokens (GPT-4o-mini pricing)
  return (tokenCount / 1000) * 0.002;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** Maximum subtasks the LLM can return. Prevents runaway decomposition. */
const MAX_SUBTASKS = 12;

/**
 * Create an `llmDecompose` callback compatible with `ChainOrchestratorHandlerDeps`.
 *
 * @param provider - An LLM provider (EnvoyAI client or mock for tests).
 * @param availableCapabilities - Tags the orchestrator can match workers for.
 */
export function createLlmDecompose(
  provider: LlmProvider,
  availableCapabilities: string[],
) {
  return async (goal: string): Promise<LlmDecomposeResult> => {
    if (!goal || goal.trim().length === 0) {
      return { ok: false, reason: "empty_goal" };
    }
    if (availableCapabilities.length === 0) {
      return { ok: false, reason: "no_capabilities" };
    }

    const userPrompt = `Goal: "${goal}"
Available capabilities: ${availableCapabilities.join(", ")}
Maximum subtasks: ${MAX_SUBTASKS}

Decompose this goal into subtasks.`;

    let response: Awaited<ReturnType<LlmProvider["complete"]>>;
    try {
      response = await provider.complete({
        systemPrompt: DECOMPOSE_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 4096,
      });
    } catch (err) {
      return { ok: false, reason: "llm_unavailable", detail: err instanceof Error ? err.message : String(err) };
    }

    // Parse JSON from response
    let parsed: unknown;
    try {
      const trimmed = response.text.trim();
      // Handle markdown fences gracefully
      const jsonStr = trimmed.startsWith("```")
        ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
        : trimmed;
      parsed = JSON.parse(jsonStr);
    } catch {
      return { ok: false, reason: "parse_failed", detail: response.text.slice(0, 200) };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false, reason: "parse_failed", detail: "Response is not an array" };
    }

    if (parsed.length > MAX_SUBTASKS) {
      return { ok: false, reason: "too_many_subtasks", detail: `Got ${parsed.length}, max ${MAX_SUBTASKS}` };
    }

    const subtasks: LlmDecomposeSuccess["subtasks"] = [];
    let totalCost = 0;

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const cap = String((item as any).requiredSkill ?? "").trim();
      const obj = String((item as any).objective ?? "").trim();
      const cost = Number((item as any).costCeilingUsd ?? 1);

      if (!cap || !obj) continue;
      if (!availableCapabilities.includes(cap)) continue; // skip unknown capabilities
      if (cost <= 0 || cost > 50) continue;

      subtasks.push({
        requiredSkill: cap,
        objective: obj.slice(0, 200),
        costCeilingUsd: Math.round(cost * 100) / 100,
      });
      totalCost += cost;
    }

    if (subtasks.length === 0) {
      return { ok: false, reason: "parse_failed", detail: "No valid subtasks extracted" };
    }

    return {
      ok: true,
      subtasks,
      estimatedTotalCostUsd: Math.round(totalCost * 100) / 100,
      tokenUsage: response.usage,
    };
  };
}

// ---------------------------------------------------------------------------
// Adapter for ChainOrchestratorHandlerDeps.llmMerge
// ---------------------------------------------------------------------------

/**
 * Adapts `createLlmMerge()` output to the `ChainOrchestratorHandlerDeps.llmMerge`
 * signature, which expects `WorkerContribution[]` → `{ mergedJson, costUsd }`.
 */
export function createLlmMergeAdapter(provider: LlmProvider) {
  const merge = createLlmMerge(provider);

  return async (input: { contributions: Array<{ subtaskId: string; workerPeerId: string; text: string; confidence: number }> }) => {
    const adapted = input.contributions.map((c, i) => ({
      workerIndex: i + 1,
      partial: {
        partial: {
          version: "0.1" as const,
          subtaskId: c.subtaskId,
          chainId: "",
          workerPeerId: c.workerPeerId,
          seq: 1,
          isFinal: true,
          confidence: c.confidence,
          artifactFragment: c.text,
          createdAt: new Date().toISOString(),
        },
      },
    }));

    const result = await merge({ contributions: adapted });
    if (!result.ok) return { ok: false as const, reason: result.reason };

    return {
      ok: true as const,
      mergedJson: result.merged as unknown as Record<string, unknown>,
      costUsd: estimateSynthesisCostUsd(result.tokenUsage.promptTokens + result.tokenUsage.completionTokens),
    };
  };
}

/**
 * Create an `llmMerge` callback compatible with `ChainOrchestratorHandlerDeps`.
 */
export function createLlmMerge(provider: LlmProvider) {
  return async (input: { contributions: LlmMergeInput["contributions"] }): Promise<LlmMergeResult> => {
    const { contributions } = input;
    if (contributions.length === 0) {
      return { ok: false, reason: "no_contributions" };
    }

    const partsText = contributions.map((c, i) => {
      // c.partial is TaskChainPartialPayload, which has .partial (ChainSubtaskPartial)
      const inner = c.partial.partial;
      const artifact = inner.artifactFragment;
      const partialText = typeof artifact === "string"
        ? artifact
        : artifact !== undefined && artifact !== null
          ? JSON.stringify(artifact)
          : "[no artifact]";
      const confidence = inner.confidence != null ? `${Math.round(inner.confidence * 100)}%` : "N/A";
      return `[Worker ${i + 1}] Confidence: ${confidence}\n${partialText}`;
    }).join("\n\n---\n\n");

    const userPrompt = `Merge these worker contributions into a single report.

Contributions:
${partsText}

Return a JSON object with { summary, sections, sources }.`;

    let response: Awaited<ReturnType<LlmProvider["complete"]>>;
    try {
      response = await provider.complete({
        systemPrompt: MERGE_SYSTEM_PROMPT,
        userPrompt,
        maxTokens: 8192,
      });
    } catch (err) {
      return { ok: false, reason: "llm_unavailable", detail: err instanceof Error ? err.message : String(err) };
    }

    let parsed: unknown;
    try {
      const trimmed = response.text.trim();
      const jsonStr = trimmed.startsWith("```")
        ? trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
        : trimmed;
      parsed = JSON.parse(jsonStr);
    } catch {
      return { ok: false, reason: "parse_failed", detail: response.text.slice(0, 200) };
    }

    const obj = parsed as Record<string, unknown> | null;
    if (!obj || typeof obj.summary !== "string") {
      return { ok: false, reason: "parse_failed", detail: "Missing summary field" };
    }

    return {
      ok: true,
      merged: {
        summary: String(obj.summary),
        sections: Array.isArray(obj.sections)
          ? obj.sections.map((s: any) => ({
              title: String(s.title ?? ""),
              body: String(s.body ?? ""),
              confidence: Math.min(1, Math.max(0, Number(s.confidence ?? 0.5))),
            }))
          : [],
        sources: Array.isArray(obj.sources)
          ? obj.sources.map((s: any) => ({
              workerIndex: Number(s.workerIndex ?? 0),
              contributionSummary: String(s.contributionSummary ?? ""),
            }))
          : [],
      },
      tokenUsage: response.usage,
    };
  };
}
