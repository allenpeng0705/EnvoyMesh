/**
 * Phase 40 — Chain report synthesizer.
 *
 * Aggregates N worker contributions into a single `ChainReport`. Supports four
 * aggregation kinds:
 *
 * - `weighted_concat`  — produce a `composite` artifact; each part carries a
 *                        weight (0..1). Used for multi-perspective summaries
 *                        where the orchestrator assigns higher weight to the
 *                        authoritative worker.
 * - `concatenate`      — simple text concat with double-newline separators;
 *                        no weights; no LLM call. Default for low-stakes chains.
 * - `merge_structured` — invoke an LLM to merge structured (JSON-shape) worker
 *                        artifacts into a single coherent JSON document.
 *                        Requires an LLM provider. Returns ok=false when no
 *                        provider is configured.
 * - `owner_review`     — skip synthesis; the orchestrator produces an
 *                        empty executive summary and emits a `chain.awaiting_owner_review`
 *                        audit event. The owner must call `pinChainReport` or
 *                        `cancelChain` to resolve.
 *
 * **Budget pre-flight:** before any LLM-based synthesis, the synthesizer calls
 * `ledger.synthesisBudgetPreFlight(estimatedUsd)` and refuses to proceed if the
 * synthesis cost would exceed the chain's `maxChainCostUsd`. After completion,
 * `ledger.recordSynthesisSpend(actualUsd)` is called (idempotent).
 *
 * See docs/agent_network.md §7.7.
 */

import {
  ChainReportSchema,
  ChainReportSectionSchema,
  CompositeArtifactPartSchema,
  CompositeArtifactSchema,
  type ChainMandate,
  type ChainReport,
  type ChainReportSection,
  type ChainSubtaskAward,
  type ChainSubtaskBid,
  type ChainSubtaskPartial,
  type CompositeArtifact,
  type CompositeArtifactPart,
  type TextArtifact,
} from "@envoymesh/protocol";

import type { ChainBudgetLedger } from "./chain-budget-ledger.js";

// ---------------------------------------------------------------------------
// Aggregation kinds
// ---------------------------------------------------------------------------

export type AggregationKind =
  | "weighted_concat"
  | "concatenate"
  | "merge_structured"
  | "owner_review";

export const SYNTHESIS_DEFAULT_KIND: AggregationKind = "concatenate";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface WorkerContribution {
  subtaskId: string;
  workerPeerId: string;
  workerOwnerId: string;
  /** Free-text or structured artifact produced by the worker. */
  text: string;
  /** Confidence score [0..1]; used by `weighted_concat` to assign weights. */
  confidence: number;
  /** Award metadata so the report's chainSummary can quote it. */
  award: ChainSubtaskAward;
  /** Optional ordered partials (most recent last). If absent, the contribution's
   *  `text` is used as the terminal value. */
  partials?: ChainSubtaskPartial[];
}

export interface SynthesizeChainReportInput {
  chainMandate: ChainMandate;
  contributions: WorkerContribution[];
  kind?: AggregationKind;
  /** Called only for `merge_structured`. */
  llmMerge?: (input: {
    contributions: WorkerContribution[];
    goal?: string;
  }) => Promise<{
    ok: true;
    mergedJson: Record<string, unknown>;
    costUsd: number;
  } | { ok: false; reason: string }>;
  /** Human goal — passed into LLM merge so the final result matches the ask. */
  goal?: string;
  /** Optional override for "now" (useful in tests). */
  now?: Date;
}

export type SynthesizeChainReportResult =
  | {
      ok: true;
      report: ChainReport;
      compositeArtifact: CompositeArtifact | undefined;
      actualSynthesisCostUsd: number;
      usedKind: AggregationKind;
    }
  | { ok: false; reason: "no_contributions" | "merge_llm_unavailable" | "merge_llm_failed" | "preflight_failed" };

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function synthesizeChainReport(
  ledger: ChainBudgetLedger,
  input: SynthesizeChainReportInput,
): Promise<SynthesizeChainReportResult> {
  if (input.contributions.length === 0) {
    return { ok: false, reason: "no_contributions" };
  }

  const kind = input.kind ?? SYNTHESIS_DEFAULT_KIND;

  // Estimate synthesis cost up-front so the ledger can refuse early.
  const estimate = estimateSynthesisCostUsd(input.contributions, kind);
  const preflight = await ledger.synthesisBudgetPreFlight(estimate);
  if (!preflight.ok) {
    return { ok: false, reason: "preflight_failed" };
  }

  switch (kind) {
    case "weighted_concat":
      return await doWeightedConcat(ledger, input, estimate);
    case "concatenate":
      return await doConcatenate(ledger, input, estimate);
    case "merge_structured":
      return await doMergeStructured(ledger, input, estimate);
    case "owner_review":
      return await doOwnerReview(ledger, input, estimate);
  }
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export function estimateSynthesisCostUsd(
  contributions: WorkerContribution[],
  kind: AggregationKind,
): number {
  const totalChars = contributions.reduce((sum, c) => sum + c.text.length, 0);
  switch (kind) {
    case "concatenate":
    case "weighted_concat":
      // No LLM; cost is the trivial string-aggregation overhead.
      return 0;
    case "merge_structured":
      // Rough heuristic: $0.000001 per character (1µ per char) for an LLM
      // merge call, rounded to 6 decimals.
      return Math.max(0.01, Number((totalChars * 1e-6).toFixed(6)));
    case "owner_review":
      // No LLM; just an audit event.
      return 0;
  }
}

// ---------------------------------------------------------------------------
// weighted_concat — emit a composite artifact
// ---------------------------------------------------------------------------

async function doWeightedConcat(
  ledger: ChainBudgetLedger,
  input: SynthesizeChainReportInput,
  estimatedUsd: number,
): Promise<SynthesizeChainReportResult> {
  const weights = normalizeWeights(input.contributions);
  const parts: CompositeArtifactPart[] = input.contributions.map((c, i) =>
    CompositeArtifactPartSchema.parse({
      subtaskId: c.subtaskId,
      workerPeerId: c.workerPeerId,
      workerOwnerId: c.workerOwnerId,
      weight: weights[i],
      artifact: textArtifact(c.text),
    }),
  );
  const composite = CompositeArtifactSchema.parse({
    kind: "composite",
    parts,
    aggregation: "weighted_concat",
    createdAt: (input.now ?? new Date()).toISOString(),
  });

  // Estimated cost for weighted_concat is 0 (no LLM). Record it (idempotent).
  const spendResult = await ledger.recordSynthesisSpend(0);
  if (!spendResult.ok) {
    return { ok: false, reason: "preflight_failed" };
  }

  const report = buildReport(input, composite, 0, "weighted_concat");
  return { ok: true, report, compositeArtifact: composite, actualSynthesisCostUsd: 0, usedKind: "weighted_concat" };
}

// ---------------------------------------------------------------------------
// concatenate — simple text join
// ---------------------------------------------------------------------------

async function doConcatenate(
  ledger: ChainBudgetLedger,
  input: SynthesizeChainReportInput,
  _estimatedUsd: number,
): Promise<SynthesizeChainReportResult> {
  // Prefer the last worker's cleaned result as the human-facing report.
  // Raw per-subtask dumps stay in sections (UI collapses them by default).
  const executive = pickExecutiveSummary(input.contributions);
  const composite: CompositeArtifact | undefined = undefined;
  const spendResult = await ledger.recordSynthesisSpend(0);
  if (!spendResult.ok) {
    return { ok: false, reason: "preflight_failed" };
  }
  const report = buildReport(
    input,
    composite,
    0,
    "concatenate",
    executive,
  );
  return { ok: true, report, compositeArtifact: composite, actualSynthesisCostUsd: 0, usedKind: "concatenate" };
}

// ---------------------------------------------------------------------------
// merge_structured — LLM-driven JSON merge
// ---------------------------------------------------------------------------

async function doMergeStructured(
  ledger: ChainBudgetLedger,
  input: SynthesizeChainReportInput,
  estimatedUsd: number,
): Promise<SynthesizeChainReportResult> {
  if (!input.llmMerge) {
    return { ok: false, reason: "merge_llm_unavailable" };
  }
  const result = await input.llmMerge({
    contributions: input.contributions,
    goal: input.goal,
  });
  if (!result.ok) {
    return { ok: false, reason: "merge_llm_failed" };
  }
  // Record the actual cost (may differ from the estimate).
  const spendResult = await ledger.recordSynthesisSpend(result.costUsd);
  if (!spendResult.ok) {
    return { ok: false, reason: "preflight_failed" };
  }
  const composite = CompositeArtifactSchema.parse({
    kind: "composite",
    parts: input.contributions.map((c) =>
      CompositeArtifactPartSchema.parse({
        subtaskId: c.subtaskId,
        workerPeerId: c.workerPeerId,
        workerOwnerId: c.workerOwnerId,
        weight: 1 / Math.max(1, input.contributions.length),
        artifact: {
          kind: "structured",
          schemaRef: "subtask-contribution",
          data: { subtaskId: c.subtaskId, content: c.text },
        },
      }),
    ),
    aggregation: "merge_structured",
    createdAt: (input.now ?? new Date()).toISOString(),
  });
  const merged = result.mergedJson as {
    summary?: unknown;
    sections?: Array<{ title?: unknown; body?: unknown }>;
  };
  const executive =
    typeof merged.summary === "string" && merged.summary.trim()
      ? merged.summary.trim()
      : pickExecutiveSummary(input.contributions);
  const llmSections =
    Array.isArray(merged.sections) && merged.sections.length > 0
      ? merged.sections
          .map((s) => ({
            heading: typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Section",
            bodyMarkdown: typeof s.body === "string" ? s.body : "",
          }))
          .filter((s) => s.bodyMarkdown.trim().length > 0)
      : undefined;
  const report = buildReport(
    input,
    composite,
    result.costUsd,
    "merge_structured",
    executive,
    llmSections,
  );
  return {
    ok: true,
    report,
    compositeArtifact: composite,
    actualSynthesisCostUsd: result.costUsd,
    usedKind: "merge_structured",
  };
}

// ---------------------------------------------------------------------------
// owner_review — no synthesis, await human
// ---------------------------------------------------------------------------

async function doOwnerReview(
  ledger: ChainBudgetLedger,
  input: SynthesizeChainReportInput,
  _estimatedUsd: number,
): Promise<SynthesizeChainReportResult> {
  const spendResult = await ledger.recordSynthesisSpend(0);
  if (!spendResult.ok) {
    return { ok: false, reason: "preflight_failed" };
  }
  const report = buildReport(
    input,
    undefined,
    0,
    "owner_review",
    "Owner review required.",
  );
  return { ok: true, report, compositeArtifact: undefined, actualSynthesisCostUsd: 0, usedKind: "owner_review" };
}

// ---------------------------------------------------------------------------
// Internal — build the final ChainReport
// ---------------------------------------------------------------------------

function buildReport(
  input: SynthesizeChainReportInput,
  composite: CompositeArtifact | undefined,
  synthesisCostUsd: number,
  kind: AggregationKind,
  executiveSummaryText?: string,
  /** When set (LLM merge), these replace raw per-subtask sections as the body. */
  primarySections?: Array<{ heading: string; bodyMarkdown: string }>,
): ChainReport {
  const now = input.now ?? new Date();
  const startedAt = Date.parse(input.chainMandate.createdAt);
  const durationMs = Number.isFinite(startedAt)
    ? Math.max(0, now.getTime() - startedAt)
    : 0;

  // Working notes: one section per contribution (UI collapses by default).
  const workingNotes: ChainReportSection[] = input.contributions.map((c, idx) => {
    const cleaned = extractContributionMarkdown(c.text);
    return ChainReportSectionSchema.parse({
      heading: `Working notes · step ${idx + 1}`,
      bodyMarkdown: cleaned,
      citations: [{ subtaskId: c.subtaskId, snippet: cleaned.slice(0, 200) }],
    });
  });

  const sections: ChainReportSection[] = [
    ...(primarySections ?? []).map((s) =>
      ChainReportSectionSchema.parse({
        heading: s.heading,
        bodyMarkdown: s.bodyMarkdown,
        citations: [],
      }),
    ),
    ...workingNotes,
  ];

  const goal = input.goal?.trim();
  return ChainReportSchema.parse({
    version: "0.1",
    chainId: input.chainMandate.chainId,
    chainMandateId: input.chainMandate.chainMandateId,
    orchestratorOwnerId: input.chainMandate.orchestratorOwnerId,
    orchestratorPeerId: input.chainMandate.issuerOwnerId,
    ...(goal ? { goal } : {}),
    pinned: false,
    chainSummary: {
      durationMs,
      subtaskCount: input.contributions.length,
      workerCount: new Set(input.contributions.map((c) => c.workerPeerId)).size,
      workerAllocations: input.contributions.map((c) => ({
        subtaskId: c.subtaskId,
        workerPeerId: c.workerPeerId,
        committedUsd: c.award.acceptedCostUsd,
      })),
      synthesisCostUsd,
    },
    executiveSummary: executiveSummaryText ?? compositeSummary(input, kind),
    executiveArtifact: composite,
    sections,
    recipientRoles: ["human"],
    createdAt: now.toISOString(),
  });
}

function compositeSummary(input: SynthesizeChainReportInput, kind: AggregationKind): string {
  const workers = input.contributions.length;
  return `Chain synthesized (${kind}) from ${workers} contribution(s).`;
}

/** Prefer fenced ```job_result … ``` body when workers used that convention. */
export function extractContributionMarkdown(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  const fenced = /```(?:job_result|result|markdown)?\s*\n([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return raw;
}

/** Last contribution is usually the writer/brief step — use that as the report. */
export function pickExecutiveSummary(contributions: readonly WorkerContribution[]): string {
  if (contributions.length === 0) return "";
  const last = contributions[contributions.length - 1]!;
  const cleaned = extractContributionMarkdown(last.text);
  if (cleaned) return cleaned;
  // Fall back to the longest cleaned contribution.
  let best = "";
  for (const c of contributions) {
    const t = extractContributionMarkdown(c.text);
    if (t.length > best.length) best = t;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Internal — text artifact helper
// ---------------------------------------------------------------------------

function textArtifact(text: string): TextArtifact {
  return { kind: "text", content: text, mimeType: "text/plain" } as TextArtifact;
}

// ---------------------------------------------------------------------------
// Internal — normalize weights (sum = 1.0)
// ---------------------------------------------------------------------------

function normalizeWeights(contributions: WorkerContribution[]): number[] {
  const confidences = contributions.map((c) => Math.max(0, Math.min(1, c.confidence)));
  const total = confidences.reduce((s, w) => s + w, 0);
  if (total === 0) {
    // All zero → distribute evenly.
    return contributions.map(() => 1 / contributions.length);
  }
  return confidences.map((w) => Number((w / total).toFixed(6)));
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { SYNTHESIS_DEFAULT_KIND as SYNTHESIS_DEFAULT_KIND_REEXPORT };
export type { ChainSubtaskBid };