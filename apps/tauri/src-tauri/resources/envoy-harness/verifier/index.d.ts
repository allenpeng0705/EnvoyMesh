/**
 * @envoymesh/envoy-harness — verifier module.
 *
 * Public API:
 * - `runVerifierRules(result, objective, ruleSet)` — run rules.
 * - `combineVerdicts(verdicts)` — combine into one.
 * - `concatText(content)` — concatenate text blocks.
 * - The 6 default rules (kebab-case exports).
 * - `DEFAULT_RULES` — the array of all 6.
 *
 * **Phase 1 scope:** rule engine only. LLM source (§12.3),
 * the 4-source cascade (§12.4), and self-evolution editing the
 * rule set (§13) land in later phases.
 *
 * **Stability:** rule names are stable identifiers. Adding
 * new rules is additive; removing is a major version bump.
 */
export { combineVerdicts, concatText, runVerifierRules, type Verdict, type VerifierRule, } from "./types.js";
export { DEFAULT_RULES, approvalRespectedRule, costReasonableForWorkRule, extractKeywords, meshTaskShapeRule, nonEmptyContentRule, outputMatchesObjectiveRule, sandboxRespectedRule, } from "./rules/index.js";
//# sourceMappingURL=index.d.ts.map