/**
 * Agent Chain Orchestrator (Phase 24B)
 *
 * Decomposes complex multi-step tasks into subtasks, discovers capability
 * providers for each step, and executes them in sequence.
 * Chain state is tracked via correlationId linking.
 */

import { randomUUID } from "node:crypto";

export interface ChainStep {
  /** Step label (e.g. "translate", "review", "synthesize"). */
  label: string;
  /** Capability tag required for this step. */
  capabilityTag: string;
  /** The input/output transformation description. */
  description: string;
}

export interface ChainProvider {
  ownerId: string;
  peerId: string;
  capabilities: string[];
  reputationScore: number;
}

export interface ChainStepResult {
  stepIndex: number;
  label: string;
  providerOwnerId: string;
  ok: boolean;
  output?: string;
  error?: string;
}

export interface AgentChainResult {
  ok: boolean;
  correlationId: string;
  steps: ChainStepResult[];
  completedSteps: number;
  totalSteps: number;
  finalOutput?: string;
  error?: string;
}

export interface AgentChainDeps {
  /** Find providers matching a capability tag. */
  findProviders: (capabilityTag: string) => Promise<ChainProvider[]>;
  /** Execute a single step on a provider. Returns output text or null on failure. */
  executeStep: (
    provider: ChainProvider,
    step: ChainStep,
    input: string | undefined,
    correlationId: string,
  ) => Promise<string | null>;
}

/**
 * Execute a chain of steps, each dispatched to the best available provider.
 * Steps run sequentially — each step's output feeds the next step's input.
 */
export async function runAgentChain(
  deps: AgentChainDeps,
  steps: ChainStep[],
  initialInput?: string,
  opts?: { maxDepth?: number; timeoutPerStepMs?: number },
): Promise<AgentChainResult> {
  const correlationId = randomUUID();
  const maxDepth = opts?.maxDepth ?? 3;

  const truncatedSteps = steps.slice(0, maxDepth);
  const results: ChainStepResult[] = [];
  let currentInput = initialInput;

  for (let i = 0; i < truncatedSteps.length; i++) {
    const step = truncatedSteps[i];
    const providers = await deps.findProviders(step.capabilityTag);

    if (providers.length === 0) {
      results.push({
        stepIndex: i,
        label: step.label,
        providerOwnerId: "",
        ok: false,
        error: `No providers found for capability "${step.capabilityTag}"`,
      });
      return {
        ok: false,
        correlationId,
        steps: results,
        completedSteps: i,
        totalSteps: truncatedSteps.length,
        error: `Chain failed at step ${i + 1}: no providers for "${step.capabilityTag}"`,
      };
    }

    // Pick the highest-reputation provider
    const bestProvider = providers.sort((a, b) => b.reputationScore - a.reputationScore)[0];

    const output = await deps.executeStep(bestProvider, step, currentInput, correlationId);

    if (output === null) {
      results.push({
        stepIndex: i,
        label: step.label,
        providerOwnerId: bestProvider.ownerId,
        ok: false,
        error: `Step "${step.label}" failed on provider ${bestProvider.ownerId}`,
      });
      return {
        ok: false,
        correlationId,
        steps: results,
        completedSteps: i,
        totalSteps: truncatedSteps.length,
        error: `Chain failed at step ${i + 1}: ${step.label}`,
      };
    }

    results.push({
      stepIndex: i,
      label: step.label,
      providerOwnerId: bestProvider.ownerId,
      ok: true,
      output,
    });

    currentInput = output;
  }

  return {
    ok: true,
    correlationId,
    steps: results,
    completedSteps: truncatedSteps.length,
    totalSteps: truncatedSteps.length,
    finalOutput: currentInput,
  };
}

/**
 * Decompose a natural-language task description into chain steps.
 * Simple keyword-based decomposition for testability.
 * Production would use an LLM.
 */
export function decomposeTask(description: string): ChainStep[] {
  const lower = description.toLowerCase();
  const steps: ChainStep[] = [];

  if (lower.includes("translate") || lower.includes("翻译")) {
    steps.push({
      label: "translate",
      capabilityTag: "translation",
      description: "Translate the input document",
    });
  }
  if (lower.includes("review") || lower.includes("code review") || lower.includes("检查")) {
    steps.push({
      label: "review",
      capabilityTag: "code_review",
      description: "Review the output for quality",
    });
  }
  if (lower.includes("synthesize") || lower.includes("summarize") || lower.includes("合成")) {
    steps.push({
      label: "synthesize",
      capabilityTag: "research_synthesis",
      description: "Synthesize findings into a summary",
    });
  }
  if (lower.includes("convert") || lower.includes("format") || lower.includes("转换")) {
    steps.push({
      label: "convert",
      capabilityTag: "data_conversion",
      description: "Convert data format",
    });
  }

  // Default: if no specific keywords, treat as a single-step task
  if (steps.length === 0) {
    steps.push({
      label: "execute",
      capabilityTag: "task_execute",
      description,
    });
  }

  return steps;
}
