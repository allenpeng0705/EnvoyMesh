/**
 * CrossAgentDisagreementVerifier — the "two-doctor" check (design §6.4).
 *
 * Two different runtimes run the same objective independently. If their
 * conclusions agree (high similarity), pass; partial agreement → partial;
 * disagreement → disputed (human review).
 *
 * **Similarity model:** by default a deterministic, dependency-free token
 * measure (Dice/Jaccard blend over word unigrams with a containment term).
 * The host may inject an embedding-based function later — the class is
 * constructed with an optional `semanticSimilarity` override.
 *
 * **Not cross when both results are from the same runtime** — that degrades
 * to a single-runtime check and returns `disputed` with a signal explaining
 * why, per design §6.4.
 *
 * Design doc: `docs/improving-agent-network.en.md` §6.4, §8.
 */

import type { ContentBlock, SignedAgentResult, Verdict } from "@envoymesh/protocol";

export interface CrossAgentVerifyInput {
  /** The original objective both runtimes were asked to complete. */
  objective: string;
  resultA: SignedAgentResult;
  resultB: SignedAgentResult;
}

/** Pluggable similarity: returns a score in [0, 1]. */
export type SemanticSimilarityFn = (a: string, b: string) => number | Promise<number>;

/** Similarity at/above this is "agreed" → pass. */
export const CROSS_AGENT_PASS_THRESHOLD = 0.85;
/** Similarity in [0.5, 0.85) is partial agreement → partial. */
export const CROSS_AGENT_PARTIAL_THRESHOLD = 0.5;

export class CrossAgentDisagreementVerifier {
  constructor(private readonly semanticSimilarity?: SemanticSimilarityFn) {}

  async verify(input: CrossAgentVerifyInput): Promise<Verdict> {
    if (input.resultA.runtime === input.resultB.runtime) {
      return {
        kind: "disputed",
        needsHuman: true,
        signals: [
          "cross-agent verifier requires two distinct runtimes",
          `both results came from runtime '${input.resultA.runtime}'`,
        ],
      };
    }

    const similarity = await this.measure(
      extractConclusion(input.resultA),
      extractConclusion(input.resultB),
    );

    if (similarity >= CROSS_AGENT_PASS_THRESHOLD) {
      return {
        kind: "pass",
        score: similarity,
        confidence: "high",
        notes: "two runtimes agreed",
      };
    }
    if (similarity >= CROSS_AGENT_PARTIAL_THRESHOLD) {
      return {
        kind: "partial",
        score: similarity,
        reason: `partial agreement across runtimes (similarity ${similarity.toFixed(2)})`,
      };
    }
    return {
      kind: "disputed",
      needsHuman: true,
      signals: [
        `runtime ${input.resultA.runtime} and ${input.resultB.runtime} disagreed`,
        `semantic similarity: ${similarity.toFixed(2)}`,
      ],
    };
  }

  private async measure(a: string, b: string): Promise<number> {
    if (this.semanticSimilarity) return this.semanticSimilarity(a, b);
    return defaultSemanticSimilarity(a, b);
  }
}

/**
 * Extract the conclusion a runtime actually reached:
 * - preferred: the last `text` block;
 * - for structured results: a tagged `summary`/`conclusion` field if present,
 *   else the last text block;
 * - fallback: the whole content JSON.
 */
export function extractConclusion(result: SignedAgentResult): string {
  const lastText = [...result.content].reverse().find((b) => b.kind === "text");
  for (let i = result.content.length - 1; i >= 0; i--) {
    const block = result.content[i];
    if (block?.kind === "structured") {
      const data = block.data as Record<string, unknown> | undefined;
      if (data) {
        for (const key of ["summary", "conclusion", "findings"]) {
          const v = data[key];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      }
    }
  }
  if (lastText?.kind === "text") return lastText.text.trim();
  try {
    return JSON.stringify(result.content);
  } catch {
    return "";
  }
}

/**
 * Deterministic default similarity in [0, 1]: a 50/50 blend of Jaccard
 * (unigram set overlap) and containment (fraction of the smaller conclusion
 * covered by the larger). Two agents that reach the same conclusions on the
 * same task will cover each other heavily even when phrasing differs.
 */
export function defaultSemanticSimilarity(a: string, b: string): number {
  const aSet = tokenize(a);
  const bSet = tokenize(b);
  if (aSet.size === 0 || bSet.size === 0) return 0;
  const smaller = Math.min(aSet.size, bSet.size);
  let overlap = 0;
  for (const token of aSet) if (bSet.has(token)) overlap += 1;
  const jaccard = overlap / (aSet.size + bSet.size - overlap);
  const containment = overlap / smaller;
  return Number(((jaccard + containment) / 2).toFixed(4));
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
  return new Set(tokens);
}
